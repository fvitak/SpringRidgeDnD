/**
 * POST /api/characters/[id]/first-impression — Phase 1 of two.
 *
 * Body: { actor: <character_id>, rolls: [d20, d20, d20] }
 *
 * Phase 1: pick three preconception outcomes from the player's d20s.
 *   - Calls `pickFirstImpressionOutcomes` to perform the per-slot
 *     bucket→outcome permutation (no magnitude dice are rolled).
 *   - Persists the picked components to
 *     `character_romance.first_impression_components`. The shape mirrors
 *     `FirstImpressionComponent`: { source, idea_text, dice_kind,
 *     direction, slot_index }.
 *   - Leaves `first_impression_total` NULL and `current_ap` unchanged.
 *     Phase 2 finalizes both once the player has rolled magnitudes.
 *
 * Idempotent: re-POSTing fresh d20 rolls overwrites the picked
 * components. Useful if the player refreshes between screens 1 and 2.
 *
 * Privacy: `actor` must match the route's character id. The total is
 * not yet computed and never returned. The client receives only the
 * outcome list it needs to render screen 2.
 *
 * Phase 2 is `POST /api/characters/[id]/first-impression/finalize`.
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
  pickFirstImpressionOutcomes,
} from '@/lib/romance/engine'

/** Resolve the partner character (the OTHER PC in this 2-PC session). */
async function findPartner(
  sessionId: string,
  characterId: string,
): Promise<{ id: string; slot: number; cha_mod: number; viewer_pc_id: string; viewed_pc_id: string } | null> {
  const supabase = getSupabase()
  const { data: chars } = await supabase
    .from('characters')
    .select('id, slot, stats')
    .eq('session_id', sessionId)
  if (!chars || chars.length < 2) return null
  const me = chars.find((c) => c.id === characterId)
  const partner = chars.find((c) => c.id !== characterId)
  if (!me || !partner) return null

  // CHA modifier of the *partner* (the viewed PC).
  const stats = (partner.stats as Record<string, number>) ?? {}
  const cha = stats['cha'] ?? 10
  const cha_mod = Math.floor((cha - 10) / 2)

  // Map slot → table id. Slot 1 = wynn, slot 2 = tarric (Blackthorn convention).
  // For other modules, the table's viewer_pc_id / viewed_pc_id should match the
  // module's character ids; this helper assumes Blackthorn slot mapping.
  const slotToId = (s: number | null) => (s === 1 ? 'wynn' : s === 2 ? 'tarric' : `slot-${s}`)
  return {
    id: partner.id,
    slot: partner.slot ?? 0,
    cha_mod,
    viewer_pc_id: slotToId(me.slot),
    viewed_pc_id: slotToId(partner.slot),
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await params
  let body: { actor?: string; rolls?: unknown }
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

  const rolls = body.rolls
  if (!Array.isArray(rolls) || rolls.length < 1 || rolls.length > 4) {
    return Response.json({ error: 'rolls must be an array of d20 results' }, { status: 400 })
  }
  if (!rolls.every((r) => typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 20)) {
    return Response.json({ error: 'each roll must be a d20 integer 1-20' }, { status: 400 })
  }

  const { ctx, tables } = await resolveTablesForCharacter(characterId)
  if (!ctx) return Response.json({ error: 'Character not found' }, { status: 404 })
  if (!tables) {
    return Response.json(
      { error: 'Romance subsystem is not enabled for this module.' },
      { status: 400 },
    )
  }

  const partner = await findPartner(ctx.session_id, characterId)
  if (!partner) {
    return Response.json({ error: 'No partner character found in this session.' }, { status: 400 })
  }

  let phase1
  try {
    phase1 = pickFirstImpressionOutcomes({
      viewerPcId: partner.viewer_pc_id,
      viewedPcId: partner.viewed_pc_id,
      table: tables.first_impressions_table,
      rolls: rolls as number[],
      charismaMod: partner.cha_mod,
      rng: defaultRng,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }

  // Persist the picked components. Note: we store the full phase-1
  // payload (no_roll_bonus, charisma_mod, components) so phase 2 doesn't
  // have to re-derive it. `current_ap` and `first_impression_total` stay
  // untouched (the engine row defaults `current_ap` to 0 and
  // `first_impression_total` to NULL via the migration). Phase 2 sets
  // both once the player rolls magnitudes.
  await getOrCreateRomanceRow(characterId)

  const supabase = getSupabase()
  const { error } = await supabase
    .from('character_romance')
    .update({
      first_impression_components: {
        phase: 1,
        no_roll_bonus: phase1.no_roll_bonus,
        charisma_mod: phase1.charisma_mod,
        viewer_pc_id: partner.viewer_pc_id,
        viewed_pc_id: partner.viewed_pc_id,
        d20_rolls: rolls,
        components: phase1.components,
      },
      first_impression_total: null,
      updated_at: new Date().toISOString(),
    })
    .eq('character_id', characterId)
  if (error) {
    return Response.json({ error: `DB write failed: ${error.message}` }, { status: 500 })
  }

  // Return only what screen 2 needs to render. We never expose the
  // bucket the d20 fell into; only the chosen outcome's idea_text +
  // the dice_kind the player should roll next.
  return Response.json({
    ok: true,
    outcomes: phase1.components.map((c) => ({
      slot_index: c.slot_index,
      idea_text: c.idea_text,
      dice_kind: c.dice_kind,
      direction: c.direction,
    })),
  })
}
