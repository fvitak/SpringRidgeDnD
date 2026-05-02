/**
 * POST /api/characters/[id]/pet-peeves
 *
 * Body: { actor: <character_id>, d20?: 1-20 }
 *
 * Two flows:
 *  - PIV-07 (current): the player rolls a physical d20 and POSTs the
 *    result. Server does a direct PDF mapping (peeve.roll === d20). If
 *    the peeve is incompatible with the player's chosen turn-ons or
 *    duplicates a previously-rolled peeve, the server returns
 *    `{ rerollNeeded: true, reason }` (HTTP 200 — the player did
 *    nothing wrong, the dice just didn't agree). Otherwise it persists
 *    and returns the resolved peeve.
 *  - Legacy (no `d20` in body): server auto-rolls two peeves at once via
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
  pickPetPeeveFromD20,
  rollPetPeeves,
} from '@/lib/romance/engine'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await params
  let body: { actor?: string; d20?: unknown }
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

  // Branch on whether the client provided a d20 (PIV-07 player-rolls flow)
  // or expects the legacy auto-roll-both behaviour.
  const d20Raw = body.d20
  if (typeof d20Raw === 'number') {
    if (!Number.isInteger(d20Raw) || d20Raw < 1 || d20Raw > 20) {
      return Response.json({ error: 'd20 must be an integer 1-20' }, { status: 400 })
    }
    const alreadyRolled = (row.rolled_pet_peeve_rolls ?? []) as number[]
    if (alreadyRolled.length >= 2) {
      return Response.json(
        { error: 'Pet peeves already rolled for this character.' },
        { status: 400 },
      )
    }

    const result = pickPetPeeveFromD20(
      d20Raw,
      row.chosen_turn_on_rolls,
      alreadyRolled,
      tables,
    )

    if (!result.valid) {
      // The d20 didn't yield a usable peeve. Tell the client to reroll —
      // 200 OK because the player didn't do anything wrong.
      return Response.json({
        ok: true,
        rerollNeeded: true,
        reason: result.reason,
      })
    }

    const newRolled = [...alreadyRolled, result.peeve.roll]
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

    return Response.json({
      ok: true,
      pet_peeve: result.peeve,
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
