/**
 * Romance-tables contract — the canonical d20 tables that drive the
 * couples-focused mechanics in *Date Night Dungeons*-style modules.
 *
 * Status: v1 (PIV-04, Sprint 4.6). Versioned at the file level via
 * `schema_version`. Generic across modules — the shape never names
 * "Blackthorn", "Wynn", or "Tarric"; per-module tables live at
 * `lib/adventures/<module-id>/romance-tables.json` and are loaded
 * lazily by the romance engine.
 *
 * Privacy contract enforced by `app/api/characters/[id]/romance/...`:
 *   - Pet Peeves never leak across the partner gate.
 *   - The numeric AP value never appears in any API response — only
 *     the band label (e.g. "smitten", "guarded") flows out.
 *
 * See DECISIONS.md 2026-04-30 "Romance subsystem schema + privacy
 * enforcement at the API layer" for the architectural ADR; this file
 * is the data-shape ADR.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

export const ROMANCE_TABLES_SCHEMA_VERSION = 1 as const

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/**
 * Allowed dice expressions for turn-on/pet-peeve bonuses + penalties.
 * `d3` is unusual but appears once in the PDF (Pet Peeve #14 "Someone
 * who is incompetent" → -d3). Kept in the enum so the canonical tables
 * don't have to be edited away from the source material.
 */
export const romanceDieSchema = z.enum(['d3', 'd4', 'd6', 'd8', 'd10'])
export type RomanceDie = z.infer<typeof romanceDieSchema>

/**
 * One row of a Turn-on or Pet Peeve table. The shape is identical for
 * both — pet-peeve dice are conceptually a "negative" roll, but the
 * engine handles the sign at apply time.
 */
export const romanceTableEntrySchema = z.object({
  /** d20 result that produces this entry (1–20). */
  roll: z.number().int().min(1).max(20),
  /** Short human-readable label (e.g. "Being rescued", "Show-offs"). */
  name: z.string().min(1),
  /**
   * What triggers it in fiction. The AI pattern-matches partner actions
   * against this string when emitting attraction-point deltas.
   */
  effect_text: z.string().min(1),
  /**
   * The dice expression rolled when this entry fires. For turn-ons, the
   * roll is added to AP. For pet peeves, the roll is subtracted from AP.
   */
  dice: romanceDieSchema,
  /**
   * d20 rolls of entries on the *other* table (turn-ons vs pet-peeves)
   * that this entry conflicts with. The engine re-rolls on collision.
   */
  incompatible_with: z.array(z.number().int().min(1).max(20)),
})
export type RomanceTableEntry = z.infer<typeof romanceTableEntrySchema>

/** Both tables have exactly 20 rows (the d20 chart is the spec). */
const d20TableSchema = z.array(romanceTableEntrySchema).length(20)

/**
 * One d20 preconception within a First Impression table. The PDF
 * structures these as three independent d20 rolls per character pair,
 * with each roll-band yielding a die delta to seed AP.
 */
export const preconceptionSchema = z.object({
  /** Stable id for audit ("ranger-cleanliness", "kidnap-handling"). */
  id: z.string().min(1),
  /** What range of d20 selects this branch. min/max inclusive. */
  d20_range: z.tuple([z.number().int().min(1).max(20), z.number().int().min(1).max(20)]),
  /** Plain-English idea text the AI may colour role-play with. */
  idea_text: z.string().min(1),
  /**
   * Die rolled and direction applied. `null` = no change. `+d10` = roll
   * 1d10 and ADD; `-d6` = roll 1d6 and SUBTRACT.
   */
  ap_modifier: z
    .object({
      direction: z.enum(['add', 'subtract']),
      dice: romanceDieSchema,
    })
    .nullable(),
})
export type Preconception = z.infer<typeof preconceptionSchema>

/**
 * One PC-pair's First Impression chart. The PDF gives Wynn-of-Tarric
 * and Tarric-of-Wynn as separate symmetric tables; the contract carries
 * them as a flat array keyed by the (viewer, viewed) character ids.
 */
