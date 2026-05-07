import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/sessions/[id]/combat-turn?character_id=X&round=Y  (POL-25)
// ---------------------------------------------------------------------------
//
// Returns the per-PC per-round action-economy ledger row for a single
// character. Read by the host UI's ActionPicker to know which chips to
// fade. The Cluster B apply path / initiative-advance helper writes to
// this table; this endpoint is a pure read.
//
// Shape: { action_used, bonus_action_used, reaction_used, movement_used }.
// If no row exists yet for this round (PC hasn't acted yet), we return
// the default-zeros object instead of 404 — the picker treats both as
// "nothing used yet, all chips available."
//
// Auth: same as the other host-only endpoints (none today). The picker
// only renders on the host laptop, so this is host-trusted.
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params

  if (!sessionId) {
    return Response.json({ error: 'Session id is required' }, { status: 400 })
  }

  const url = new URL(req.url)
  const characterId = url.searchParams.get('character_id')
  const roundParam = url.searchParams.get('round')

  if (!characterId) {
    return Response.json(
      { error: 'character_id query param is required' },
      { status: 400 },
    )
  }

  const round = roundParam ? Number.parseInt(roundParam, 10) : NaN
  if (!Number.isInteger(round) || round < 1) {
    return Response.json(
      { error: 'round query param must be a positive integer' },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('character_combat_turn')
      .select(
        'action_used, bonus_action_used, reaction_used, movement_used',
      )
      .eq('session_id', sessionId)
      .eq('character_id', characterId)
      .eq('round', round)
      .maybeSingle()

    if (error) throw error

    // No row yet → return defaults. The picker treats this as
    // "everything available; nothing used."
    if (!data) {
      return Response.json({
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        movement_used: 0,
      })
    }

    return Response.json({
      action_used: Boolean(data.action_used),
      bonus_action_used: Boolean(data.bonus_action_used),
      reaction_used: Boolean(data.reaction_used),
      movement_used:
        typeof data.movement_used === 'number' ? data.movement_used : 0,
    })
  } catch (err) {
    console.error('Failed to fetch combat-turn ledger:', err)
    return Response.json(
      { error: 'Failed to fetch combat-turn ledger' },
      { status: 500 },
    )
  }
}
