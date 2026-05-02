/**
 * ING-03 — Adventure module validation harness.
 *
 * Walks an adventure module on disk, validates the manifest and every scene
 * file under `scenes/` against the Zod contract from
 * `lib/schemas/scene-context.ts`, and runs a layer of cross-reference checks
 * the schema itself can't enforce (NPC ids resolve, point-of-entry ids unique
 * within a location, scene-exit targets resolve, etc.).
 *
 * The schema's job is "this JSON is shaped right." This harness's job is
 * "the JSON is *internally consistent and reachable*." Schema gaps surface
 * as errors here; broader authoring-completeness gaps surface as warnings.
 *
 * Run with (Node 24+, no extra deps):
 *   node --experimental-strip-types --import ./scripts/path-alias-loader.ts \
 *        scripts/validate-adventures.ts <module-id>
 *
 * Exits 0 on PASS (warnings allowed) or non-zero on FAIL.
 *
 * Programmatic API: `validateModule(moduleId)` returns a `ValidationReport`
 * for callers that want the result without the CLI.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  parseManifest,
  parseSceneContext,
  manifestSchema,
  sceneContextSchema,
  type Manifest,
  type SceneContext,
} from '../lib/schemas/scene-context.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneReport {
  scene_id: string | null
  file: string
  /** Schema validation outcome. */
  schema_pass: boolean
  schema_errors: string[]
  /** Cross-reference check failures (errors). */
  ref_errors: string[]
  /** Coverage / shape warnings (non-fatal). */
  warnings: string[]
}

export interface ValidationReport {
  module_id: string
  manifest_pass: boolean
  manifest_errors: string[]
  manifest_warnings: string[]
  scenes: SceneReport[]
  /** True iff every scene passes schema + ref checks. */
  ok: boolean
}

// ---------------------------------------------------------------------------
// ANSI colours — best-effort, plain when not a TTY.
// ---------------------------------------------------------------------------

