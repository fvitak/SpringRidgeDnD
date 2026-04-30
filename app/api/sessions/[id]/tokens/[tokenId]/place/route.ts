import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { upsertGameState } from '@/lib/db/game-state'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tokenId: string }> },
) {
  const { id: sessionId, tokenId } = await params

  let body: { x: number; y: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { x, y } = body
  if (typeof x !== 'number' || typeof y !== 'number') {
    return Response.json({ error: 'x and y are required numbers' }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data: state } = await supabase
    .from('game_state')
    .select('tokens')
    .eq('session_id', sessionId)
    .maybeSingle()

  const tokens: Record<string, unknown>[] = Array.isArray(state?.tokens) ? state.tokens : []
  const idx = tokens.findIndex((t) => t.id === tokenId)
  if (idx === -1) {
    return Response.json({ error: 'Token not found' }, { status: 404 })
  }

  const updated = tokens.map((t, i) => i === idx ? { ...t, x, y } : t)
  await upsertGameState(sessionId, { tokens: updated })

  return Response.json({ ok: true, token: updated[idx] })
}
