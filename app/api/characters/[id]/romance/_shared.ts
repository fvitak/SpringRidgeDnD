/**
 * Shared helpers for the romance route handlers (PIV-04).
 *
 * Privacy gate: GRAIL has no per-player auth. The "Pet Peeves never
 * leak across the partner" invariant is enforced here at the API
 * layer (per DECISIONS.md 2026-04-30 "Romance subsystem schema +
 * privacy enforcement at the API layer"). Every read goes through
 * `shapeForViewer`; every write goes through `assertOwnerOrThrow`.
 *
 * Notes for future engineers:
 *  - `current_ap` (the number) NEVER appears in any shape produced
 *    here. The band label is the only AP-derived value that leaves
 *    the server.
 *  - The "viewer is the same player slot" check is intentionally
 *    coarse — until real auth lands, anyone with the character_id
 *    URL is treated as that character's player. PIV-07 (mobile romance
 *    forms) calls these endpoints from the player's own phone, where
 *    the URL is hidden behind their join_token.
 */

import { getSupabase } from '@/lib/supabase'
import { loadRomanceTables } from '@/lib/romance/loader'
import { apBand } from '@/lib/romance/engine'
import type { RomanceTables } from '@/lib/schemas/romance'

// ---------------------------------------------------------------------------
// Row + DB access
// ---------------------------------------------------------------------------

export interface CharacterRomanceRow {
  id: string
  character_id: string
  chosen_turn_on_rolls: number[]
  rolled_pet_peeve_rolls: number[]
  first_impression_total: number | null
  first_impression_components: unknown
  current_ap: number
  ap_history: unknown
  created_at: string
  updated_at: string
}

export interface SessionContext {
  session_id: string
  module_id: string | null
}

/** Fetch the character's session + module_id; 404 surfaces upstream. */
export async function getSessionContextForCharacter(
  characterId: string,
): Promise<SessionContext | null> {
  const supabase = getSupabase()
  const { data: char } = await supabase
    .from('characters')
    .select('id, session_id')
    .eq('id', characterId)
    .maybeSingle()
  if (!char) return null
  const { data: session } = await supabase
    .from('sessions')
    .select('id, module_id')
    .eq('id', char.session_id)
    .maybeSingle()
  if (!session) return null
  return { session_id: session.id, module_id: session.module_id ?? null }
}

/** Get-or-create the romance row for a character. */
export async function getOrCreateRomanceRow(
  characterId: string,
): Promise<CharacterRomanceRow> {
  const supabase = getSupabase()
  const { data: existing } = await supabase
    .from('character_romance')
    .select('*')
    .eq('character_id', characterId)
    .maybeSingle()
  if (existing) return existing as CharacterRomanceRow

  const { data: created, error } = await supabase
    .from('character_romance')
    .insert({ character_id: characterId })
    .select('*')
    .single()
  if (error || !created) {
    throw new Error(`Failed to create character_romance row: ${error?.message ?? 'unknown'}`)
  }
  return created as CharacterRomanceRow
}

/** Fetch only — returns null if no romance row yet. */
export async function getRomanceRow(
  characterId: string,
): Promise<CharacterRomanceRow | null> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('character_romance')
    .select('*')
    .eq('character_id', characterId)
    .maybeSingle()
  return (data as CharacterRomanceRow | null) ?? null
}

// ---------------------------------------------------------------------------
// Privacy gate — the chokepoint
// ---------------------------------------------------------------------------

/**
 * Public romance shape — what the partner sees. Pet Peeves and AP
 * NEVER appear here. The band label is intentionally the only
 * romance-derived value that crosses this boundary.
 */
export interface PublicRomanceShape {
  character_id: string
  current_ap_band: { label: string; behaviour: string } | null
}

/**
 * Self romance shape — what the owning player sees on their own phone.
 * Includes the chosen turn-ons + rolled pet peeves expanded with their
 * effect text. Still does NOT include `current_ap` or
 * `first_impression_total` — both numbers stay hidden by design.
 */
export interface SelfRomanceShape extends PublicRomanceShape {
  turn_ons: Array<{ roll: number; name: string; effect_text: string; dice: string }>
  pet_peeves: Array<{ roll: number; name: string; effect_text: string; dice: string }>
  first_impression_components: unknown
}

/**
 * The single point at which the privacy gate fires.
 *
 * If `viewer === id`, the requester is reading their own row → full
 * `SelfRomanceShape`. Otherwise → `PublicRomanceShape` (band only).
 */
export function shapeForViewer(
  row: CharacterRomanceRow | null,
  tables: RomanceTables | null,
  viewer: string,
  characterId: string,
): SelfRomanceShape | PublicRomanceShape {
  // No tables ⇒ romance subsystem is off for this module ⇒ public-only.
  // No row yet ⇒ band is null but the shape is still well-formed.
  const band =
    row && tables ? apBand(row.current_ap, tables.ap_bands) : null

  const publicShape: PublicRomanceShape = {
    character_id: characterId,
    current_ap_band: band,
  }

  if (viewer !== characterId) {
    return publicShape
  }

  // Owner view — expand chosen turn-ons + pet peeves with effect text.
  const turnOns: SelfRomanceShape['turn_ons'] =
    row && tables
      ? row.chosen_turn_on_rolls
          .map((r) => tables.turn_ons.find((t) => t.roll === r))
          .filter((e): e is RomanceTables['turn_ons'][number] => !!e)
          .map((e) => ({ roll: e.roll, name: e.name, effect_text: e.effect_text, dice: e.dice }))
      : []
  const petPeeves: SelfRomanceShape['pet_peeves'] =
    row && tables
      ? row.rolled_pet_peeve_rolls
          .map((r) => tables.pet_peeves.find((t) => t.roll === r))
          .filter((e): e is RomanceTables['pet_peeves'][number] => !!e)
          .map((e) => ({ roll: e.roll, name: e.name, effect_text: e.effect_text, dice: e.dice }))
      : []
  const components = row?.first_impression_components ?? []

  return {
    ...publicShape,
    turn_ons: turnOns,
    pet_peeves: petPeeves,
    first_impression_components: components,
  }
}

// ---------------------------------------------------------------------------
// Owner-only assertion
// ---------------------------------------------------------------------------

/**
 * For mutating endpoints. Until real auth lands the rule is:
 * "the request must include `?actor=<character_id>` matching the
 * route's character id." That maps cleanly onto the eventual mobile
 * sheet flow (the player's phone knows its own character_id).
 *
 * Throws a synthetic Error tagged with status 403 on mismatch.
 */
export function assertOwnerOrThrow(actor: string | null, characterId: string): void {
  if (!actor || actor !== characterId) {
    const err = new Error(
      'Forbidden: only the character\'s own player slot may mutate romance state.',
    )
    ;(err as Error & { status?: number }).status = 403
    throw err
  }
}

// ---------------------------------------------------------------------------
// Module + tables resolver
// ---------------------------------------------------------------------------

/** Resolve the romance tables for a character via session.module_id. */
export async function resolveTablesForCharacter(
  characterId: string,
): Promise<{ ctx: SessionContext | null; tables: RomanceTables | null }> {
  const ctx = await getSessionContextForCharacter(characterId)
  if (!ctx) return { ctx: null, tables: null }
  return { ctx, tables: loadRomanceTables(ctx.module_id) }
}
