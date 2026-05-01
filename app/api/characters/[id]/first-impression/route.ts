/**
 * POST /api/characters/[id]/first-impression
 *
 * Body: { actor: <character_id>, rolls: [d20, d20, d20] }
 *
 * Resolve the player's First Impression of their partner against the
 * module's `first_impressions_table`. Caller supplies the d20 results
 * (so the mobile UI can show the rolls live). Server resolves them
 * into a starting AP, persists `first_impression_total` + audit
 * components + seeds `current_ap` + appends `ap_history`.
 *
 * Privacy: `actor` must match the route's character id. The total is
 * stored for audit but NEVER returned by any endpoint.
 */

import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import {
  assertOwnerOrThrow,
  getOrCreateRomanceRow,
  resolveTablesForCharacter,
} from '../romance/_shared'
import { applyApDelta, computeFirstImpression, defaultRng } from '@/lib/romance/engine'

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

  let result
  try {
    result = computeFirstImpression({
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

  // Apply the first impression as the seed AP delta.
  const row = await getOrCreateRomanceRow(characterId)
  const { newAp, history_entry } = applyApDelta(
    row.current_ap,
    result.total,
    `First Impression: ${result.components.map((c) => c.detail).join('; ')}`,
    'first_impression',
  )
  const newHistory = [...((row.ap_history as unknown[]) ?? []), history_entry]

  const supabase = getSupabase()
  const { error } = await supabase
    .from('character_romance')
    .update({
      first_impression_total: result.total,
      first_impression_components: result.components,
      current_ap: newAp,
      ap_history: newHistory,
      updated_at: new Date().toISOString(),
    })
    .eq('character_id', characterId)
  if (error) {
    return Response.json({ error: `DB write failed: ${error.message}` }, { status: 500 })
  }

  // The response intentionally omits `first_impression_total` and the
  // numeric AP. Only the audit components (which the player rolled
  // anyway) and the resulting band are exposed.
  const band = tables.ap_bands.find((b) => newAp >= b.min && newAp <= b.max) ?? null
  return Response.json({
    ok: true,
    components: result.components,
    current_ap_band: band ? { label: band.label, behaviour: band.behaviour_description } : null,
  })
}
