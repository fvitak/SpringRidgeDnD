/**
 * A* pathfinding on a grid scene.
 *
 * Diagonals: enabled by default with the 5E "5-foot diagonals" beginner rule
 * (every diagonal counts as 1 cell, not 1.5). Toggle this off via opts when we
 * want strict 5E.
 */

import { Cell, WalkableMask, cellCost, isInBounds } from './walkable'

export interface PathfindOptions {
  /** Cells occupied by tokens that block the path (typically enemies). */
  blockedCells?: Set<string>
  /** Cells we're allowed to pass through but not stop on (e.g. allies). */
  squeezeCells?: Set<string>
  /** Allow diagonal movement. Default true. */
  allowDiagonal?: boolean
  /** Each diagonal step counts double (strict 5E). Default false. */
  strictDiagonalCost?: boolean
  /** Max total movement cost; pathfinding stops past this and returns null. */
  maxCost?: number
}

export interface PathResult {
  /** Cells visited in order, including start and end. */
  path: Cell[]
  /** Total movement cost (in squares). */
  cost: number
}

const DIRS_4 = [
  { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
]

const DIRS_8 = [
  ...DIRS_4,
  { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
]

const key = (c: Cell) => `${c.x},${c.y}`

/**
 * Returns the cheapest path from `from` to `to` on the walkable mask, or null
 * if no path exists within `opts.maxCost`. The path includes both endpoints.
 */
export function findPath(
  mask: WalkableMask,
  from: Cell,
  to: Cell,
  opts: PathfindOptions = {},
): PathResult | null {
  if (!isInBounds(mask, to.x, to.y)) return null
  if (cellCost(mask, to.x, to.y) === Infinity) return null
  const blocked = opts.blockedCells ?? new Set<string>()
  if (blocked.has(key(to))) return null

  const dirs = opts.allowDiagonal === false ? DIRS_4 : DIRS_8
  const maxCost = opts.maxCost ?? Infinity

  // Open set as a tiny binary heap to keep this dependency-free.
  type Node = { cell: Cell; g: number; f: number }
  const open: Node[] = []
  const closedG = new Map<string, number>()
  const cameFrom = new Map<string, Cell>()

  const push = (n: Node) => {
    open.push(n)
    let i = open.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (open[p].f <= open[i].f) break
      ;[open[p], open[i]] = [open[i], open[p]]
      i = p
    }
  }
  const pop = (): Node | undefined => {
    if (open.length === 0) return undefined
    const top = open[0]
    const last = open.pop()
    if (open.length > 0 && last) {
      open[0] = last
      let i = 0
      while (true) {
        const l = i * 2 + 1, r = i * 2 + 2
        let s = i
        if (l < open.length && open[l].f < open[s].f) s = l
        if (r < open.length && open[r].f < open[s].f) s = r
        if (s === i) break
        ;[open[s], open[i]] = [open[i], open[s]]
        i = s
      }
    }
    return top
  }

  const heuristic = (c: Cell) => {
    const dx = Math.abs(c.x - to.x)
    const dy = Math.abs(c.y - to.y)
    // Octile distance with cost 1 for cardinals & diagonals (matches 5-foot-diagonal rule)
    return Math.max(dx, dy)
  }

  push({ cell: from, g: 0, f: heuristic(from) })
  closedG.set(key(from), 0)

  while (open.length > 0) {
    const cur = pop()!
    if (cur.cell.x === to.x && cur.cell.y === to.y) {
      // Reconstruct
      const path: Cell[] = [cur.cell]
      let k = key(cur.cell)
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k)!
        path.unshift(prev)
        k = key(prev)
      }
      return { path, cost: cur.g }
    }
    if (cur.g > maxCost) continue
    for (const d of dirs) {
      const nx = cur.cell.x + d.dx
      const ny = cur.cell.y + d.dy
      if (!isInBounds(mask, nx, ny)) continue
      const cellTraverseCost = cellCost(mask, nx, ny)
      if (cellTraverseCost === Infinity) continue
      // Diagonal corner-cutting prevention: don't allow diagonal through two walls
      if (d.dx !== 0 && d.dy !== 0) {
        const c1 = cellCost(mask, cur.cell.x + d.dx, cur.cell.y)
        const c2 = cellCost(mask, cur.cell.x, cur.cell.y + d.dy)
        if (c1 === Infinity && c2 === Infinity) continue
      }
      const nbrKey = `${nx},${ny}`
      if (blocked.has(nbrKey)) continue
      const stepBaseCost = (d.dx !== 0 && d.dy !== 0) && opts.strictDiagonalCost
        ? cellTraverseCost * 1.5
        : cellTraverseCost
      const tentativeG = cur.g + stepBaseCost
      if (tentativeG > maxCost) continue
      const prevG = closedG.get(nbrKey)
      if (prevG !== undefined && prevG <= tentativeG) continue
      closedG.set(nbrKey, tentativeG)
      cameFrom.set(nbrKey, cur.cell)
      push({ cell: { x: nx, y: ny }, g: tentativeG, f: tentativeG + heuristic({ x: nx, y: ny }) })
    }
  }
  return null
}
