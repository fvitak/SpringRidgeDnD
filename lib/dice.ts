/**
 * Deterministic dice engine for D&D 5e.
 *
 * Uses `crypto.getRandomValues` for cryptographically strong randomness,
 * available in both Node (18+) and browser/edge runtimes.
 */

// ---------------------------------------------------------------------------
// Low-level primitive
// ---------------------------------------------------------------------------

/**
 * Rolls a single die with the given number of sides.
 * Returns an integer in [1, sides].
 */
export function rollDie(sides: number): number {
  if (sides < 2) throw new RangeError(`rollDie: sides must be >= 2, got ${sides}`)

  // Rejection-sampling approach to avoid modulo bias.
  // We need values in [0, sides-1], so we find the largest multiple of `sides`
  // that fits in a Uint32 and reject values at or above it.
  const max = Math.floor(0x1_0000_0000 / sides) * sides
  const buf = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= max)

  return (value % sides) + 1
}

// ---------------------------------------------------------------------------
// Notation parser
// ---------------------------------------------------------------------------

/**
 * Rolls dice described by standard notation (e.g. "2d6", "1d20", "4d6").
 * Returns individual rolls and their total.
 */
export function roll(notation: string): { total: number; rolls: number[]; notation: string } {
  const match = notation.trim().match(/^(\d+)d(\d+)$/i)
  if (!match) throw new Error(`roll: invalid notation "${notation}" — expected format "NdS"`)

  const count = parseInt(match[1], 10)
  const sides = parseInt(match[2], 10)

  if (count < 1) throw new RangeError(`roll: die count must be >= 1, got ${count}`)
  if (sides < 2) throw new RangeError(`roll: sides must be >= 2, got ${sides}`)

  const rolls: number[] = []
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides))
  }

  return {
    total: rolls.reduce((sum, r) => sum + r, 0),
    rolls,
    notation,
  }
}

// ---------------------------------------------------------------------------
// Ability / skill check (d20 + modifier)
// ---------------------------------------------------------------------------

/**
 * Rolls a d20 + modifier, respecting advantage/disadvantage rules.
 *
 * - advantage:    roll twice, take higher
 * - disadvantage: roll twice, take lower
 * - normal:       single roll (default)
 */
export function rollCheck(
  modifier: number,
  advantage: 'advantage' | 'disadvantage' | 'normal' = 'normal'
): { total: number; roll: number; modifier: number; nat20: boolean; nat1: boolean } {
  const r1 = rollDie(20)

  let dieResult: number
  if (advantage === 'advantage') {
    const r2 = rollDie(20)
    dieResult = Math.max(r1, r2)
  } else if (advantage === 'disadvantage') {
    const r2 = rollDie(20)
    dieResult = Math.min(r1, r2)
  } else {
    dieResult = r1
  }

  return {
    total: dieResult + modifier,
    roll: dieResult,
    modifier,
    nat20: dieResult === 20,
    nat1: dieResult === 1,
  }
}

// ---------------------------------------------------------------------------
// Damage roll (with critical hit support)
// ---------------------------------------------------------------------------

/**
 * Rolls damage dice from a notation string.
 *
 * On a critical hit, the dice count is doubled (per D&D 5e RAW) — modifiers
 * are NOT doubled and must be added by the caller separately.
 *
 * Examples:
 *   rollDamage("2d6", false) → rolls 2d6
 *   rollDamage("2d6", true)  → rolls 4d6 (doubled dice)
 */
export function rollDamage(notation: string, crit: boolean): { total: number; rolls: number[] } {
  const match = notation.trim().match(/^(\d+)d(\d+)$/i)
  if (!match) throw new Error(`rollDamage: invalid notation "${notation}" — expected format "NdS"`)

  const baseDice = parseInt(match[1], 10)
  const sides = parseInt(match[2], 10)
  const diceCount = crit ? baseDice * 2 : baseDice

  const rolls: number[] = []
  for (let i = 0; i < diceCount; i++) {
    rolls.push(rollDie(sides))
  }

  return {
    total: rolls.reduce((sum, r) => sum + r, 0),
    rolls,
  }
}
