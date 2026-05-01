/**
 * POST /api/characters/[id]/pet-peeves
 *
 * Body: { actor: <character_id> }
 *
 * Server-side rolls two d20 Pet Peeves (re-rolling on incompatibility
 * with already-chosen turn-ons or each other, per the PDF page 6 rule).
 * Requires the player to have already POSTed turn-ons.
 *
 * Privacy: `actor` must match the route's character id. The peeves are
 * persisted but NEVER readable by any other viewer (the GET endpoint's
 * shapeForViewer strips them when viewer != id).
 */

import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import {
  assertOwnerOrThrow,
  getOrCreateRomanceRow,
  resolveTablesForCharacter,
} from '../romance/_shared'
import { defaultRng, rollPetPeeves } from '@/lib/romance/engine'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await params
  let body: { actor?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    assertOwnerOrThrow(body.actor ?? null, characterId)
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 403
    return Response.json({ error: (err as Error).message }, { status })
  }

  const { ctx, tables } = await resolveTablesForCharacter(characterId)
  if (!ctx) return Response.json({ error: 'Character not found' }, { status: 404 })
  if (!tables) {
    return Response.json(
      { error: 'Romance subsystem is not enabled for this module.' },
      { status: 400 },
    )
  }

  const row = await getOrCreateRomanceRow(characterId)
  if (!row.chosen_turn_on_rolls || row.chosen_turn_on_rolls.length !== 3) {
    return Response.json(
      { error: 'Choose three turn-ons before rolling pet peeves.' },
      { status: 400 },
    )
  }

  let rolled: number[]
  try {
    rolled = rollPetPeeves(row.chosen_turn_on_rolls, tables, defaultRng)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }

  const supabase = getSupabase()
  const { error } = await supabase
    .from('character_romance')
    .update({ rolled_pet_peeve_rolls: rolled, updated_at: new Date().toISOString() })
    .eq('character_id', characterId)
  if (error) {
    return Response.json({ error: `DB write failed: ${error.message}` }, { status: 500 })
  }

  // Owner-only return shape: the response includes the rolled peeves
  // because this endpoint is owner-gated. The GET endpoint is the
  // privacy chokepoint for partner reads.
  const expanded = rolled.map((r) => {
    const e = tables.pet_peeves.find((t) => t.roll === r)!
    return { roll: e.roll, name: e.name, effect_text: e.effect_text, dice: e.dice }
  })
  return Response.json({ ok: true, pet_peeves: expanded })
}
