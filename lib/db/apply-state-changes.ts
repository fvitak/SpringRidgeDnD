import { supabase } from '@/lib/supabase'
import { upsertGameState } from '@/lib/db/game-state'
import { getOrCreateCombatTurn } from '@/lib/db/combat-turn'
import { applyApDelta, type ApHistoryEntry } from '@/lib/romance/engine'
import type { DMOverride, DMResponse, SceneTransition } from '@/lib/schemas/dm-response'
import {
  parseNarrationCues,
  isCueAlreadyEmitted,
  type KnownEntities,
  type ParsedCue,
} from '@/lib/db/parse-narration-cues'

// ---------------------------------------------------------------------------
// Field routing constants
// ---------------------------------------------------------------------------

const GAME_STATE_FIELDS = new Set([
  'scene',
  'npc_positions',
  'narrative_context',
  'combat_state',
  'pending_roll',
  'current_scene_id',
  'tokens',
])

const TOKEN_FIELDS = new Set([
  'discovered',
  // Visual disambiguation flag for top-down maps. The AI doesn't yet have a
  // prompt rule telling it to manage this — host-side defaults come from
  // the seed migration (20260501000003_token_is_indoor.sql) — but the apply
  // path is wired so a future story (e.g. "Tarric climbs through the back
  // window into Room 1") can flip it cleanly via state_changes. See
  // lib/movement/validate-move.ts MapToken.is_indoor for the visual semantics.
  'is_indoor',
])

const CHARACTER_FIELDS = new Set([
  'hp',
  // Cluster B (POL-15-21-22c): hp_delta is the parser's preferred shape
  // when it auto-emits a damage cue. The parser doesn't know current HP,
  // so it emits a signed delta (`-7`) and the routing branch below
  // resolves the actual new HP by reading the row, clamping to [0, max_hp].
  // Also handles tokens in `game_state.tokens` (NPCs without a characters
  // row) — same negative-delta semantics.
  'hp_delta',
  'condition',
  'inventory',
  'spell_slots',
  'drinks_consumed',
  'position',
  'xp',
  'death_saves_successes',
  'death_saves_failures',
  'is_stable',
  'action_used',
  'bonus_action_used',
  'reaction_used',
  'concentration',
  // Cluster B (POL-15-21-22a): movement is ONLY tracked on the new
  // character_combat_turn ledger — there's no `movement_used` column on
  // `characters`. The routing path below sees this field, looks up the
  // active round from `game_state.combat_state.round`, and writes to the
  // ledger row. If combat is not active, the field is dropped with a warn.
  'movement_used',
])

// Action-economy fields that get dual-written to the new
// `character_combat_turn` ledger (when combat is active) AND the legacy
// `characters.*` columns (for one release per the LE plan). See
// DECISIONS.md 2026-05-03 "active_initiative_index ... per-PC ledger
// table".
const ACTION_ECONOMY_FIELDS = new Set([
  'action_used',
  'bonus_action_used',
  'reaction_used',
  'movement_used',
])

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Optional sidecar payloads that some AI responses ride alongside
 * `state_changes`. They live on the dmResponse but are routed through
 * the same apply step so callers have a single integration point.
 *
 * - `attractionPointChanges` (PIV-04): per-character AP deltas, routed
 *   into `character_romance` (`current_ap` + `ap_history`). Pure additive;
 *   no existing call site is forced to pass this.
 * - `dmOverrides` / `sceneTransition`: reserved for PIV-02b / PIV-06
 *   wiring. Accepted for forward-compatibility so the v2 route can pass
 *   them today; concrete handling lives in those stories.
 */
export interface ApplyExtras {
  attractionPointChanges?: Array<{ character_id: string; delta: number; reason: string }>
  /**
   * Bidirectional rule-of-cool overrides. Logged via the `event_log.ai_response`
   * JSONB blob (the route writes the full DMResponse there). No structured
   * dedicated table for v1 — auditable by querying the JSONB. A future story
   * can promote to a dedicated `dm_overrides_log` if drift surveillance needs it.
   */
  dmOverrides?: DMOverride[]
  /**
   * AI-signaled scene transition. The apply step writes
   * `game_state.current_scene_id = sceneTransition.to_scene_id` so the next
   * turn's per-turn scene context loads the new scene. Without this wire,
   * the runtime can never advance — Zod previously stripped this field on
   * parse, the v2 route's cast read undefined, and progression silently
   * stalled at scene 1. Fixed 2026-05-01.
   */
  sceneTransition?: SceneTransition
}

