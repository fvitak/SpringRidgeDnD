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
      .select('id, name, join_token, player_count, scenario_id, date_night_mode, current_rating, module_id')
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
      scenario_id: data.scenario_id ?? null,
      date_night_mode: Boolean(data.date_night_mode),
      current_rating: data.current_rating ?? 'PG',
      // module_id is the route-switch marker for the host UI:
      //   NULL → /api/dm-action  (legacy WSC code path)
      //   set  → /api/dm-action-v2 (module-runner code path)
      module_id: (data as { module_id?: string | null }).module_id ?? null,
    })
  } catch (err) {
    console.error('Failed to fetch session:', err)
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 })
  }
}
