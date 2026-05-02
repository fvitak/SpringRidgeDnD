import { supabase } from '@/lib/supabase'
import { upsertGameState } from '@/lib/db/game-state'
import { applyApDelta, type ApHistoryEntry } from '@/lib/romance/engine'
import type { DMOverride, SceneTransition } from '@/lib/schemas/dm-response'

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
])

const CHARACTER_FIELDS = new Set([
  'hp',
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

  for (const change of stateChanges ?? []) {
    const { entity, field, value } = change

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
