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
])

const CHARACTER_FIELDS = new Set([
  'hp',
  'condition',
  'inventory',
  'spell_slots',
  'drinks_consumed',
  'position',
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
