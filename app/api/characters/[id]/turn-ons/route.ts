/**
 * POST /api/characters/[id]/turn-ons
 *
 * Body: { actor: <character_id>, chosen_rolls: [r1, r2, r3] }
 *
 * Author the player's three Turn-on selections. Validates:
 *   - exactly 3 rolls
 *   - all in the module's `turn_ons` table
 *   - no duplicates
 *   - no within-table incompatibilities (e.g. choosing #1 + #16 if
 *     they list each other as `incompatible_with`)
 *
 * Privacy: `actor` must match the route's character id. Until real
 * auth lands this is the coarse owner-check used by every mutating
 * romance endpoint (see `_shared.ts → assertOwnerOrThrow`).
 */

import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import {
  assertOwnerOrThrow,
  getOrCreateRomanceRow,
  resolveTablesForCharacter,
} from '../romance/_shared'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await params
  let body: { actor?: string; chosen_rolls?: unknown }
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

  const rolls = body.chosen_rolls
  if (!Array.isArray(rolls) || rolls.length !== 3) {
    return Response.json({ error: 'chosen_rolls must be an array of length 3' }, { status: 400 })
  }
  if (!rolls.every((r) => typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 20)) {
    return Response.json({ error: 'each chosen_roll must be a d20 integer 1-20' }, { status: 400 })
  }
  const ints = rolls as number[]
  if (new Set(ints).size !== 3) {
    return Response.json({ error: 'chosen_rolls must be three distinct values' }, { status: 400 })
  }

  const { ctx, tables } = await resolveTablesForCharacter(characterId)
  if (!ctx) return Response.json({ error: 'Character not found' }, { status: 404 })
  if (!tables) {
    return Response.json(
      { error: 'Romance subsystem is not enabled for this module.' },
      { status: 400 },
    )
  }

  // Each roll must exist as a turn_ons table entry.
  for (const r of ints) {
    if (!tables.turn_ons.some((t) => t.roll === r)) {
      return Response.json({ error: `chosen_rolls contains invalid d20 value ${r}` }, { status: 400 })
    }
  }
  // No two chosen turn-ons may list each other as incompatible.
  for (let i = 0; i < ints.length; i++) {
    const a = tables.turn_ons.find((t) => t.roll === ints[i])!
    for (let j = i + 1; j < ints.length; j++) {
      if (a.incompatible_with.includes(ints[j])) {
        return Response.json(
          {
            error: `Turn-ons ${ints[i]} and ${ints[j]} are mutually incompatible.`,
          },
          { status: 400 },
        )
      }
    }
  }

  await getOrCreateRomanceRow(characterId)
  const supabase = getSupabase()
  const { error } = await supabase
    .from('character_romance')
    .update({ chosen_turn_on_rolls: ints, updated_at: new Date().toISOString() })
    .eq('character_id', characterId)
  if (error) {
    return Response.json({ error: `DB write failed: ${error.message}` }, { status: 500 })
  }
  return Response.json({ ok: true, chosen_turn_on_rolls: ints })
}
