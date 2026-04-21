import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { SPELL_SLOTS_BY_LEVEL } from '@/lib/data/level-up-rules'

interface LevelUpRequest {
  hpGain: number
  asiChoices?: { stat: string; amount: number }[]
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Character id required' }, { status: 400 })

  let body: LevelUpRequest
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = getSupabase()

  // Fetch current character
  const { data: char, error: fetchErr } = await supabase
    .from('characters')
    .select('level, max_hp, hp, stats, class, xp, spell_slots')
    .eq('id', id)
    .single()

  if (fetchErr || !char) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  const newLevel = char.level + 1
  const newMaxHp = char.max_hp + Math.max(1, body.hpGain)
  const hpGained = newMaxHp - char.max_hp

  // Apply ASI choices to stats
  const newStats = { ...(char.stats as Record<string, number>) }
  if (body.asiChoices) {
    for (const { stat, amount } of body.asiChoices) {
      if (newStats[stat] !== undefined) {
        newStats[stat] = Math.min(20, newStats[stat] + amount)
      }
    }
  }

  // Update spell slots for spellcasters
  const spellSlotTable = SPELL_SLOTS_BY_LEVEL[char.class]
  const newSpellSlots = spellSlotTable?.[newLevel] ?? char.spell_slots

  const { error: updateErr } = await supabase
    .from('characters')
    .update({
      level: newLevel,
      max_hp: newMaxHp,
      hp: char.hp + hpGained, // also heal by the HP gained
      stats: newStats,
      spell_slots: newSpellSlots,
    })
    .eq('id', id)

  if (updateErr) {
    console.error('Level-up update failed:', updateErr)
    return NextResponse.json({ error: 'Failed to apply level-up' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, newLevel, newMaxHp, newSpellSlots })
}