/**
 * Processes an array of state_changes emitted by the AI DM response and
 * persists them to the appropriate Supabase tables.
 *
 * - scene / npc_positions / narrative_context → game_state row for this session
 * - hp / condition / inventory / spell_slots / drinks_consumed → characters row
 *   matched by character_name = entity within this session
 * - extras.attractionPointChanges → character_romance.current_ap + ap_history
 *
 * Logs a warning for any unrecognised entity/field combo; never throws.
 */
export async function applyStateChanges(
  sessionId: string,
  stateChanges: Array<{ entity: string; field: string; value: unknown }>,
  extras?: ApplyExtras,
): Promise<void> {
  // Romance AP deltas are independent of state_changes, so route them first
  // even when state_changes is empty.
  if (extras?.attractionPointChanges && extras.attractionPointChanges.length > 0) {
    await applyAttractionPointChanges(sessionId, extras.attractionPointChanges)
  }

  // Collect game_state updates so we can batch into a single upsert
  const gameStateUpdates: Record<string, unknown> = {}

  // Scene transitions live alongside state_changes — when the AI signals one,
  // we update game_state.current_scene_id so the next turn loads the new
  // scene's context. Independent of stateChanges length.
  if (extras?.sceneTransition) {
    gameStateUpdates.current_scene_id = extras.sceneTransition.to_scene_id
  }

  // dmOverrides are intentionally not consumed structurally here — they ride
  // the event_log.ai_response JSONB blob, which the v2 route already writes.
  // Querying the event log gives auditable history. If drift surveillance
  // needs a dedicated table, add it as a future story.

  if ((!stateChanges || stateChanges.length === 0) && Object.keys(gameStateUpdates).length === 0) {
    return
  }

  // Cache the active combat round for action-economy routing. Read once
  // up-front so we don't hit game_state every change. `null` means
  // "combat is not active" → action-economy state_changes write only to
  // legacy `characters.*` columns (no ledger row).
  const activeCombatRound = await getActiveCombatRound(sessionId)

  for (const change of stateChanges ?? []) {
    const { entity, field, value } = change

    // -----------------------------------------------------------------------
    // Special case: hp_delta — Cluster B (POL-15-21-22c) parser-emitted shape.
    // The parser doesn't know current HP, so it emits a signed delta. We
    // route to PCs (characters row) first; if no PC matches, we try NPC
    // tokens (game_state.combat_state.initiative[]).
    // -----------------------------------------------------------------------
    if (field === 'hp_delta') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        console.warn(
          `[applyStateChanges] hp_delta for "${entity}" is not a number: ${String(value)}`,
        )
        continue
      }
      await applyHpDelta(sessionId, entity, value)
      continue
    }

    // -----------------------------------------------------------------------
    // Special case: position values can be either narrative (string) or
    // structured grid coords (object). Strings update the character's text
    // position; objects update the token in game_state.tokens (creating one if
    // it doesn't exist).
    // -----------------------------------------------------------------------
    if (field === 'position') {
      if (value && typeof value === 'object') {
        await applyTokenPositionChange(sessionId, entity, value as Record<string, unknown>)
      } else if (typeof value === 'string') {
        await applyCharacterChange(sessionId, entity, 'position', value)
      } else {
        console.warn(`[applyStateChanges] Unrecognised position value for "${entity}":`, value)
      }
      continue
    }

    // -----------------------------------------------------------------------
    // Route: per-token flags on game_state.tokens (discovered, etc.)
    // -----------------------------------------------------------------------
    if (TOKEN_FIELDS.has(field)) {
      await applyTokenFieldChange(sessionId, entity, field, value)
      continue
    }

    // -----------------------------------------------------------------------
    // Route: game_state fields
    // -----------------------------------------------------------------------
    if (GAME_STATE_FIELDS.has(field)) {
      // npc_positions is stored as active_npcs JSONB in the DB
      const dbField = field === 'npc_positions' ? 'active_npcs' : field
      gameStateUpdates[dbField] = value
      continue
    }

    // -----------------------------------------------------------------------
    // Route: action-economy fields (dual-write to legacy + new ledger)
    //
    // When combat is active, we want the per-round audit trail in
    // `character_combat_turn`. We also keep populating the legacy
    // `characters.{action_used,bonus_action_used,reaction_used}` columns
    // for one release (dual-write per LE plan; drops in a follow-up
    // migration after a Blackthorn playtest verifies the new path).
    //
    // `movement_used` only ever goes to the new ledger — there's no
    // legacy column to dual-write into.
    //
    // Outside combat: action_used/bonus_action_used/reaction_used still
    // hit the legacy columns (some legacy code paths read them); the
    // new ledger row is NOT created — there's no round to scope it to.
    // movement_used outside combat is dropped with a warn (no place
    // for it).
    // -----------------------------------------------------------------------
    if (ACTION_ECONOMY_FIELDS.has(field)) {
      await applyActionEconomyChange(
        sessionId,
        entity,
        field,
        value,
        activeCombatRound,
      )
      continue
    }

    // -----------------------------------------------------------------------
    // Route: character fields
    // -----------------------------------------------------------------------
    if (CHARACTER_FIELDS.has(field)) {
      await applyCharacterChange(sessionId, entity, field, value)
      continue
    }

    // -----------------------------------------------------------------------
    // Unrecognised — warn but don't throw
    // -----------------------------------------------------------------------
    console.warn(
      `[applyStateChanges] Unrecognised field "${field}" for entity "${entity}" — skipped.`
    )
  }

  // Flush any accumulated game_state changes
  if (Object.keys(gameStateUpdates).length > 0) {
    await upsertGameState(sessionId, gameStateUpdates)
  }
}


