/**
 * Walkable mask helpers.
 *
 * Scene walkable masks are stored in scenes.walkable as:
 *   { cols: number, rows: number, cells: string[] }
 *
 * Each character in cells[y][x] is one of:
 *   '.' walkable floor (cost 1)
 *   'D' difficult terrain (cost 2)
 *   '>' stair / door / passable terrain marker (cost 1)
 *   'W' wall (impassable)
 *   '~' water (impassable)
 *   'T' tree / cover (impassable)
 *
 * Anything else is treated as walkable cost 1 (forgiving for hand-authoring).
 */

export interface WalkableMask {
  cols: number
  rows: number
  cells: string[]
}

export type Cell = { x: number; y: number }

export function isInBounds(mask: WalkableMask, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < mask.cols && y < mask.rows
}

/** Returns the raw mask character at (x,y), or 'W' (impassable) if OOB. */
export function maskCharAt(mask: WalkableMask, x: number, y: number): string {
  if (!isInBounds(mask, x, y)) return 'W'
  const row = mask.cells[y] ?? ''
  return row.charAt(x) || '.'
}

/** Movement cost for a cell. Infinity = impassable. */
export function cellCost(mask: WalkableMask, x: number, y: number): number {
  const c = maskCharAt(mask, x, y)
  switch (c) {
    case 'W':
    case '~':
    case 'T':
      return Infinity
    case 'D':
      return 2
    default:
      return 1
  }
}

export function isWalkable(mask: WalkableMask, x: number, y: number): boolean {
  return cellCost(mask, x, y) !== Infinity
}
