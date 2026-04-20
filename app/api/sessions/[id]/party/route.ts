import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export interface PartyMember {
  character_name: string
  class: string
  hp: number
  max_hp: number
  conditions: string[]
  drinks_consumed: number
  tolerance_threshold: number
  slot: number
  position: string | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return Response.json({ error: 'Session id is required' }, { status: 400 })
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('characters')
      .select('character_name, class, hp, max_hp, conditions, drinks_consumed, tolerance_threshold, slot, position')
      .eq('session_id', id)
      .order('slot')

    if (error) throw error

    return Response.json(data ?? [])
  } catch (err) {
    console.error('Failed to fetch party:', err)
    return Response.json({ error: 'Failed to fetch party' }, { status: 500 })
  }
}
