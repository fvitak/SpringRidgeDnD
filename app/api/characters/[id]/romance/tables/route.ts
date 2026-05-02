/**
 * GET /api/characters/[id]/romance/tables?viewer=<character_id>
 *
 * Returns the *public* romance-table reference data the intake UI needs
 * to render Step 1 (the Turn-on card stack). The table contents
 * themselves are not secret — they're the same printed d20 chart from
 * the PDF. What's private is the *player's selections*, which are
 * persisted via POST /turn-ons and read back via GET /romance.
 *
 * Owner-only on principle (until we have a host-facing intake-helper
 * surface) — keeps the privacy gate uniform across the romance route
 * tree. A future PIV-08 host-side intake helper can relax this if it
 * needs to peek at the same data.
 *
 * NOTE: pet_peeve table entries are *not* leaked here either, even
 * though the rows are technically public, because exposing them would
 * make a future "pet peeves visible to host for narration" feature
 * harder to scope. The Pet Peeve step doesn't need them client-side —
 * the server rolls them and returns the rolled rows in the POST
 * response.
 */

import { NextRequest } from 'next/server'
import { resolveTablesForCharacter } from '../_shared'

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
      { error: 'Forbidden: tables endpoint is owner-only.' },
      { status: 403 },
    )
  }

  const { ctx, tables } = await resolveTablesForCharacter(characterId)
  if (!ctx) return Response.json({ error: 'Character not found' }, { status: 404 })
  if (!tables) {
    return Response.json(
      { error: 'Romance subsystem is not enabled for this module.' },
      { status: 400 },
    )
  }

  // Only the public turn-ons table flows out. We strip `incompatible_with`
  // so the client UI never has to think about that — the server validates
  // selections on submit anyway.
  return Response.json({
    ok: true,
    module_id: ctx.module_id,
    turn_ons: tables.turn_ons.map((t) => ({
      roll: t.roll,
      name: t.name,
      effect_text: t.effect_text,
      dice: t.dice,
    })),
  })
}
