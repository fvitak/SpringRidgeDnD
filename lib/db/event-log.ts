import { supabase } from '@/lib/supabase'

/**
 * Appends a row to the event_log table for the given session.
 */
export async function appendEventLog(
  sessionId: string,
  playerInput: string,
  aiResponse: unknown
): Promise<void> {
  const { error } = await supabase.from('event_log').insert({
    session_id: sessionId,
    player_input: playerInput,
    ai_response: aiResponse,
  })

  if (error) {
    throw new Error(`Failed to append event log: ${error.message}`)
  }
}

/**
 * Fetches all event_log rows for the given session, ordered by created_at ascending.
 */
export async function getEventLog(
  sessionId: string
): Promise<Array<{ player_input: string; ai_response: unknown; created_at: string }>> {
  const { data, error } = await supabase
    .from('event_log')
    .select('player_input, ai_response, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch event log: ${error.message}`)
  }

  return data ?? []
}