// ---------------------------------------------------------------------------
// Token field handler — for non-position flags (e.g. discovered) targeting a
// specific token in game_state.tokens. Matches by case-insensitive name.
// ---------------------------------------------------------------------------

async function applyTokenFieldChange(
  sessionId: string,
  entity: string,
  field: string,
  value: unknown,
): Promise<void> {
  const { data: stateRow, error: fetchErr } = await supabase
    .from('game_state')
    .select('tokens')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (fetchErr) {
    console.warn('[applyStateChanges] Failed to read game_state.tokens:', fetchErr.message)
    return
  }

  const tokens: Array<Record<string, unknown>> = Array.isArray(stateRow?.tokens) ? [...stateRow!.tokens] : []
  const idx = tokens.findIndex((t) => {
    if (typeof t.id === 'string' && t.id.toLowerCase() === entity.toLowerCase()) return true
    if (typeof t.name === 'string' && t.name.toLowerCase() === entity.toLowerCase()) return true
    return false
  })
  if (idx < 0) {
    console.warn(`[applyStateChanges] No token "${entity}" to update field "${field}".`)
    return
  }
  tokens[idx] = { ...tokens[idx], [field]: value }
  await upsertGameState(sessionId, { tokens })
}

// ---------------------------------------------------------------------------
// Token position handler — for structured grid moves emitted by the AI.
// Updates game_state.tokens[i] in place when token_id (or character name)
// matches; appends a new minimal token entry if none exists yet.
// ---------------------------------------------------------------------------

interface TokenLite {
  id?: string
  name?: string
  x?: number
  y?: number
  [k: string]: unknown
}

