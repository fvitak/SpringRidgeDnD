import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Session id required' }, { status: 400 })

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('sessions')
      .select('id, name, join_token, player_count')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({
      session_id: data.id,
      name: data.name,
      join_token: data.join_token,
      player_count: data.player_count,
    })
  } catch (err) {
    console.error('Failed to fetch session:', err)
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 })
  }
}
