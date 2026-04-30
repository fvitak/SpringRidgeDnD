import { supabase } from '@/lib/supabase'
import { upsertGameState } from '@/lib/db/game-state'

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
 * Processes an array of state_changes emitted by the AI DM response and
 * persists them to the appropriate Supabase tables.
 *
 * - scene / npc_positions / narrative_context → game_state row for this session
 * - hp / condition / inventory / spell_slots / drinks_consumed → characters row
 *   matched by character_name = entity within this session
 *
 * Logs a warning for any unrecognised entity/field combo; never throws.
 */
export async function applyStateChanges(
  sessionId: string,
  stateChanges: Array<{ entity: string; field: string; value: unknown }>
): Promise<void> {
  if (!stateChanges || stateChanges.length === 0) return

  // Collect game_state updates so we can batch into a single upsert
  const gameStateUpdates: Record<string, unknown> = {}

  for (const change of stateChanges) {
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