async function applyTokenPositionChange(
  sessionId: string,
  entity: string,
  value: Record<string, unknown>
): Promise<void> {
  const newX = typeof value.x === 'number' ? value.x : null
  const newY = typeof value.y === 'number' ? value.y : null
  if (newX === null || newY === null) {
    console.warn(`[applyStateChanges] structured position missing x/y for "${entity}":`, value)
    return
  }
  const tokenId = typeof value.token_id === 'string' ? value.token_id : null

  const { data: stateRow, error: fetchErr } = await supabase
    .from('game_state')
    .select('tokens')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (fetchErr) {
    console.warn('[applyStateChanges] Failed to read game_state.tokens:', fetchErr.message)
    return
  }

  const tokens: TokenLite[] = Array.isArray(stateRow?.tokens) ? [...stateRow!.tokens] : []

  // Match by token_id first, then by case-insensitive name, then by character_id.
  const idx = tokens.findIndex((t) => {
    if (tokenId && t.id === tokenId) return true
    if (typeof t.name === 'string' && t.name.toLowerCase() === entity.toLowerCase()) return true
    return false
  })

  if (idx >= 0) {
    tokens[idx] = { ...tokens[idx], x: newX, y: newY }
  } else {
    tokens.push({
      id: tokenId ?? `auto-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      name: entity,
      x: newX,
      y: newY,
      kind: 'npc',
      is_friendly: false,
    })
  }

  await upsertGameState(sessionId, { tokens })
}

// ---------------------------------------------------------------------------
// Character field handler
// ---------------------------------------------------------------------------

async function applyCharacterChange(
  sessionId: string,
  entity: string,
  field: string,
  value: unknown
): Promise<void> {
  // Look up the character by name within this session
  const { data: character, error: fetchError } = await supabase
    .from('characters')
    .select('id, conditions')
    .eq('session_id', sessionId)
    .ilike('character_name', entity)
    .maybeSingle()

  if (fetchError) {
    console.warn(
      `[applyStateChanges] Failed to fetch character "${entity}": ${fetchError.message}`
    )
    return
  }

  if (!character) {
    console.warn(
      `[applyStateChanges] No character named "${entity}" found in session "${sessionId}" — skipped.`
    )
    return
  }

  // Build the update payload, with special handling for `condition`
  let updatePayload: Record<string, unknown>

  if (field === 'condition') {
    // value may be a single string (add to array) or a full array (replace)
    if (Array.isArray(value)) {
      updatePayload = { conditions: value }
    } else if (typeof value === 'string') {
      const existing: string[] = Array.isArray(character.conditions)
        ? character.conditions
        : []
      // Avoid duplicates
      if (!existing.includes(value)) {
        updatePayload = { conditions: [...existing, value] }
      } else {
        return // nothing to do
      }
    } else {
      console.warn(
        `[applyStateChanges] Unexpected value type for condition on "${entity}": ${typeof value}`
      )
      return
    }
  } else {
    updatePayload = { [field]: value }
  }

  const { error: updateError } = await supabase
    .from('characters')
    .update(updatePayload)
    .eq('id', character.id)

  if (updateError) {
    console.warn(
      `[applyStateChanges] Failed to update ${field} for character "${entity}": ${updateError.message}`
    )
  }
}

// ---------------------------------------------------------------------------
// HP delta handler (Cluster B, POL-15-21-22c) — parser-friendly route.
// ---------------------------------------------------------------------------

/**
 * Apply a signed HP delta to either a PC (characters row) or an NPC
 * (token in game_state.combat_state.initiative[]). Reads current HP,
 * clamps the result to [0, max_hp], writes back the new absolute HP.
 *
 * Used by the narration-cue parser when the AI narrates damage but does
 * not emit a corresponding `hp` state_change. The parser can't compute
 * the post-damage absolute (it doesn't know the current HP), so it emits
 * a delta and we resolve it here.
 *
 * Match order:
 *   1. PC by `characters.character_name` (case-insensitive, scoped to session).
 *   2. NPC by `combat_state.initiative[].name` (case-insensitive).
 *
 * If neither resolves, log a warn and drop. The parser only emits cues
 * for entities it found in `KnownEntities`, so a miss here is unusual.
 */
async function applyHpDelta(
  sessionId: string,
  entity: string,
  delta: number,
): Promise<void> {
  // 1. Try PC first.
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select('id, hp, max_hp')
    .eq('session_id', sessionId)
    .ilike('character_name', entity)
    .maybeSingle()

  if (charErr) {
    console.warn(
      `[applyStateChanges] hp_delta lookup failed for PC "${entity}": ${charErr.message}`,
    )
    // fall through to NPC path
  }

  if (character) {
    const currentHp = typeof character.hp === 'number' ? character.hp : 0
    const maxHp = typeof character.max_hp === 'number' ? character.max_hp : currentHp
    const newHp = Math.max(0, Math.min(maxHp, currentHp + delta))
    const { error: updErr } = await supabase
      .from('characters')
      .update({ hp: newHp })
      .eq('id', character.id)
    if (updErr) {
      console.warn(
        `[applyStateChanges] failed to write hp_delta for PC "${entity}": ${updErr.message}`,
      )
    }
    return
  }

  // 2. Try NPC in combat_state.initiative.
  const { data: stateRow, error: gsErr } = await supabase
    .from('game_state')
    .select('combat_state')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (gsErr) {
    console.warn(
      `[applyStateChanges] hp_delta NPC lookup failed for "${entity}": ${gsErr.message}`,
    )
    return
  }

  const cs = (stateRow?.combat_state ?? null) as
    | { initiative?: Array<{ name?: string; hp?: number; max_hp?: number; conditions?: string[] }> }
    | null
  if (!cs || !Array.isArray(cs.initiative)) {
    console.warn(
      `[applyStateChanges] hp_delta could not resolve "${entity}" — no PC row, no combat_state.initiative.`,
    )
    return
  }

  const idx = cs.initiative.findIndex(
    (e) => typeof e.name === 'string' && e.name.toLowerCase() === entity.toLowerCase(),
  )
  if (idx < 0) {
    console.warn(
      `[applyStateChanges] hp_delta could not resolve "${entity}" against PC names or initiative entries.`,
    )
    return
  }
  const entry = cs.initiative[idx]
  const currentHp = typeof entry.hp === 'number' ? entry.hp : 0
  const maxHp = typeof entry.max_hp === 'number' ? entry.max_hp : currentHp
  const newHp = Math.max(0, Math.min(maxHp, currentHp + delta))
  const updatedInitiative = cs.initiative.map((e, i) =>
    i === idx ? { ...e, hp: newHp } : e,
  )
  await upsertGameState(sessionId, {
    combat_state: { ...cs, initiative: updatedInitiative } as unknown,
  })
}

// ---------------------------------------------------------------------------
// Cue-aware wrapper (Cluster B, POL-15-21-22c)
// ---------------------------------------------------------------------------

/**
 * Apply state changes WITH server-side narration parsing. Wraps
 * `applyStateChanges` and:
 *
 *   1. Reads the entity universe (PC names from `characters`, NPC names
 *      from `combat_state.initiative[]`).
 *   2. Runs `parseNarrationCues` against `dmResponse.narration`.
 *   3. For every tier-1 cue not already covered by an AI-emitted change,
 *      splices the cue into `state_changes` BEFORE the apply step runs.
 *      Logs a `console.warn` so drift surveillance can count auto-emits.
 *   4. For every tier-2 cue, logs a `console.warn` and does NOT emit.
 *   5. Delegates to `applyStateChanges` with the (possibly augmented) list.
 *
 * The augmented `state_changes[]` is observable in event_log via the AI
 * response JSONB (which the calling route writes verbatim). This wrapper
 * doesn't mutate the AI response — only the apply input.
 *
 * Why a wrapper rather than inline-in-applyStateChanges: the legacy WSC
 * route at /api/dm-action calls `applyStateChanges(state_changes)` with
 * no narration context. Adding the parser there would re-parse legacy
 * responses for entities the WSC prompt doesn't even use. Routes that
 * want the parser opt in via `applyStateChangesWithCues`.
 */
export async function applyStateChangesWithCues(
  sessionId: string,
  dmResponse: DMResponse,
  extras?: ApplyExtras,
  /**
   * Caller-provided state_changes list (may differ from `dmResponse.state_changes`
   * because the v2 route does defensive entity translation upstream). If
   * omitted, falls back to `dmResponse.state_changes`.
   */
  preTranslatedStateChanges?: Array<{ entity: string; field: string; value: unknown }>,
): Promise<{
  appliedStateChanges: Array<{ entity: string; field: string; value: unknown }>
  autoEmittedCues: ParsedCue[]
  warnedCues: ParsedCue[]
}> {
  const baseStateChanges = preTranslatedStateChanges ?? dmResponse.state_changes ?? []
  const entities = await loadKnownEntities(sessionId)
  const cues = parseNarrationCues(dmResponse.narration ?? '', entities)

  const autoEmittedCues: ParsedCue[] = []
  const warnedCues: ParsedCue[] = []

  // Mutable working copy. We avoid mutating the AI response.
  const augmented: Array<{ entity: string; field: string; value: unknown }> = [
    ...baseStateChanges,
  ]

  for (const cue of cues) {
    if (cue.tier === 1) {
      if (isCueAlreadyEmitted(cue, augmented)) {
        // AI already covered it — nothing to do. (Useful: this is the
        // happy-path case where prompt rules in POL-15-21-22d worked.)
        continue
      }
      augmented.push({ entity: cue.entity, field: cue.field, value: cue.value })
      autoEmittedCues.push(cue)
      console.warn(
        `[parser] Auto-emitted: ${cue.field} for ${cue.entity} = ${JSON.stringify(cue.value)} (reason: ${cue.reason})`,
      )
    } else {
      warnedCues.push(cue)
      console.warn(
        `[parser] WARN: detected ${cue.field} cue for ${cue.entity} in narration but no state_change emitted. Source: "${cue.source_text}". Confidence: ${cue.confidence.toFixed(2)}. Reason: ${cue.reason}`,
      )
    }
  }

  await applyStateChanges(sessionId, augmented, extras)

  return { appliedStateChanges: augmented, autoEmittedCues, warnedCues }
}

/**
 * Build the `KnownEntities` map for the parser. PCs from `characters`,
 * NPCs from `combat_state.initiative[]`. Read-only.
 */
async function loadKnownEntities(sessionId: string): Promise<KnownEntities> {
  const pcs: string[] = []
  const npcs: string[] = []

  const { data: charRows, error: charErr } = await supabase
    .from('characters')
    .select('character_name')
    .eq('session_id', sessionId)
  if (charErr) {
    console.warn(
      `[applyStateChanges] failed to load PC names for parser: ${charErr.message}`,
    )
  } else if (Array.isArray(charRows)) {
    for (const r of charRows) {
      if (typeof r.character_name === 'string' && r.character_name.trim() !== '') {
        pcs.push(r.character_name)
      }
    }
  }

  const { data: stateRow, error: gsErr } = await supabase
    .from('game_state')
    .select('combat_state')
    .eq('session_id', sessionId)
    .maybeSingle()
  if (gsErr) {
    console.warn(
      `[applyStateChanges] failed to load combat_state for parser: ${gsErr.message}`,
    )
  } else if (stateRow?.combat_state) {
    const cs = stateRow.combat_state as { initiative?: Array<{ name?: string; is_player?: boolean }> }
    if (Array.isArray(cs.initiative)) {
      for (const e of cs.initiative) {
        if (typeof e.name !== 'string' || e.name.trim() === '') continue
        if (e.is_player === true) continue // already in pcs from characters
        npcs.push(e.name)
      }
    }
  }

  return { pcs, npcs }
}

// ---------------------------------------------------------------------------
// Romance AP deltas (PIV-04, Sprint 4.6)
// ---------------------------------------------------------------------------

/**
 * Apply each `attraction_point_changes[]` entry to the corresponding
 * character_romance row. Resolves `character_id` against either:
 *   - `characters.id` (UUID, exact match), or
 *   - `characters.character_name` (case-insensitive, scoped to the session).
 *
 * Mutates `character_romance.current_ap` + appends to `ap_history` via the
 * pure `applyApDelta` helper from `lib/romance/engine`. The numeric AP
 * never leaves the server — only band labels do, via the GET endpoint.
 *
 * Auto-creates a `character_romance` row if one doesn't exist yet, so the
 * AI doesn't need to know about the romance-intake flow to fire deltas.
 */
async function applyAttractionPointChanges(
  sessionId: string,
  changes: Array<{ character_id: string; delta: number; reason: string }>,
): Promise<void> {
  for (const change of changes) {
    const characterId = await resolveRomanceCharacterId(sessionId, change.character_id)
    if (!characterId) {
      console.warn(
        `[applyStateChanges] Unable to resolve AP target "${change.character_id}" in session "${sessionId}" — skipped.`,
      )
      continue
    }

    // Fetch (and create if missing) the romance row.
    const { data: existing, error: fetchErr } = await supabase
      .from('character_romance')
      .select('id, current_ap, ap_history')
      .eq('character_id', characterId)
      .maybeSingle()
    if (fetchErr) {
      console.warn(
        `[applyStateChanges] Failed to read character_romance for "${characterId}": ${fetchErr.message}`,
      )
      continue
    }

    let currentAp = 0
    let history: ApHistoryEntry[] = []
    if (existing) {
      currentAp = typeof existing.current_ap === 'number' ? existing.current_ap : 0
      history = Array.isArray(existing.ap_history) ? (existing.ap_history as ApHistoryEntry[]) : []
    } else {
      // Auto-create a minimal row so the delta has somewhere to land.
      const { error: insertErr } = await supabase
        .from('character_romance')
        .insert({ character_id: characterId })
      if (insertErr) {
        console.warn(
          `[applyStateChanges] Failed to create character_romance for "${characterId}": ${insertErr.message}`,
        )
        continue
      }
    }

    const { newAp, history_entry } = applyApDelta(
      currentAp,
      change.delta,
      change.reason,
      'roleplay',
    )

    const { error: updateErr } = await supabase
      .from('character_romance')
      .update({
        current_ap: newAp,
        ap_history: [...history, history_entry],
        updated_at: new Date().toISOString(),
      })
      .eq('character_id', characterId)
    if (updateErr) {
      console.warn(
        `[applyStateChanges] Failed to update AP for "${characterId}": ${updateErr.message}`,
      )
    }
  }
}

/**
 * Resolve an AP-target reference — UUID, character name, or slot id — to
 * a `characters.id` UUID for the romance row lookup.
 */
async function resolveRomanceCharacterId(
  sessionId: string,
  ref: string,
): Promise<string | null> {
  // 1. Direct UUID match (covers the AI emitting characters.id verbatim).
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)
  if (looksLikeUuid) {
    const { data } = await supabase
      .from('characters')
      .select('id')
      .eq('session_id', sessionId)
      .eq('id', ref)
      .maybeSingle()
    if (data?.id) return data.id
  }

  // 2. character_name (case-insensitive).
  const { data: byName } = await supabase
    .from('characters')
    .select('id')
    .eq('session_id', sessionId)
    .ilike('character_name', ref)
    .maybeSingle()
  if (byName?.id) return byName.id

  // 3. Slot id ("wynn"/"tarric" → slot 1/2 in Blackthorn's convention).
  const slotByLabel: Record<string, number> = { wynn: 1, tarric: 2 }
  const slot = slotByLabel[ref.toLowerCase()]
  if (typeof slot === 'number') {
    const { data: bySlot } = await supabase
      .from('characters')
      .select('id')
      .eq('session_id', sessionId)
      .eq('slot', slot)
      .maybeSingle()
    if (bySlot?.id) return bySlot.id
  }

  return null
}

// ---------------------------------------------------------------------------
// Action-economy routing helpers (Cluster B, POL-15-21-22a)
// ---------------------------------------------------------------------------

/**
 * Returns the active combat round if combat is currently active for the
 * session, otherwise null. Used by the apply step to decide whether
 * action-economy state_changes also write to `character_combat_turn`.
 *
 * "Combat is active" = `game_state.combat_state.active === true` AND
 * `combat_state.round` is a positive integer. If either is missing or
 * combat is paused/over, returns null and action-economy writes go
 * only to the legacy `characters.*` columns.
 */
async function getActiveCombatRound(sessionId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('game_state')
    .select('combat_state')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (error) {
    console.warn(
      `[applyStateChanges] failed to read combat_state for active-round lookup: ${error.message}`,
    )
    return null
  }

  const cs = (data?.combat_state ?? null) as
    | { active?: boolean; round?: number }
    | null
  if (!cs || cs.active !== true) return null
  if (typeof cs.round !== 'number' || cs.round < 1) return null
  return Math.trunc(cs.round)
}

/**
 * Apply an action-economy state_change. Dual-writes to BOTH the legacy
 * `characters.{action_used,bonus_action_used,reaction_used}` columns
 * (for one release per LE plan) AND the new `character_combat_turn`
 * ledger when combat is active.
 *
 * Behaviour matrix:
 *
 *   field                 combat_active   legacy column   ledger row
 *   --------------------  --------------  --------------  ----------
 *   action_used           true            yes (back-compat)  yes
 *   action_used           false           yes               no (no round to scope to)
 *   bonus_action_used     true            yes               yes
 *   bonus_action_used     false           yes               no
 *   reaction_used         true            yes               yes
 *   reaction_used         false           yes               no
 *   movement_used         true            n/a (no column)   yes
 *   movement_used         false           n/a               no (warned)
 *
 * `entity` is matched against `characters.character_name`
 * (case-insensitive). Non-PC entities (NPCs in `combat_state.initiative`)
 * won't resolve and are silently dropped — NPC turn-tracking is out of
 * scope for this ADR (see DECISIONS.md 2026-05-03).
 */
async function applyActionEconomyChange(
  sessionId: string,
  entity: string,
  field: string,
  value: unknown,
  activeCombatRound: number | null,
): Promise<void> {
  // Resolve to a PC row first. NPCs aren't in the `characters` table so
  // a missing row here means "this isn't a PC" — drop the change with a
  // debug-level warn (the same shape as `applyCharacterChange`).
  const { data: character, error: fetchError } = await supabase
    .from('characters')
    .select('id')
    .eq('session_id', sessionId)
    .ilike('character_name', entity)
    .maybeSingle()

  if (fetchError) {
    console.warn(
      `[applyStateChanges] failed to look up "${entity}" for action-economy change: ${fetchError.message}`,
    )
    return
  }
  if (!character) {
    // Either an NPC (initiative entry) or a typo. NPC action-economy
    // tracking is out of scope; for typos, the LE-blessed warning is
    // the right tier.
    console.warn(
      `[applyStateChanges] no PC named "${entity}" for action-economy field "${field}" — skipped (NPC turn-tracking is out of scope; see DECISIONS.md 2026-05-03).`,
    )
    return
  }

  const isMovement = field === 'movement_used'
  const isBoolFlag = !isMovement // action/bonus/reaction are booleans

  // 1. Legacy column write (action/bonus/reaction only).
  if (isBoolFlag) {
    if (typeof value !== 'boolean') {
      console.warn(
        `[applyStateChanges] expected boolean for "${field}" on "${entity}", got ${typeof value}; coercing.`,
      )
    }
    const { error: legacyErr } = await supabase
      .from('characters')
      .update({ [field]: Boolean(value) })
      .eq('id', character.id)
    if (legacyErr) {
      console.warn(
        `[applyStateChanges] failed to dual-write legacy ${field} for "${entity}": ${legacyErr.message}`,
      )
    }
  }

  // 2. Ledger write — only when combat is active.
  if (activeCombatRound === null) {
    if (isMovement) {
      console.warn(
        `[applyStateChanges] movement_used emitted for "${entity}" but combat is not active — dropped (no round to scope to).`,
      )
    }
    return
  }

  let row: Awaited<ReturnType<typeof getOrCreateCombatTurn>>
  try {
    row = await getOrCreateCombatTurn(sessionId, character.id, activeCombatRound)
  } catch (err) {
    console.warn(
      `[applyStateChanges] failed to get/create character_combat_turn for "${entity}" round ${activeCombatRound}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (isMovement) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      console.warn(
        `[applyStateChanges] expected number for movement_used on "${entity}", got ${typeof value}: ${String(value)}`,
      )
      return
    }
    update.movement_used = Math.max(0, Math.trunc(value))
  } else {
    update[field] = Boolean(value)
  }

  const { error: ledgerErr } = await supabase
    .from('character_combat_turn')
    .update(update)
    .eq('id', row.id)
  if (ledgerErr) {
    console.warn(
      `[applyStateChanges] failed to update character_combat_turn for "${entity}" round ${activeCombatRound}: ${ledgerErr.message}`,
    )
  }
}
