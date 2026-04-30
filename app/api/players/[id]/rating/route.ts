/**
 * POST /api/players/:id/rating
 *
 * Body: { rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17' }
 *
 * Updates the player's per-character rating preference, recomputes the
 * session's current_rating as the FLOOR (most conservative) of all active
 * preferences, and returns both. The next /api/dm-action call will pick up
 * the new rating via gameStateForPrompt.
 *
 * If the rating moves the session up or down, the route also writes a
 * synthetic "[RATING_CHANGE] ..." line into event_log so the AI sees it on
 * its next turn (Section 7 of the Blackthorn prompt instructs the model to
 * acknowledge with a one-line in-voice nudge).
 */

import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { appendEventLog } from '@/lib/db/event-log'

const RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const
type Rating = (typeof RATINGS)[number]

const RATING_INDEX: Record<Rating, number> = {
  'G': 0, 'PG': 1, 'PG-13': 2, 'R': 3, 'NC-17': 4,
}

function floorRating(values: Rating[]): Rating {
  if (values.length === 0) return 'PG'
  let min: Rating = values[0]
  for (const v of values) {
    if (RATING_INDEX[v] < RATING_INDEX[min]) min = v
  }
  return min
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await params

  let body: { rating?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rating = body.rating as Rating
  if (!RATINGS.includes(rating)) {
    return Response.json({ error: 'Invalid rating' }, { status: 400 })
  }

  const supabase = getSupabase()

  // 1. Update this character's preference
  const { data: char, error: charErr } = await supabase
    .from('characters')
    .update({ rating_preference: rating })
    .eq('id', characterId)
    .select('id, character_name, session_id, rating_preference')
    .single()

  if (charErr || !char) {
    return Response.json({ error: 'Character not found' }, { status: 404 })
  }

  // 2. Recompute session's current rating as floor of all character preferences
  const { data: allChars } = await supabase
    .from('characters')
    .select('rating_preference')
    .eq('session_id', char.session_id)

  const prefs = (allChars ?? [])
    .map((c) => c.rating_preference as Rating)
    .filter((r): r is Rating => RATINGS.includes(r))

  const newSessionRating = floorRating(prefs.length > 0 ? prefs : ([rating] as Rating[]))

  const { data: prevSess } = await supabase
    .from('sessions')
    .select('current_rating, date_night_mode')
    .eq('id', char.session_id)
    .maybeSingle()

  const prevRating: Rating = (prevSess?.current_rating as Rating) ?? 'PG'
  const dateNight = Boolean(prevSess?.date_night_mode)

  await supabase
    .from('sessions')
    .update({ current_rating: newSessionRating })
    .eq('id', char.session_id)

  // 3. If the session rating actually moved, log a synthetic event so the AI
  //    acknowledges it next turn. This is a "system note" — it goes in as a
  //    user-side message tagged [RATING_CHANGE].
  if (newSessionRating !== prevRating && dateNight) {
    try {
      await appendEventLog(
        char.session_id,
        `[RATING_CHANGE] ${char.character_name} set their preference to ${rating}. Session rating is now ${newSessionRating}.`,
        {
          narration: `[Session rating changed: ${prevRating} → ${newSessionRating}]`,
          actions_required: [],
          state_changes: [],
          dm_rolls: [],
        },
      )
    } catch (err) {
      console.warn('Rating-change event log append failed (non-fatal):', err)
    }
  }

  return Response.json({
    ok: true,
    rating_preference: rating,
    session_rating: newSessionRating,
  })
}
