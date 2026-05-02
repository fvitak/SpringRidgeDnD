/**
 * POST /api/characters/[id]/first-impression/finalize — Phase 2 of two.
 *
 * Body: { actor: <character_id>, magnitude_rolls: [number|null, number|null, number|null] }
 *
 * Phase 2: the player has rolled the magnitude dice the engine asked
 * for in phase 1 (d6 for negative slots, d10 for positive, null for
 * neutral). We:
 *   1. Read the persisted phase-1 payload from
 *      `character_romance.first_impression_components`.
 *   2. Validate magnitudes against each slot's `dice_kind`.
 *   3. Call `finalizeFirstImpression` for the seed AP total + audit.
 *   4. Persist `first_impression_total`, replace
 *      `first_impression_components` with the audit shape, seed
 *      `current_ap`, and append `ap_history`.
 *
 * Owner-only via the existing `actor` pattern. The total is stored
 * server-side but NEVER returned by any endpoint.
 */

import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import {
  assertOwnerOrThrow,
  getRomanceRow,
  resolveTablesForCharacter,
} from '../../romance/_shared'
import {
  applyApDelta,
  finalizeFirstImpression,
  type FirstImpressionComponent,
} from '@/lib/romance/engine'

interface PersistedPhase1 {
  phase: 1
  no_roll_bonus: number
  charisma_mod: number
  viewer_pc_id: string
  viewed_pc_id: string
  d20_rolls: number[]
  components: FirstImpressionComponent[]
}

function isPersistedPhase1(value: unknown): value is PersistedPhase1 {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.phase !== 1) return false
  if (typeof v.no_roll_bonus !== 'number') return false
  if (typeof v.charisma_mod !== 'number') return false
  if (!Array.isArray(v.components)) return false
  return true
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await params
  let body: { actor?: string; magnitude_rolls?: unknown }
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

  const mags = body.magnitude_rolls
  if (!Array.isArray(mags)) {
    return Response.json(
      { error: 'magnitude_rolls must be an array' },
      { status: 400 },
    )
  }
  // Each entry must be either an integer 1..10 or null. Per-slot
  // dice_kind validation happens inside finalizeFirstImpression below.
  if (
    !mags.every(
      (m) =>
        m === null ||
        (typeof m === 'number' && Number.isInteger(m) && m >= 1 && m <= 10),
    )
  ) {
    return Response.json(
      {
        error:
          'each magnitude_rolls entry must be an integer 1-10 or null',
      },
      { status: 400 },
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

  const row = await getRomanceRow(characterId)
  if (!row) {
    return Response.json(
      { error: 'No first-impression in progress — submit your d20 rolls first.' },
      { status: 400 },
    )
  }
  const persisted = row.first_impression_components
  if (!isPersistedPhase1(persisted)) {
    return Response.json(
      {
        error:
          'No phase-1 first-impression payload found — submit your d20 rolls first.',
      },
      { status: 400 },
    )
  }

  if ((mags as unknown[]).length !== persisted.components.length) {
    return Response.json(
      {
        error: `magnitude_rolls length must equal component count (got ${
          (mags as unknown[]).length
        }, expected ${persisted.components.length})`,
      },
      { status: 400 },
    )
  }

  let finalized
  try {
    finalized = finalizeFirstImpression({
      components: persisted.components,
      magnitudeRolls: mags as Array<number | null>,
      charismaMod: persisted.charisma_mod,
      noRollBonus: persisted.no_roll_bonus,
      viewedPcId: persisted.viewed_pc_id,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }

  // Seed current_ap with the total. We start from 0 (or whatever the row
  // already has — a row created at insert defaults to 0 per migration).
  const seedFromAp = row.current_ap ?? 0
  const { newAp, history_entry } = applyApDelta(
    seedFromAp,
    finalized.total,
    `First Impression: ${finalized.components_with_magnitude
      .map((c) => c.detail)
      .join('; ')}`,
    'first_impression',
  )
  const newHistory = [...((row.ap_history as unknown[]) ?? []), history_entry]

  const supabase = getSupabase()
  const { error } = await supabase
    .from('character_romance')
    .update({
      first_impression_total: finalized.total,
      first_impression_components: finalized.components_with_magnitude,
      current_ap: newAp,
      ap_history: newHistory,
      updated_at: new Date().toISOString(),
    })
    .eq('character_id', characterId)
  if (error) {
    return Response.json({ error: `DB write failed: ${error.message}` }, { status: 500 })
  }

  // Per the brief: don't expose the AP total or the band on this endpoint.
  // The /romance GET will surface the band when the sheet loads.
  return Response.json({ ok: true })
}
