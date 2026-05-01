/**
 * GET /api/characters/[id]/romance?viewer=<character_id>
 *
 * The privacy chokepoint for the romance subsystem (PIV-04).
 *
 * - viewer === id  → full self-shape (turn-ons + pet peeves expanded
 *                    with effect text, AP band label, first-impression
 *                    components for audit). NEVER `current_ap` (number)
 *                    and NEVER `first_impression_total` (number).
 * - viewer !== id  → public-only shape (band label, character_id). No
 *                    turn-ons, no pet peeves, no AP number.
 *
 * Pet Peeves NEVER leak across the partner gate, regardless of which
 * scenario is active. This is stricter than the PDF's "first two
 * scenarios" rule, by design (DECISIONS ADR appended below).
 */

import { NextRequest } from 'next/server'
import {
  getRomanceRow,
  resolveTablesForCharacter,
  shapeForViewer,
} from './_shared'

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

  const { ctx, tables } = await resolveTablesForCharacter(characterId)
  if (!ctx) {
    return Response.json({ error: 'Character not found' }, { status: 404 })
  }

  const row = await getRomanceRow(characterId)
  const shaped = shapeForViewer(row, tables, viewer, characterId)
  return Response.json({
    ok: true,
    module_id: ctx.module_id,
    romance_enabled: tables !== null,
    data: shaped,
  })
}
