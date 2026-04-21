import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Character id is required' }, { status: 400 })

  let body: { inventory?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.inventory) return NextResponse.json({ error: 'inventory required' }, { status: 400 })

  try {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('characters')
      .update({ inventory: body.inventory })
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Failed to update inventory:', err)
    return NextResponse.json({ error: 'Failed to update inventory' }, { status: 500 })
  }
}

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
        'id, session_id, character_name, player_name, class, race, level, xp, hp, max_hp, ac, stats, saving_throws, skills, inventory, spell_slots, conditions, drinks_consumed, personality_traits, death_saves_successes, death_saves_failures, is_stable'
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