export const firstImpressionEntrySchema = z.object({
  /** Character id of the PC forming the impression. */
  viewer_pc_id: z.string().min(1),
  /** Character id of the PC being judged. */
  viewed_pc_id: z.string().min(1),
  /**
   * Fixed bonus that applies with no dice — captures the PDF's
   * "no-roll" preconceptions ("I can't let anything happen to Wynn!" = +6).
   */
  no_roll_bonus: z.number().int(),
  /**
   * Whether the viewer adds the *viewed* character's CHA modifier on top.
   * Always `'pc_b'` per the PDF; literal kept open for future modules.
   */
  charisma_modifier_source: z.enum(['pc_b']),
  /**
   * The three d20 preconception rolls. Length isn't asserted — sparse
   * impressions are allowed for modules that don't use all three.
   */
  preconceptions: z.array(preconceptionSchema).min(1),
})
export type FirstImpressionEntry = z.infer<typeof firstImpressionEntrySchema>

/**
 * AP band → narrative behaviour mapping (page 9 of the PDF).
 * The band's `label` is the only AP-derived value an API response is
 * allowed to expose; the underlying number stays hidden.
 */
export const apBandSchema = z.object({
  /** Inclusive lower bound. Use Number.NEGATIVE_INFINITY-equivalent via -999 sentinel. */
  min: z.number().int(),
  /** Inclusive upper bound. */
  max: z.number().int(),
  /** Single-word slug ("smitten", "guarded") used by the prompt + UI. */
  label: z.string().min(1),
  /** Plain-English description the AI can quote in narration. */
  behaviour_description: z.string().min(1),
})
export type ApBand = z.infer<typeof apBandSchema>

/** Combat-event chart for crit / fumble. */
export const combatChartEntrySchema = z.object({
  d20_range: z.tuple([z.number().int().min(1).max(20), z.number().int().min(1).max(20)]),
  ap_delta: z.number().int(),
  label: z.string().min(1),
})
export type CombatChartEntry = z.infer<typeof combatChartEntrySchema>

/** Aid-action attraction value (no roll required, per PDF p. 71 cheat sheet). */
export const aidActionSchema = z.object({
  action: z.string().min(1),
  ap_delta: z.number().int(),
})
export type AidAction = z.infer<typeof aidActionSchema>

/** Bundle of in-combat AP rules. */
export const combatApRulesSchema = z.object({
  critical_hit: z.array(combatChartEntrySchema).min(1),
  fumble: z.array(combatChartEntrySchema).min(1),
  aid_actions: z.array(aidActionSchema).min(1),
})
export type CombatApRules = z.infer<typeof combatApRulesSchema>

/** Intimacy AP thresholds (p. 9 of the PDF). */
export const intimacyThresholdsSchema = z.object({
  hand_holding: z.number().int(),
  hug: z.number().int(),
  first_kiss: z.number().int(),
  anything_more: z.number().int(),
})
export type IntimacyThresholds = z.infer<typeof intimacyThresholdsSchema>

/** Outcome chart for an initiated intimacy (d20 + AP). */
export const intimacyOutcomeSchema = z.object({
  /** Inclusive lower bound on d20+AP total; use -999 / 999 for open-ended. */
  min_total: z.number().int(),
  max_total: z.number().int(),
  /** Display label (e.g. "Wow, the Earth moved!"). */
  label: z.string().min(1),
  /** AP delta this outcome applies (positive or negative). */
  ap_delta: z.number().int(),
})
export type IntimacyOutcome = z.infer<typeof intimacyOutcomeSchema>

// ---------------------------------------------------------------------------
// Top-level shape
// ---------------------------------------------------------------------------

export const romanceTablesSchema = z.object({
  schema_version: z.literal(ROMANCE_TABLES_SCHEMA_VERSION),
  /** Must match the manifest's `module_id` (engine asserts this). */
  module_id: z.string().min(1),
  turn_ons: d20TableSchema,
  pet_peeves: d20TableSchema,
  first_impressions_table: z.array(firstImpressionEntrySchema).min(1),
  ap_bands: z.array(apBandSchema).min(1),
  combat_ap_rules: combatApRulesSchema,
  intimacy_thresholds: intimacyThresholdsSchema,
  intimacy_outcome_table: z.array(intimacyOutcomeSchema).min(1),
})

export type RomanceTables = z.infer<typeof romanceTablesSchema>

/**
 * Parses + validates a romance-tables JSON blob. Throws a formatted
 * error if the shape is wrong — silent failures here would corrupt
 * downstream AP arithmetic.
 */
export function parseRomanceTables(raw: unknown, source?: string): RomanceTables {
  const result = romanceTablesSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((iss) => `  • [${iss.path.join('.')}] ${iss.message}`)
      .join('\n')
    throw new Error(
      `Invalid romance-tables JSON${source ? ` (${source})` : ''}:\n${issues}`,
    )
  }
  return result.data
}
