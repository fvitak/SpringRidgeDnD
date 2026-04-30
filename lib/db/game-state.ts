import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// TypeScript interface matching the game_state table
// ---------------------------------------------------------------------------

export interface GameState {
  id?: number
  session_id: string
  scene: string | null
  round: number | null
  combat_active: boolean | null
  active_npcs: unknown | null
  narrative_context: string | null
  combat_state: unknown | null
  pending_roll: unknown | null
  current_scene_id?: string | null
  tokens?: unknown
  updated_at?: string
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetches the single game_state row for the given session.
 * Returns null if no row exists yet.
 */
export async function getGameState(sessionId: string): Promise<GameState | null> {
  const { data, error } = await supabase
    .from('game_state')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch game state: ${error.message}`)
  }

  return data ?? null
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Inserts or updates the game_state row for the given session.
 * Only the fields present in `updates` are written; all others are left as-is.
 */
export async function upsertGameState(
  sessionId: string,
  updates: Partial<GameState>
): Promise<void> {
  const { error } = await supabase
    .from('game_state')
    .upsert(
      { ...updates, session_id: sessionId, updated_at: new Date().toISOString() },
      { onConflict: 'session_id' }
    )

  if (error) {
    throw new Error(`Failed to upsert game state: ${error.message}`)
  }
}
