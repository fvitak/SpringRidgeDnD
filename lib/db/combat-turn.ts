import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Per-PC combat turn ledger (Cluster B, POL-15-21-22a)
// ---------------------------------------------------------------------------
//
// One row per character per combat round. Authoritative — read by
// `buildSceneContextBlock` to surface "what has each PC used this round"
// to the AI in the per-turn state-truth block, and read by the mobile
// sheet's action-economy strip + host-UI action picker.
//
// Writers:
//   - `apply-state-changes.ts` writes action_used / bonus_action_used /
//     reaction_used / movement_used when the AI emits the matching
//     state_change AND combat is active.
//   - The initiative-advance helper (POL-15-21-22b, next task) creates
//     a fresh row at the start of each PC's turn with all flags reset.
//
// This file owns the type contract + the idempotent
// `getOrCreateCombatTurn` helper. It explicitly does NOT advance turns
// or mutate flags — that's the apply path / the next task.
// ---------------------------------------------------------------------------

export interface CombatTurnLedger {
  id: string
  session_id: string
  character_id: string
  round: number
  action_used: boolean
  bonus_action_used: boolean
  reaction_used: boolean
  movement_used: number
  legendary_actions_used: number
  created_at: string
  updated_at: string
}

/**
 * Returns the `character_combat_turn` row for the given
 * `(session_id, character_id, round)` triple, creating it with default
 * flags if it doesn't exist. Idempotent — calling twice for the same
 * triple returns the same row.
 *
 * Does NOT mutate flags — callers that want to flip `action_used` etc.
 * must update the row themselves (typically via the apply step). The
 * initiative-advance helper (POL-15-21-22b) is the only caller that
 * creates a row at turn-start; the apply step uses this helper as a
 * "make sure the row exists before I update it" guard.
 *
 * Throws on hard DB errors (so callers see the failure); soft "no row"
 * cases are impossible after the upsert succeeds.
 */
export async function getOrCreateCombatTurn(
  sessionId: string,
  characterId: string,
  round: number,
): Promise<CombatTurnLedger> {
  if (round < 1) {
    throw new Error(
      `[getOrCreateCombatTurn] round must be >= 1; got ${round}`,
    )
  }

  // Try to read first — happy path is "row already exists, just return it."
  const { data: existing, error: readErr } = await supabase
    .from('character_combat_turn')
    .select('*')
    .eq('session_id', sessionId)
    .eq('character_id', characterId)
    .eq('round', round)
    .maybeSingle()

  if (readErr) {
    throw new Error(
      `[getOrCreateCombatTurn] failed to read row for ${characterId} round ${round}: ${readErr.message}`,
    )
  }

  if (existing) {
    return existing as CombatTurnLedger
  }

  // No row yet — insert with defaults. The unique constraint
  // (session_id, character_id, round) makes this safe under concurrent
  // callers (one will win, the other gets a duplicate-key error which we
  // treat as "the other won, re-read the winner").
  const { data: inserted, error: insertErr } = await supabase
    .from('character_combat_turn')
    .insert({
      session_id: sessionId,
      character_id: characterId,
      round,
    })
    .select('*')
    .maybeSingle()

  if (insertErr) {
    // Race-condition recovery: another caller inserted the same row
    // between our read and our insert. Re-read it and return that.
    const isUniqueViolation =
      typeof insertErr.code === 'string' && insertErr.code === '23505'
    if (isUniqueViolation) {
      const { data: raceWinner, error: reReadErr } = await supabase
        .from('character_combat_turn')
        .select('*')
        .eq('session_id', sessionId)
        .eq('character_id', characterId)
        .eq('round', round)
        .maybeSingle()
      if (reReadErr || !raceWinner) {
        throw new Error(
          `[getOrCreateCombatTurn] race-condition re-read failed for ${characterId} round ${round}: ${reReadErr?.message ?? 'no row'}`,
        )
      }
      return raceWinner as CombatTurnLedger
    }
    throw new Error(
      `[getOrCreateCombatTurn] failed to insert row for ${characterId} round ${round}: ${insertErr.message}`,
    )
  }

  if (!inserted) {
    throw new Error(
      `[getOrCreateCombatTurn] insert returned no row for ${characterId} round ${round}`,
    )
  }

  return inserted as CombatTurnLedger
}
