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
 * Roll two d20 Pet Peeves, re-rolling on:
 *   - already-chosen turn-on incompatibility (cross-table)
 *   - already-chosen pet-peeve duplicate (within-table)
 *   - already-chosen pet-peeve incompatibility (within-table)
 *
 * The PDF (page 6) calls for re-rolling on either incompatibility or
 * duplication. The engine deterministically re-rolls until two valid
 * peeves are produced.
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
 * the d20 rolls from the caller (the API endpoint rolls them on the
 * client-supplied seed; the engine just resolves them).
 *
 * `rng` is unused on the happy path but kept on the signature for
 * symmetry (and so a malformed preconception lookup can fall back).
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
  // first 3 entries are the first preconception's branches, etc. (This
  // matches the PDF structure: three preconceptions × three branches.)
  const branchesPerPreconception = 3
  const totalPreconceptions = Math.floor(entry.preconceptions.length / branchesPerPreconception)

  for (let i = 0; i < totalPreconceptions; i++) {
    const d20 = rolls[i]
    if (typeof d20 !== 'number' || d20 < 1 || d20 > 20) {
      throw new Error(`computeFirstImpression: rolls[${i}] is not a d20 (got ${d20})`)
    }
    const start = i * branchesPerPreconception
    const branches = entry.preconceptions.slice(start, start + branchesPerPreconception)
    const branch = branches.find(
      (b) => d20 >= b.d20_range[0] && d20 <= b.d20_range[1],
    )
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
