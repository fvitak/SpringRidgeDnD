/**
 * POST /api/characters/[id]/pet-peeves
 *
 * Body: { actor: <character_id>, d6?: 1-6 }
 *
 * Two flows:
 *  - PIV-07 (current): the player rolls a physical d6 and POSTs the
 *    result. Server fresh-shuffles the eligible pet-peeve pool, takes the
 *    top 6, and picks `top6[d6 - 1]`. Each call rolls ONE peeve. The
 *    second call passes its own d6 — the server reads the already-stored
 *    `rolled_pet_peeve_rolls` to filter incompatible / duplicate peeves
 *    out of the pool, then reshuffles fresh.
 *  - Legacy (no `d6` in body): server auto-rolls two peeves at once via
 *    `rollPetPeeves`. Kept so older callers / tests keep working.
 *
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
import {
  defaultRng,
  pickPetPeeveFromD6,
  rollPetPeeves,
} from '@/lib/romance/engine'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await params
  let body: { actor?: string; d6?: unknown }
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

  // Branch on whether the client provided a d6 (PIV-07 player-rolls flow)
  // or expects the legacy auto-roll-both behaviour.
  const d6Raw = body.d6
  if (typeof d6Raw === 'number') {
    if (!Number.isInteger(d6Raw) || d6Raw < 1 || d6Raw > 6) {
      return Response.json({ error: 'd6 must be an integer 1-6' }, { status: 400 })
    }
    const alreadyRolled = (row.rolled_pet_peeve_rolls ?? []) as number[]
    if (alreadyRolled.length >= 2) {
      return Response.json(
        { error: 'Pet peeves already rolled for this character.' },
        { status: 400 },
      )
    }

    let picked: { roll: number }
    try {
      picked = pickPetPeeveFromD6({
        d6: d6Raw,
        chosenTurnOnRolls: row.chosen_turn_on_rolls,
        excludeRolls: alreadyRolled,
        tables,
        rng: defaultRng,
      })
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 })
    }

    const newRolled = [...alreadyRolled, picked.roll]
    const supabase = getSupabase()
    const { error } = await supabase
      .from('character_romance')
      .update({
        rolled_pet_peeve_rolls: newRolled,
        updated_at: new Date().toISOString(),
      })
      .eq('character_id', characterId)
    if (error) {
      return Response.json({ error: `DB write failed: ${error.message}` }, { status: 500 })
    }

    const e = tables.pet_peeves.find((t) => t.roll === picked.roll)!
    return Response.json({
      ok: true,
      pet_peeve: { roll: e.roll, name: e.name, effect_text: e.effect_text, dice: e.dice },
      rolls_remaining: 2 - newRolled.length,
    })
  }

  // Legacy: auto-roll both peeves at once.
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

  const expanded = rolled.map((r) => {
    const e = tables.pet_peeves.find((t) => t.roll === r)!
    return { roll: e.roll, name: e.name, effect_text: e.effect_text, dice: e.dice }
  })
  return Response.json({ ok: true, pet_peeves: expanded })
}
