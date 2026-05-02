/**
 * Romance-tables loader.
 *
 * Reads `lib/adventures/<module-id>/romance-tables.json`, validates
 * against the Zod contract from `lib/schemas/romance.ts`, and returns
 * a typed object. Modules without a romance-tables file simply return
 * `null` — the romance code path becomes a no-op pass-through there.
 *
 * Mirrors `lib/adventures/loader.ts` for scenes; the two could share a
 * helper but the romance path is deliberately separate so a v2 scene
 * schema bump never forces a romance-tables bump or vice versa.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseRomanceTables, type RomanceTables } from '@/lib/schemas/romance'

function adventureRoot(moduleId: string): string {
  return path.join(process.cwd(), 'lib', 'adventures', moduleId)
}

/**
 * Resolve a session's `module_id` (sessions row column) into a concrete
 * romance-tables object. Returns `null` for modules without a romance
 * file — the API layer treats `null` as "romance subsystem disabled".
 */
export function loadRomanceTables(moduleId: string | null | undefined): RomanceTables | null {
  if (!moduleId) return null
  const filePath = path.join(adventureRoot(moduleId), 'romance-tables.json')
  if (!fs.existsSync(filePath)) return null
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const tables = parseRomanceTables(raw, filePath)
  if (tables.module_id !== moduleId) {
    throw new Error(
      `[romance loader] module_id mismatch: file declares "${tables.module_id}", caller requested "${moduleId}"`,
    )
  }
  return tables
}
