/**
 * GET /api/characters/[id]/romance/status?viewer=<character_id>
 *
 * Cheap, owner-only endpoint that reports intake-flow completion. The
 * mobile sheet calls this on mount to decide whether to show the intake
 * cards or land directly on the sheet.
 *
 * Privacy: requires `viewer === id`. The intake state is private to the
 * owning player — a partner has no business knowing whether the other
 * player has finished their picks (it would leak a tactical "they
 * picked turn-on #X" signal otherwise via timing).
 *
 * Response shape (owner):
 *   { ok: true, romance_enabled: boolean,
 *     status: { has_turn_ons: boolean, has_pet_peeves: boolean,
 *               has_first_impression: boolean, complete: boolean } }
 *
 * For non-owner viewers, returns 403 with no detail (don't even hint
 * at progress). For modules without a romance subsystem, the status
 * fields are all `false` and `romance_enabled: false`.
 */

import { NextRequest } from 'next/server'
import { getRomanceRow, resolveTablesForCharacter } from '../_shared'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await params
  const url = new URL(req.url)
  const viewer = url.searchParams.get('viewer')
  if (!viewer) {
    return Response.json({ error: 'Missing viewer query param' }, { status: 400 })
  }
  if (viewer !== characterId) {
    return Response.json(
      { error: 'Forbidden: intake status is private to the owning character.' },
      { status: 403 },
    )
  }

  const { ctx, tables } = await resolveTablesForCharacter(characterId)
  if (!ctx) return Response.json({ error: 'Character not found' }, { status: 404 })

  const romanceEnabled = tables !== null
  if (!romanceEnabled) {
    return Response.json({
      ok: true,
      romance_enabled: false,
      status: {
        has_turn_ons: false,
        has_pet_peeves: false,
        has_first_impression: false,
        complete: false,
      },
    })
  }

  const row = await getRomanceRow(characterId)
  const has_turn_ons = !!row && Array.isArray(row.chosen_turn_on_rolls) && row.chosen_turn_on_rolls.length === 3
  const has_pet_peeves = !!row && Array.isArray(row.rolled_pet_peeve_rolls) && row.rolled_pet_peeve_rolls.length === 2
  const has_first_impression = !!row && row.first_impression_total !== null && row.first_impression_total !== undefined
  const complete = has_turn_ons && has_pet_peeves && has_first_impression

  return Response.json({
    ok: true,
    romance_enabled: true,
    status: {
      has_turn_ons,
      has_pet_peeves,
      has_first_impression,
      complete,
    },
  })
}
