/**
 * Adventure module loader.
 *
 * Reads `lib/adventures/<module-id>/manifest.json` and per-scene files,
 * validates them against the Zod contract from
 * `lib/schemas/scene-context.ts`, and returns typed objects. Throws on
 * any validation failure so a bad in-tree fixture fails loud at runtime
 * rather than silently corrupting the prompt.
 *
 * This is the runtime entry point — both `app/api/dm-action-v2/route.ts`
 * and `scripts/smoke-test-runtime.ts` go through here.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  type Manifest,
  type SceneContext,
  parseManifest,
  parseSceneContext,
} from '@/lib/schemas/scene-context'

/**
 * Resolve the on-disk root for an adventure module. Co-located with
 * source so it ships with the build.
 */
function adventureRoot(moduleId: string): string {
  // process.cwd() at runtime is the Next.js project root.
  return path.join(process.cwd(), 'lib', 'adventures', moduleId)
}

function readJson(absPath: string): unknown {
  const raw = fs.readFileSync(absPath, 'utf8')
  return JSON.parse(raw)
}

/**
 * Load and validate a module's manifest.
 * Throws with a clear error if the manifest is missing or malformed.
 */
export function loadManifest(moduleId: string): Manifest {
  const manifestPath = path.join(adventureRoot(moduleId), 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `[loader] manifest not found for module "${moduleId}" at ${manifestPath}`
    )
  }
  const raw = readJson(manifestPath)
  return parseManifest(raw, manifestPath)
}

/**
 * Load and validate a single scene by id within a module.
 *
 * Convention: scene file basename is the *last segment* of the
 * dot-separated `scene_id` (e.g. `runtime-test.s1.cell-block` →
 * `scenes/cell-block.json`). This keeps file paths short and avoids
 * embedding the dotted id in the filename.
 *
 * Throws with a clear error if the scene file is missing, the JSON is
 * malformed, or the parsed object fails Zod validation.
 */
export function loadScene(moduleId: string, sceneId: string): SceneContext {
  const root = adventureRoot(moduleId)
  const fileName = `${sceneIdBasename(sceneId)}.json`
  const scenePath = path.join(root, 'scenes', fileName)
  if (!fs.existsSync(scenePath)) {
    throw new Error(
      `[loader] scene not found: module="${moduleId}" scene_id="${sceneId}" expected="${scenePath}"`
    )
  }
  const raw = readJson(scenePath)
  const scene = parseSceneContext(raw, scenePath)
  // Defensive: scene.scene_id must match the requested id.
  if (scene.scene_id !== sceneId) {
    throw new Error(
      `[loader] scene_id mismatch: file declares "${scene.scene_id}", caller requested "${sceneId}" (path: ${scenePath})`
    )
  }
  return scene
}

/**
 * Convenience: load both manifest and the requested scene in one call.
 * Used by the v2 API route on every turn.
 */
export function loadModuleAndScene(
  moduleId: string,
  sceneId: string
): { manifest: Manifest; scene: SceneContext } {
  const manifest = loadManifest(moduleId)
  const scene = loadScene(moduleId, sceneId)
  return { manifest, scene }
}

function sceneIdBasename(sceneId: string): string {
  const idx = sceneId.lastIndexOf('.')
  return idx >= 0 ? sceneId.slice(idx + 1) : sceneId
}
