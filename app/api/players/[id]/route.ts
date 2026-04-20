import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Character id is required' }, { status: 400 })
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('characters')
      .select(
        'id, character_name, player_name, class, race, level, xp, hp, max_hp, ac, stats, saving_throws, skills, inventory, spell_slots, conditions, drinks_consumed, personality_traits'
      )
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Character not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Failed to fetch character:', err)
    return NextResponse.json({ error: 'Failed to fetch character' }, { status: 500 })
  }
}
