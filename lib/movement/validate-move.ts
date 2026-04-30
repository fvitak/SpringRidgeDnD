/**
 * Movement validator. Pure function — used both client-side (preview) and
 * server-side (commit). Same input shape both places.
 */

import { Cell, WalkableMask, maskCharAt } from './walkable'
import { findPath } from './pathfind'

export interface MapToken {
  id: string
  name: string
  x: number
  y: number
  is_friendly?: boolean
  size?: number
  discovered?: boolean
  placed?: boolean
}

export interface CharacterMoveState {
  /** Token id for the character moving. */
  tokenId: string
  /** Speed in 5ft squares per turn (e.g. 6 for 30ft speed). */
  speedSquares: number
  /** Squares already used this turn. */
  movementUsed: number
  /** Dash this turn doubles the budget. */
  dashUsed?: boolean
}

export type MoveValidationResult =
  | {
      ok: true
      path: Cell[]
      cost: number
      remainingAfter: number
      provokes: { tokenId: string; name: string }[]
    }
  | {
      ok: false
      reason: 'too_far' | 'blocked' | 'no_path' | 'turn_ended' | 'invalid_target' | 'not_your_token'
      explanation: string
      maxReachable?: Cell | null
    }

export interface ValidateMoveArgs {
  mask: WalkableMask
  tokens: MapToken[]
  mover: CharacterMoveState
  target: Cell
}

/**
 * Validate a move attempt. Returns either ok=true with the path and cost, or
 * ok=false with a reason and (where possible) the furthest cell along the
 * desired path that *was* reachable.
 */
export function validateMove(args: ValidateMoveArgs): MoveValidationResult {
  const { mask, tokens, mover, target } = args

  const moverToken = tokens.find((t) => t.id === mover.tokenId)
  if (!moverToken) {
    return { ok: false, reason: 'not_your_token', explanation: 'Cannot find your token on the map.' }
  }

  if (target.x < 0 || target.y < 0 || target.x >= mask.cols || target.y >= mask.rows) {
    return { ok: false, reason: 'invalid_target', explanation: 'Target is off the map.' }
  }

  const targetCharacter = maskCharAt(mask, target.x, target.y)
  if (targetCharacter === 'W' || targetCharacter === 'T' || targetCharacter === '~') {
    return {
      ok: false,
      reason: 'blocked',
      explanation: targetCharacter === 'W'
        ? 'There is a wall in the way.'
        : targetCharacter === 'T'
        ? 'A tree blocks that square.'
        : 'That square is in the water.',
    }
  }

  // Build blocked-cell set: every other token occupies its cell.
  const blocked = new Set<string>()
  for (const t of tokens) {
    if (t.id === moverToken.id) continue
    blocked.add(`${t.x},${t.y}`)
  }

  // Speed budget — Dash doubles base speed.
  const baseBudget = mover.speedSquares * (mover.dashUsed ? 2 : 1)
  const remaining = baseBudget - mover.movementUsed
  if (remaining <= 0) {
    return { ok: false, reason: 'turn_ended', explanation: 'No movement left this turn.' }
  }

  const result = findPath(
    mask,
    { x: moverToken.x, y: moverToken.y },
    target,
    { blockedCells: blocked, maxCost: remaining },
  )

  if (!result) {
    // Try to find the furthest reachable cell along the line (best-effort)
    const furthest = findFurthestReachable(mask, blocked, moverToken, target, remaining)
    if (furthest) {
      // Distinguish "too far" from "no path" by checking ignoring distance.
      const unrestricted = findPath(
        mask,
        { x: moverToken.x, y: moverToken.y },
        target,
        { blockedCells: blocked },
      )
      if (unrestricted && unrestricted.cost > remaining) {
        return {
          ok: false,
          reason: 'too_far',
          explanation: `That's ${unrestricted.cost} squares away — you have ${remaining} left.`,
          maxReachable: furthest,
        }
      }
      return {
        ok: false,
        reason: 'no_path',
        explanation: 'No legal path to that square — something is blocking the way.',
        maxReachable: furthest,
      }
    }
    return { ok: false, reason: 'no_path', explanation: 'No legal path to that square.' }
  }

  // Identify opportunity attacks: any time the path leaves a cell that is
  // adjacent (8 neighbours) to a hostile token.
  const provokes = detectOpportunityAttacks(result.path, tokens, moverToken)

  return {
    ok: true,
    path: result.path,
    cost: result.cost,
    remainingAfter: remaining - result.cost,
    provokes,
  }
}

function findFurthestReachable(
  mask: WalkableMask,
  blocked: Set<string>,
  start: { x: number; y: number },
  target: { x: number; y: number },
  budget: number,
): Cell | null {
  // Probe progressively closer cells from target → start.
  const candidates: Cell[] = bresenham(start, target).reverse()
  for (const c of candidates) {
    if (c.x === start.x && c.y === start.y) continue
    const r = findPath(mask, start, c, { blockedCells: blocked, maxCost: budget })
    if (r) return c
  }
  return null
}

function bresenham(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = []
  let x0 = a.x, y0 = a.y
  const dx = Math.abs(b.x - a.x), sx = a.x < b.x ? 1 : -1
  const dy = -Math.abs(b.y - a.y), sy = a.y < b.y ? 1 : -1
  let err = dx + dy
  while (true) {
    cells.push({ x: x0, y: y0 })
    if (x0 === b.x && y0 === b.y) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
  return cells
}

function detectOpportunityAttacks(
  path: Cell[],
  tokens: MapToken[],
  mover: MapToken,
): { tokenId: string; name: string }[] {
  const provokes: { tokenId: string; name: string }[] = []
  const hostiles = tokens.filter((t) => t.id !== mover.id && t.is_friendly === false)

  // For each hostile, check whether any cell of the path is adjacent and a
  // subsequent cell along the path is NOT adjacent (i.e. we left the threat).
  for (const h of hostiles) {
    let everAdjacent = false
    let leftThreat = false
    for (let i = 0; i < path.length; i++) {
      const adj = isAdjacent(path[i], h)
      if (adj) everAdjacent = true
      if (everAdjacent && !adj && i > 0) {
        leftThreat = true
        break
      }
    }
    if (everAdjacent && leftThreat) {
      provokes.push({ tokenId: h.id, name: h.name })
    }
  }
  return provokes
}

function isAdjacent(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && !(a.x === b.x && a.y === b.y)
}
