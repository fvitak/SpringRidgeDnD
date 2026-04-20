import { NextRequest, NextResponse } from 'next/server'
import { computeCharacter } from '@/lib/character/compute-character'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      playerName,
      characterName,
      classId,
      raceId,
      statAssignments,
      personalityTraits,
      sessionId,
      slot,
    } = body

    if (
      !playerName ||
      !characterName ||
      !classId ||
      !raceId ||
      !statAssignments ||
      !personalityTraits ||
      !sessionId ||
      slot === undefined
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const character = computeCharacter({
      playerName,
      characterName,
      classId,
      raceId,
      statAssignments,
      personalityTraits,
      sessionId,
      slot,
    })

    const { data, error } = await supabase
      .from('characters')
      .insert(character)
      .select('id')
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ character_id: data.id }, { status: 201 })
  } catch (err) {
    console.error('Character creation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
