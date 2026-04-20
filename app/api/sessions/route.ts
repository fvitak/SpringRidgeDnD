import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  let body: { name?: string; player_count?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = body.name?.trim() || 'The Wild Sheep Chase'
  const player_count = body.player_count ?? 4

  if (![2, 3, 4].includes(player_count)) {
    return Response.json({ error: 'player_count must be 2, 3, or 4' }, { status: 400 })
  }

  const join_token = crypto.randomUUID().slice(0, 8)

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('sessions')
      .insert({ name, status: 'lobby', join_token, player_count })
      .select('id, join_token')
      .single()

    if (error) throw error

    return Response.json({ session_id: data.id, join_token: data.join_token }, { status: 201 })
  } catch (err) {
    console.error('Failed to create session:', err)
    return Response.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
