/**
 * Romance engine — pure functions, no DB calls.
 *
 * Owns the deterministic arithmetic and re-roll logic for the
 * romance subsystem (PIV-04). API routes inject an `rng` so the
 * tests can pin sequences; production callers pass `defaultRng`
 * which reads `crypto.getRandomValues` via `lib/dice.ts`.
 *
 * No side effects. Easy to unit-test. The single source of truth
 * for AP arithmetic — every code path that mutates AP must route
 * through `applyApDelta` so the audit history stays consistent.
 *
 * See DECISIONS.md 2026-04-30 "Romance subsystem schema + privacy
 * enforcement at the API layer" and the romance-tables ADR.
 */

import { rollDie } from '@/lib/dice'
import type {
  RomanceTables,
  RomanceTableEntry,
  RomanceDie,
  ApBand,
  IntimacyThresholds,
  CombatChartEntry,
  FirstImpressionEntry,
} from '@/lib/schemas/romance'

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

export interface RomanceRng {
  /** Roll one die with `sides` faces; returns 1..sides. */
  d: (sides: number) => number
}

/** Production RNG — wraps the project-wide crypto RNG. */
export const defaultRng: RomanceRng = {
  d: (sides) => rollDie(sides),
}

/** Build a pinned RNG from a fixed integer sequence. Used by the unit + privacy tests. */
export function fixedSequenceRng(sequence: number[]): RomanceRng {
  let i = 0
  return {
    d: (_sides) => {
      if (i >= sequence.length) {
        throw new Error(`fixedSequenceRng exhausted after ${sequence.length} rolls`)
      }
      return sequence[i++]
    },
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const DIE_SIDES: Record<RomanceDie, number> = { d3: 3, d4: 4, d6: 6, d8: 8, d10: 10 }

function diceSidesFromExpression(expr: string): number {
  if (expr in DIE_SIDES) return DIE_SIDES[expr as RomanceDie]
  throw new Error(`Unknown romance dice expression: ${expr}`)
}

/** Format an audit history entry. */
export interface ApHistoryEntry {
  ts: string
  delta: number
  reason: string
  source:
    | 'first_impression'
    | 'turn_on_fire'
    | 'pet_peeve_fire'
    | 'combat_crit'
    | 'combat_fumble'
    | 'aid_action'
    | 'roleplay'
    | 'intimacy_outcome'
    | 'rule_of_cool'
}

// ---------------------------------------------------------------------------
// Pet Peeves rolling (with re-roll on incompatibility)
// ---------------------------------------------------------------------------

/**
 * Build the set of pet-peeve rolls that are blocked from selection given a
 * set of chosen turn-ons. A peeve is blocked if either:
 *   - a chosen turn-on lists the peeve in its `incompatible_with`, OR
 *   - the peeve itself lists a chosen turn-on in its `incompatible_with`.
 * Pure helper used by both `rollPetPeeves` and `pickPetPeeveFromD6`.
 */
function blockedPeevesByTurnOns(
  chosenTurnOnRolls: number[],
  tables: Pick<RomanceTables, 'turn_ons' | 'pet_peeves'>,
): Set<number> {
  const turnOnEntries = chosenTurnOnRolls
    .map((r) => tables.turn_ons.find((e) => e.roll === r))
    .filter((e): e is RomanceTableEntry => !!e)
  const blocked = new Set<number>()
  for (const to of turnOnEntries) {
    for (const incompat of to.incompatible_with) blocked.add(incompat)
  }
  for (const pp of tables.pet_peeves) {
    for (const incompat of pp.incompatible_with) {
      if (chosenTurnOnRolls.includes(incompat)) blocked.add(pp.roll)
    }
  }
  return blocked
}

/**
 * Fisher–Yates shuffle using the injected RNG. Pure: returns a new array,
 * does not mutate `arr`. Still used by `computeFirstImpression` for the
 * per-preconception bucket permutation.
 */
function shuffleWithRng<T>(arr: T[], rng: RomanceRng): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    // rng.d(i + 1) returns 1..(i+1); subtract 1 to get 0..i.
    const j = rng.d(i + 1) - 1
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Pet-peeve entry shape returned by `pickPetPeeveFromD20`.
 */
export interface PickedPetPeeve {
  roll: number
  name: string
  effect_text: string
  dice: string
}

/**
 * Result of `pickPetPeeveFromD20`. Discriminated union — caller checks
 * `valid` and either reads `peeve` or surfaces the reroll prompt to the
 * player.
 */
export type PickPetPeeveD20Result =
  | { valid: true; peeve: PickedPetPeeve }
  | {
      valid: false
      peeve: null
      reason: 'incompatible_with_turn_ons' | 'duplicate' | 'pairwise_incompatible'
    }

/**
 * Pick a single pet peeve via direct d20 → table lookup (PDF p.6 rule).
 *
 * The PDF-correct flow:
 *   1. Direct mapping: peeve = pet_peeves.find(p => p.roll === d20).
 *   2. If the peeve is blocked by the player's chosen turn-ons (in either
 *      direction via `blockedPeevesByTurnOns`), return
 *      { valid: false, reason: 'incompatible_with_turn_ons' }.
 *   3. If the peeve was already rolled this session, return
 *      { valid: false, reason: 'duplicate' }.
 *   4. If the peeve is pairwise-incompatible with an already-rolled peeve,
 *      return { valid: false, reason: 'pairwise_incompatible' }.
 *
 * Does NOT throw on invalid outcomes — the frontend prompts the player
 * to reroll. The PDF's randomness is the d20 itself; we don't add a
 * shuffle layer.
 */
export function pickPetPeeveFromD20(
  d20: number,
  chosenTurnOnRolls: number[],
  alreadyRolledPeeveRolls: number[],
  tables: Pick<RomanceTables, 'turn_ons' | 'pet_peeves'>,
): PickPetPeeveD20Result {
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) {
    throw new Error(`pickPetPeeveFromD20: d20 must be 1-20 (got ${d20})`)
  }
  const entry = tables.pet_peeves.find((p) => p.roll === d20)
  if (!entry) {
    // Should be impossible if tables.pet_peeves covers 1-20, but be safe.
    throw new Error(`pickPetPeeveFromD20: no pet peeve at roll=${d20}`)
  }

  // Duplicate of an already-rolled peeve.
  if (alreadyRolledPeeveRolls.includes(d20)) {
    return { valid: false, peeve: null, reason: 'duplicate' }
  }

  // Incompatible with the chosen turn-ons (bidirectional).
  const blocked = blockedPeevesByTurnOns(chosenTurnOnRolls, tables)
  if (blocked.has(d20)) {
    return { valid: false, peeve: null, reason: 'incompatible_with_turn_ons' }
  }

  // Pairwise incompatibility with already-rolled peeves.
  for (const other of alreadyRolledPeeveRolls) {
    const otherEntry = tables.pet_peeves.find((p) => p.roll === other)
    if (!otherEntry) continue
    if (otherEntry.incompatible_with.includes(d20)) {
      return { valid: false, peeve: null, reason: 'pairwise_incompatible' }
    }
    if (entry.incompatible_with.includes(other)) {
      return { valid: false, peeve: null, reason: 'pairwise_incompatible' }
    }
  }

  return {
    valid: true,
    peeve: {
      roll: entry.roll,
      name: entry.name,
      effect_text: entry.effect_text,
      dice: entry.dice,
    },
  }
}

/**
 * Roll two d20 Pet Peeves, re-rolling on:
 *   - already-chosen turn-on incompatibility (cross-table)
 *   - already-chosen pet-peeve duplicate (within-table)
 *   - already-chosen pet-peeve incompatibility (within-table)
 *
 * The PDF (page 6) calls for re-rolling on either incompatibility or
 * duplication. The engine deterministically re-rolls until two valid
 * peeves are produced.
 *
 * NOTE: As of PIV-07 the production flow uses `pickPetPeeveFromD6`
 * (player rolls a physical d6, server fresh-shuffles per roll). This
 * function remains for the privacy regression test and any future
 * non-interactive callers.
 */
export function rollPetPeeves(
  chosenTurnOnRolls: number[],
  tables: Pick<RomanceTables, 'turn_ons' | 'pet_peeves'>,
  rng: RomanceRng = defaultRng,
): number[] {
  const turnOnEntries = chosenTurnOnRolls
    .map((r) => tables.turn_ons.find((e) => e.roll === r))
    .filter((e): e is RomanceTableEntry => !!e)

  // Set of pet-peeve rolls that conflict with chosen turn-ons (in either
  // direction — turn-on lists the peeve as incompatible, OR vice versa).
  const peevesBlockedByTurnOns = new Set<number>()
  for (const to of turnOnEntries) {
    for (const incompat of to.incompatible_with) peevesBlockedByTurnOns.add(incompat)
  }
  for (const pp of tables.pet_peeves) {
    for (const incompat of pp.incompatible_with) {
      // If chosen turn-on rolls include the peeve's incompat target, this
      // peeve is also blocked.
      if (chosenTurnOnRolls.includes(incompat)) peevesBlockedByTurnOns.add(pp.roll)
    }
  }

  const chosen: number[] = []
  // Soft cap on rerolls so a malformed table can't infinite-loop.
  const MAX_ATTEMPTS = 200
  let attempts = 0
  while (chosen.length < 2) {
    if (attempts++ > MAX_ATTEMPTS) {
      throw new Error('rollPetPeeves: exceeded re-roll cap; tables may be over-constrained')
    }
    const r = rng.d(20)
    if (peevesBlockedByTurnOns.has(r)) continue
    if (chosen.includes(r)) continue
    // Within-peeve incompatibility (e.g. Peeve A lists Peeve B as incompat).
    const entry = tables.pet_peeves.find((e) => e.roll === r)
    if (!entry) continue
    if (entry.incompatible_with.some((other) => chosen.includes(other))) continue
    if (chosen.some((c) => {
      const e = tables.pet_peeves.find((x) => x.roll === c)
      return e?.incompatible_with.includes(r) ?? false
    })) continue
    chosen.push(r)
  }
  return chosen
}

// ---------------------------------------------------------------------------
// First Impression
// ---------------------------------------------------------------------------

/**
 * Compute First Impression total + audit components.
 *
 * The PDF gives each PC a fixed "no-roll" bonus, plus the *other* PC's
 * CHA modifier, plus three independent d20 preconception rolls. We accept
 * the d20 rolls from the caller (the player typed them in from a physical
 * d20).
 *
 * Per-roll bucket randomization (PIV-07 polish): the PDF maps the d20 to
 * three fixed buckets [1-6] / [7-13] / [14-20] which line up with the
 * table's three branches (negative / neutral / positive). Default mapping
 * is one of six possible permutations; we randomize the
 * outcome-to-bucket mapping per preconception so the same d20 number
 * across different rolls rarely yields the same outcome. Bucket SIZES
 * stay fixed (6 / 7 / 7) — the PDF's probability split is preserved.
 *
 * `rng` is used for both the per-preconception bucket permutation AND
 * the dice roll on the chosen branch's `ap_modifier`.
 */
export function computeFirstImpression(args: {
  viewerPcId: string
  viewedPcId: string
  table: RomanceTables['first_impressions_table']
  rolls: number[]
  charismaMod: number
  rng?: RomanceRng
}): { total: number; components: Array<{ source: string; delta: number; detail: string }> } {
  const { viewerPcId, viewedPcId, table, rolls, charismaMod, rng = defaultRng } = args

  const entry: FirstImpressionEntry | undefined = table.find(
    (e) => e.viewer_pc_id === viewerPcId && e.viewed_pc_id === viewedPcId,
  )
  if (!entry) {
    throw new Error(
      `computeFirstImpression: no entry for viewer="${viewerPcId}" viewed="${viewedPcId}"`,
    )
  }

  const components: Array<{ source: string; delta: number; detail: string }> = []
  let total = 0

  // No-roll bonus
  total += entry.no_roll_bonus
  components.push({
    source: 'no_roll_bonus',
    delta: entry.no_roll_bonus,
    detail: `Fixed +${entry.no_roll_bonus} (no-roll preconception)`,
  })

  // CHA modifier of the viewed PC
  total += charismaMod
  components.push({
    source: 'charisma_modifier',
    delta: charismaMod,
    detail: `${charismaMod >= 0 ? '+' : ''}${charismaMod} (${viewedPcId} CHA mod)`,
  })

  // Each preconception is a d20 with three result branches; the table
  // stores them as separate rows keyed to `d20_range`. Group by 3 — the
  // first 3 entries are the first preconception's branches, etc.
  const branchesPerPreconception = 3
  const totalPreconceptions = Math.floor(entry.preconceptions.length / branchesPerPreconception)

  // Fixed buckets — sizes preserved per PDF.
  const BUCKETS: Array<[number, number]> = [[1, 6], [7, 13], [14, 20]]

  for (let i = 0; i < totalPreconceptions; i++) {
    const d20 = rolls[i]
    if (typeof d20 !== 'number' || d20 < 1 || d20 > 20) {
      throw new Error(`computeFirstImpression: rolls[${i}] is not a d20 (got ${d20})`)
    }
    const start = i * branchesPerPreconception
    const branches = entry.preconceptions.slice(start, start + branchesPerPreconception)

    // Tag each branch by its outcome class. `subtract` = negative, `null`
    // = neutral, `add` = positive. The original table author orders them
    // negative-then-neutral-then-positive but we don't rely on that order
    // — we look it up.
    const negative = branches.find((b) => b.ap_modifier?.direction === 'subtract')
    const neutral = branches.find((b) => b.ap_modifier === null || b.ap_modifier === undefined)
    const positive = branches.find((b) => b.ap_modifier?.direction === 'add')
    if (!negative || !neutral || !positive) {
      // Fall back to the legacy (PDF-default) mapping if the table isn't
      // negative/neutral/positive shaped.
      const branch = branches.find((b) => d20 >= b.d20_range[0] && d20 <= b.d20_range[1])
      if (!branch) {
        throw new Error(
          `computeFirstImpression: no branch for preconception ${i} d20=${d20}`,
        )
      }
      let delta = 0
      if (branch.ap_modifier) {
        const sides = diceSidesFromExpression(branch.ap_modifier.dice)
        const dice = rng.d(sides)
        delta = branch.ap_modifier.direction === 'subtract' ? -dice : dice
      }
      total += delta
      components.push({
        source: `preconception:${branch.id}`,
        delta,
        detail: branch.idea_text,
      })
      continue
    }

    // Random permutation: bucket index 0..2 -> outcome (one of the three
    // branches). Fisher–Yates over a 3-element array via injected RNG so
    // tests using `fixedSequenceRng` stay deterministic.
    const outcomes = [negative, neutral, positive]
    const permutation = shuffleWithRng([0, 1, 2], rng)
    const bucketIdx = BUCKETS.findIndex(
      ([lo, hi]) => d20 >= lo && d20 <= hi,
    )
    if (bucketIdx === -1) {
      throw new Error(`computeFirstImpression: d20=${d20} out of bucket range`)
    }
    const branch = outcomes[permutation[bucketIdx]]

    let delta = 0
    if (branch.ap_modifier) {
      const sides = diceSidesFromExpression(branch.ap_modifier.dice)
      const dice = rng.d(sides)
      delta = branch.ap_modifier.direction === 'subtract' ? -dice : dice
    }
    total += delta
    components.push({
      source: `preconception:${branch.id}`,
      delta,
      detail: branch.idea_text,
    })
  }

  return { total, components }
}

// ---------------------------------------------------------------------------
// AP delta
// ---------------------------------------------------------------------------

/**
 * Compute the next AP value and the audit history entry produced by
 * applying `delta` to `currentAp`. Pure — no DB writes, no side effects.
 *
 * Every code path that wants to mutate AP routes through here so the
 * audit history is consistent.
 */
export function applyApDelta(
  currentAp: number,
  delta: number,
  reason: string,
  source: ApHistoryEntry['source'] = 'roleplay',
  ts: string = new Date().toISOString(),
): { newAp: number; history_entry: ApHistoryEntry } {
  return {
    newAp: currentAp + delta,
    history_entry: { ts, delta, reason, source },
  }
}

// ---------------------------------------------------------------------------
// Intimacy gates
// ---------------------------------------------------------------------------

export type IntimacyType = keyof IntimacyThresholds

/**
 * Whether the given intimacy is unlocked at the current AP, plus a
 * player-facing gate string when it isn't. The number is *never*
 * mentioned — we only ever paraphrase ("not yet").
 */
export function intimacyAvailable(
  currentAp: number,
  intimacy: IntimacyType,
  thresholds: IntimacyThresholds,
): { available: boolean; gateText: string | null } {
  const required = thresholds[intimacy]
  if (currentAp >= required) return { available: true, gateText: null }
  return {
    available: false,
    gateText: 'Not yet — the moment hasn\'t arrived.',
  }
}

// ---------------------------------------------------------------------------
// AP band lookup
// ---------------------------------------------------------------------------

/**
 * Map AP → band. Returns the label + behaviour description, NEVER the
 * underlying number. This is the only AP-derived value that's allowed
 * to leave the server.
 */
export function apBand(currentAp: number, bands: ApBand[]): { label: string; behaviour: string } {
  const match = bands.find((b) => currentAp >= b.min && currentAp <= b.max)
  if (match) return { label: match.label, behaviour: match.behaviour_description }
  // Fallback: pick the closest band by distance to the bounds.
  let closest = bands[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const b of bands) {
    const d = Math.min(Math.abs(currentAp - b.min), Math.abs(currentAp - b.max))
    if (d < bestDist) {
      bestDist = d
      closest = b
    }
  }
  return { label: closest.label, behaviour: closest.behaviour_description }
}

// ---------------------------------------------------------------------------
// Combat AP delta
// ---------------------------------------------------------------------------

export type CombatEvent = 'critical_hit' | 'fumble'

/**
 * Combine the d20 chart roll with any matching turn-on / pet-peeve dice,
 * per the PDF's "During Combat" section (page 10). Returns the net AP
 * delta plus its component audit.
 *
 * @param event              Whether this is a critical hit or fumble.
 * @param observerTurnOnRolls The OBSERVER's chosen turn-ons (i.e. the PC
 *                           who is reacting to the partner's action).
 * @param observerPeeveRolls  The OBSERVER's pet peeves.
 * @param tables              Module-loaded romance tables.
 * @param rng                 Injected RNG.
 *
 * The matching rule: a turn-on/peeve "matches" combat events when its
 * `effect_text` references "critical hit", "crit", or "fumble"
 * appropriately. The matching is intentionally conservative — false
 * positives bias play, so when in doubt, no extra dice fire.
 */
export function combatApDelta(
  event: CombatEvent,
  observerTurnOnRolls: number[],
  observerPeeveRolls: number[],
  tables: RomanceTables,
  rng: RomanceRng = defaultRng,
): { delta: number; components: Array<{ source: string; delta: number; detail: string }> } {
  const components: Array<{ source: string; delta: number; detail: string }> = []
  let delta = 0

  // 1. Chart roll
  const chart: CombatChartEntry[] =
    event === 'critical_hit' ? tables.combat_ap_rules.critical_hit : tables.combat_ap_rules.fumble
  const d20 = rng.d(20)
  const entry = chart.find((c) => d20 >= c.d20_range[0] && d20 <= c.d20_range[1])
  if (!entry) {
    throw new Error(`combatApDelta: chart has no entry for d20=${d20} on event=${event}`)
  }
  delta += entry.ap_delta
  components.push({
    source: `chart:${event}`,
    delta: entry.ap_delta,
    detail: `${entry.label} (rolled ${d20})`,
  })

  // 2. Turn-on bonus dice
  for (const r of observerTurnOnRolls) {
    const to = tables.turn_ons.find((t) => t.roll === r)
    if (!to) continue
    if (matchesCombatEvent(to.effect_text, event)) {
      const dice = rng.d(diceSidesFromExpression(to.dice))
      delta += dice
      components.push({
        source: `turn_on:${to.roll}`,
        delta: dice,
        detail: `Turn-on "${to.name}" fires (+${dice} on ${to.dice})`,
      })
    }
  }

  // 3. Pet-peeve penalty dice
  for (const r of observerPeeveRolls) {
    const pp = tables.pet_peeves.find((t) => t.roll === r)
    if (!pp) continue
    if (matchesCombatEvent(pp.effect_text, event)) {
      const dice = rng.d(diceSidesFromExpression(pp.dice))
      delta -= dice
      components.push({
        source: `pet_peeve:${pp.roll}`,
        delta: -dice,
        detail: `Pet Peeve "${pp.name}" fires (-${dice} on ${pp.dice})`,
      })
    }
  }

  return { delta, components }
}

/** Cheap text-match for whether an entry's effect_text talks about this combat event. */
function matchesCombatEvent(effectText: string, event: CombatEvent): boolean {
  const lower = effectText.toLowerCase()
  if (event === 'critical_hit') {
    return lower.includes('critical hit') || lower.includes('crit')
  }
  return lower.includes('fumble') || lower.includes('failed spell')
}
