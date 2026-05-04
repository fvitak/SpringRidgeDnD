import { supabase } from '@/lib/supabase'
import { getGameState, upsertGameState } from '@/lib/db/game-state'
import { getOrCreateCombatTurn } from '@/lib/db/combat-turn'

// ---------------------------------------------------------------------------
// Initiative advance helper (Cluster B, POL-15-21-22b)
// ---------------------------------------------------------------------------
//
// Server-authored advance of `combat_state.active_initiative_index` —
// rotates the turn pointer, increments round on wrap, ensures the new
// active PC has a ledger row for this round, and stamps an idempotency
// nonce so retries / network re-fires can't double-advance.
//
// Per the 2026-05-03 ADR ("server is the bookkeeper"), the AI never
// writes the initiative pointer; the server bumps it after each AI turn
// where the active PC's action was consumed. The detection heuristic
// for "turn ended" lives in the v2 route (looks for action_used:true on
// the active PC's name); this helper is purely the bookkeeping.
//
// Reaction reset on round-wrap: reactions are per-round (not per-turn)
// in 5e RAW. The new round's ledger rows start with reaction_used=false
// for every PC; we don't need to mutate previous rounds, but we DO need
// to make sure the new round's row for the new active PC is created
// (or returned with defaults) so the per-turn payload's state-truth
// block can read fresh action-economy fields.
// ---------------------------------------------------------------------------

export interface AdvanceResult {
  /** Always true on a successful advance; false implies the helper returned null. */
  advanced: boolean
  /** Round number after advancing. May be > previous round if we wrapped. */
  new_round: number
  /** Zero-based index of the new active actor in `initiative[]`. */
  new_active_index: number
  /** Resolved from `initiative[new_active_index].name`. */
  new_active_character_name: string
  /** True iff we wrapped to a new round (and reset ledger for round-roll). */
  reaction_reset: boolean
}

/**
 * Advance the initiative pointer for the given session.
 *
 * Returns null when:
 *   - combat is not active, or
 *   - `combat_state.initiative[]` is missing/empty, or
 *   - the same `triggeringEventLogId` was already used to advance (idempotency
 *     guard — see `last_advance_event_log_id` on combat_state).
 *
 * Otherwise:
 *   1. Computes new index `(current + 1) % initiative.length`.
 *   2. If wrapping to 0, increments round.
 *   3. If the new active actor is a PC, ensures their ledger row exists
 *      for the new round (creating with defaults if needed) so the
 *      per-turn state-truth block has fresh action-economy fields.
 *   4. Bumps `snapshot_seq` by 1.
 *   5. Stamps `last_advance_event_log_id` with the triggering id.
 *   6. Writes back via `upsertGameState`.
 */
export async function advanceInitiative(
  sessionId: string,
  triggeringEventLogId: string,
): Promise<AdvanceResult | null> {
  // 1. Read current combat_state.
  let gameState: Awaited<ReturnType<typeof getGameState>> = null
  try {
    gameState = await getGameState(sessionId)
  } catch (err) {
    console.warn(
      `[advanceInitiative] failed to read game_state for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }

  const combatState = (gameState?.combat_state ?? null) as
    | {
        active?: boolean
        round?: number
        initiative?: Array<{
          name: string
          initiative?: number
          hp?: number
          max_hp?: number
          is_player?: boolean
          conditions?: string[]
        }>
        active_initiative_index?: number
        snapshot_seq?: number
        last_advance_event_log_id?: string
        [k: string]: unknown
      }
    | null

  if (!combatState || combatState.active !== true) {
    return null
  }

  const initiative = Array.isArray(combatState.initiative)
    ? combatState.initiative
    : []
  if (initiative.length === 0) {
    return null
  }

  // 2. Idempotency guard — same triggering id ⇒ no-op.
  if (combatState.last_advance_event_log_id === triggeringEventLogId) {
    return null
  }

  // 3. Compute new index + new round.
  const currentIndex =
    typeof combatState.active_initiative_index === 'number' &&
    combatState.active_initiative_index >= 0
      ? combatState.active_initiative_index
      : 0
  const currentRound =
    typeof combatState.round === 'number' && combatState.round >= 1
      ? Math.trunc(combatState.round)
      : 1

  const new_active_index = (currentIndex + 1) % initiative.length
  const wrapped = new_active_index === 0
  const new_round = wrapped ? currentRound + 1 : currentRound
  const reaction_reset = wrapped

  const newActiveEntry = initiative[new_active_index]
  const new_active_character_name = newActiveEntry?.name ?? ''

  // 4. If the new active actor is a PC, make sure they have a ledger row
  //    for the (possibly new) round. New row defaults to all-false /
  //    movement=0 — that's exactly what we want at turn-start.
  if (newActiveEntry?.is_player === true && new_active_character_name) {
    // Resolve PC's character_id by name, scoped to session.
    const { data: pcRow, error: pcErr } = await supabase
      .from('characters')
      .select('id')
      .eq('session_id', sessionId)
      .ilike('character_name', new_active_character_name)
      .maybeSingle()
    if (pcErr) {
      console.warn(
        `[advanceInitiative] failed to look up PC "${new_active_character_name}": ${pcErr.message}`,
      )
    } else if (pcRow?.id) {
      try {
        await getOrCreateCombatTurn(sessionId, pcRow.id, new_round)
      } catch (err) {
        console.warn(
          `[advanceInitiative] failed to create ledger row for "${new_active_character_name}" round ${new_round}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    } else {
      // PC named in initiative but no characters row — possible if the
      // initiative entry is stale or the PC was deleted. Continue
      // advancing; the per-turn state-truth block will surface the
      // missing PC explicitly.
      console.warn(
        `[advanceInitiative] no characters row for PC "${new_active_character_name}" — ledger row not created.`,
      )
    }
  }

  // 5. Build the updated combat_state JSONB. Preserve any fields we
  //    don't explicitly know about — combat_state is shared with the
  //    AI-authored echoes and we don't want to drop them.
  const updatedCombatState = {
    ...combatState,
    round: new_round,
    active_initiative_index: new_active_index,
    snapshot_seq:
      (typeof combatState.snapshot_seq === 'number' ? combatState.snapshot_seq : 0) + 1,
    last_advance_event_log_id: triggeringEventLogId,
  }

  await upsertGameState(sessionId, { combat_state: updatedCombatState })

  return {
    advanced: true,
    new_round,
    new_active_index,
    new_active_character_name,
    reaction_reset,
  }
}