const COLOR = process.stdout.isTTY
const c = {
  red: (s: string) => (COLOR ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (COLOR ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (COLOR ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (COLOR ? `\x1b[36m${s}\x1b[0m` : s),
  bold: (s: string) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (COLOR ? `\x1b[2m${s}\x1b[0m` : s),
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adventureRoot(moduleId: string): string {
  return path.join(process.cwd(), 'lib', 'adventures', moduleId)
}

function readJsonOrThrow(absPath: string): unknown {
  const raw = fs.readFileSync(absPath, 'utf8')
  return JSON.parse(raw)
}

function listSceneFiles(moduleId: string): string[] {
  const scenesDir = path.join(adventureRoot(moduleId), 'scenes')
  if (!fs.existsSync(scenesDir)) return []
  return fs
    .readdirSync(scenesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(scenesDir, f))
    .sort()
}

function formatZodErrors(err: unknown): string[] {
  // Zod throws Error with our parseManifest/parseSceneContext wrappers;
  // those produce a multi-line error message starting with "...:\n  •". We
  // surface that as-is, split into per-line bullets for the report.
  const msg = (err as Error).message ?? String(err)
  return msg.split('\n').filter((l) => l.trim().length > 0)
}

// ---------------------------------------------------------------------------
// Cross-reference checks
// ---------------------------------------------------------------------------

function crossReferenceScene(
  scene: SceneContext,
  allSceneIds: Set<string>,
  sharedNpcIds: Set<string>
): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Every npcs_present[] id in a location resolves to scene.npcs[] OR
  //    manifest.shared_npcs[]. The shared pool was added in the
  //    2026-04-30 schema widening so cross-scene NPCs (e.g. Harold the
  //    Lookout in Blackthorn Parts 1+2) can live once at the manifest
  //    level. Failures only when the id is missing from *both* pools.
  const sceneNpcIds = new Set(scene.npcs.map((n) => n.id))
  for (const loc of scene.locations) {
    for (const ref of loc.npcs_present) {
      if (!sceneNpcIds.has(ref) && !sharedNpcIds.has(ref)) {
        errors.push(
          `location[${loc.id}].npcs_present references "${ref}" — no NPC with that id in scene.npcs or manifest.shared_npcs`
        )
      }
    }
  }

  // 2. points_of_entry[].id unique within each location.
  for (const loc of scene.locations) {
    const seen = new Map<string, number>()
    for (const poe of loc.points_of_entry) {
      seen.set(poe.id, (seen.get(poe.id) ?? 0) + 1)
    }
    for (const [id, count] of seen) {
      if (count > 1) {
        errors.push(
          `location[${loc.id}].points_of_entry has ${count} entries with id "${id}" — must be unique within the location`
        )
      }
    }
  }

  // 3. plot_points[].id unique within the scene.
  {
    const seen = new Map<string, number>()
    for (const pp of scene.plot_points) {
      seen.set(pp.id, (seen.get(pp.id) ?? 0) + 1)
    }
    for (const [id, count] of seen) {
      if (count > 1) {
        errors.push(`plot_points has ${count} entries with id "${id}" — must be unique`)
      }
    }
  }

  // 4. scene_exit_conditions[].leads_to_scene_id (if present) must resolve
  //    to another scene file in the same module. If the target doesn't exist
  //    yet (e.g. ingestion is partial), demote to a warning rather than an
  //    error so partial-ingestion work still validates.
  for (const exit of scene.scene_exit_conditions) {
    if (exit.leads_to_scene_id == null) continue
    if (!allSceneIds.has(exit.leads_to_scene_id)) {
      warnings.push(
        `scene_exit_conditions[${exit.id}].leads_to_scene_id "${exit.leads_to_scene_id}" does not resolve to any scene file in this module — either the target scene hasn't been ingested yet or this is an external/end-of-module exit`
      )
    }
  }

  // 5. Coverage hints — shape warnings, not errors. Most scenes will have
  //    these but some legitimately won't.
  if (scene.narration_beats.length === 0) {
    // The schema enforces .min(1) so this branch is unreachable, but keep
    // it for defensiveness if the schema ever loosens.
    warnings.push('narration_beats is empty')
  }
  if (scene.plot_points.length === 0) {
    warnings.push('plot_points is empty — most scenes have at least one mandatory beat')
  }
  if (scene.locations.length === 0) {
    warnings.push('locations is empty — most scenes describe at least one location')
  }
  if (scene.scene_exit_conditions.length === 0) {
    warnings.push('scene_exit_conditions is empty — most scenes have at least one exit')
  }

  return { errors, warnings }
}

// ---------------------------------------------------------------------------
// Top-level validator
// ---------------------------------------------------------------------------

export function validateModule(moduleId: string): ValidationReport {
  const report: ValidationReport = {
    module_id: moduleId,
    manifest_pass: false,
    manifest_errors: [],
    manifest_warnings: [],
    scenes: [],
    ok: false,
  }

  // 1. Manifest.
  const root = adventureRoot(moduleId)
  const manifestPath = path.join(root, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    report.manifest_errors.push(`manifest not found at ${manifestPath}`)
    return report
  }

  let manifest: Manifest | null = null
  try {
    manifest = parseManifest(readJsonOrThrow(manifestPath), manifestPath)
    report.manifest_pass = true
  } catch (err) {
    report.manifest_errors = formatZodErrors(err)
  }

  // 2. Scene files.
  const sceneFiles = listSceneFiles(moduleId)
  const allSceneIdsByFile = new Map<string, string>()
  // Pre-pass: collect every declared scene_id so cross-refs can resolve
  // even if file iteration order doesn't match the resolution order.
  const allSceneIds = new Set<string>()
  for (const file of sceneFiles) {
    try {
      const raw = readJsonOrThrow(file) as { scene_id?: string }
      if (typeof raw.scene_id === 'string') {
        allSceneIds.add(raw.scene_id)
        allSceneIdsByFile.set(file, raw.scene_id)
      }
    } catch {
      // Will be reported as a per-file error in the next pass.
    }
  }

  // Module-level NPC ids resolvable from `manifest.shared_npcs[]`. Empty
  // when the manifest didn't parse or the field is absent.
  const sharedNpcIds = new Set<string>(
    (manifest?.shared_npcs ?? []).map((n) => n.id)
  )

  for (const file of sceneFiles) {
    const sceneReport: SceneReport = {
      scene_id: allSceneIdsByFile.get(file) ?? null,
      file,
      schema_pass: false,
      schema_errors: [],
      ref_errors: [],
      warnings: [],
    }

    let scene: SceneContext | null = null
    try {
      scene = parseSceneContext(readJsonOrThrow(file), file)
      sceneReport.schema_pass = true
      sceneReport.scene_id = scene.scene_id
    } catch (err) {
      sceneReport.schema_errors = formatZodErrors(err)
    }

    if (scene) {
      const { errors, warnings } = crossReferenceScene(
        scene,
        allSceneIds,
        sharedNpcIds
      )
      sceneReport.ref_errors = errors
      sceneReport.warnings = warnings
    }

    report.scenes.push(sceneReport)
  }

  // 3. Manifest-level: warn for scenarios whose first_scene_id has no file.
  if (manifest) {
    for (const s of manifest.scenarios) {
      if (!allSceneIds.has(s.first_scene_id)) {
        report.manifest_warnings.push(
          `scenario "${s.id}" first_scene_id="${s.first_scene_id}" has no scene file under scenes/ — likely not yet ingested`
        )
      }
    }
  }

  // 4. Roll up overall ok flag.
  const sceneFatal = report.scenes.some(
    (s) => !s.schema_pass || s.ref_errors.length > 0
  )
  report.ok = report.manifest_pass && !sceneFatal
  return report
}

// ---------------------------------------------------------------------------
// CLI rendering
// ---------------------------------------------------------------------------

function renderReport(report: ValidationReport): void {
  console.log()
  console.log(c.bold(c.cyan(`=== Validating module: ${report.module_id} ===`)))
  console.log()

  // Manifest line.
  if (report.manifest_pass) {
    console.log(`  ${c.green('PASS')}  manifest.json`)
  } else {
    console.log(`  ${c.red('FAIL')}  manifest.json`)
    for (const line of report.manifest_errors) {
      console.log(`        ${c.red(line)}`)
    }
  }
  for (const w of report.manifest_warnings) {
    console.log(`  ${c.yellow('WARN')}  ${w}`)
  }

  // Per-scene lines.
  for (const s of report.scenes) {
    const label = s.scene_id ?? path.basename(s.file)
    if (s.schema_pass && s.ref_errors.length === 0) {
      console.log(`  ${c.green('PASS')}  ${label}  ${c.dim(`(${path.basename(s.file)})`)}`)
    } else {
      console.log(`  ${c.red('FAIL')}  ${label}  ${c.dim(`(${path.basename(s.file)})`)}`)
    }
    for (const e of s.schema_errors) {
      console.log(`        ${c.red(e)}`)
    }
    for (const e of s.ref_errors) {
      console.log(`        ${c.red(`x-ref: ${e}`)}`)
    }
    for (const w of s.warnings) {
      console.log(`        ${c.yellow(`warn:  ${w}`)}`)
    }
  }

  // Summary.
  console.log()
  const totalScenes = report.scenes.length
  const passedScenes = report.scenes.filter(
    (s) => s.schema_pass && s.ref_errors.length === 0
  ).length
  const totalWarnings =
    report.manifest_warnings.length +
    report.scenes.reduce((acc, s) => acc + s.warnings.length, 0)

  if (report.ok) {
    console.log(
      c.green(
        `PASS: manifest + ${passedScenes}/${totalScenes} scenes valid` +
          (totalWarnings > 0 ? `, ${totalWarnings} warning(s)` : '')
      )
    )
  } else {
    console.log(
      c.red(`FAIL: manifest + ${passedScenes}/${totalScenes} scenes valid`)
    )
  }
  console.log()
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

function main() {
  const moduleId = process.argv[2]
  if (!moduleId) {
    console.error('usage: validate-adventures.ts <module-id>')
    console.error('  e.g. node ... scripts/validate-adventures.ts blackthorn')
    process.exit(2)
  }

  // Sanity-check the schema imports exist (defensive — silently passing tests
  // when the schema file is empty would defeat the harness's purpose).
  if (typeof manifestSchema?.safeParse !== 'function') {
    console.error('manifestSchema is not a Zod schema — abort')
    process.exit(2)
  }
  if (typeof sceneContextSchema?.safeParse !== 'function') {
    console.error('sceneContextSchema is not a Zod schema — abort')
    process.exit(2)
  }

  const report = validateModule(moduleId)
  renderReport(report)
  process.exit(report.ok ? 0 : 1)
}

// Only run main() when executed as a script — guarded so the file is also
// importable for the programmatic API.
const isDirectRun = (() => {
  // Heuristic: when launched with node, process.argv[1] points at this file.
  // import.meta.url comparison is the cleaner check.
  const launched = process.argv[1] ? path.resolve(process.argv[1]) : ''
  const here = new URL(import.meta.url).pathname
  // On Windows the URL pathname starts with /C:/... — normalise.
  const normalised = process.platform === 'win32' && here.startsWith('/')
    ? here.slice(1)
    : here
  return path.resolve(normalised) === launched
})()

if (isDirectRun) {
  main()
}
