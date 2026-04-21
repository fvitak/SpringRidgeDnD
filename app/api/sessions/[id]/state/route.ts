import { NextRequest } from 'next/server'
import { getGameState } from '@/lib/db/game-state'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return Response.json({ error: 'Session id is required' }, { status: 400 })
  }

  try {
    const state = await getGameState(id)
    return Response.json(state ?? {})
  } catch (err) {
    console.error('Failed to fetch game state:', err)
    return Response.json({ error: 'Failed to fetch game state' }, { status: 500 })
  }
}
