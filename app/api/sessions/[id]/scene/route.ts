import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export interface SceneNPC {
  name: string
  description: string
  location: string
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('game_state')
    .select('active_npcs, scene')
    .eq('session_id', id)
    .maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const npcs: SceneNPC[] = Array.isArray(data?.active_npcs) ? data.active_npcs : []

  return Response.json({ npcs, scene: data?.scene ?? null })
}
