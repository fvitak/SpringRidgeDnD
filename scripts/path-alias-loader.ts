/**
 * Tiny Node ESM resolver that maps `@/` (the tsconfig path alias) to the
 * project root. Used by `scripts/smoke-test-runtime.ts` and any future
 * standalone TS script that imports from `lib/`.
 *
 * Wire it into Node with:
 *   node --experimental-strip-types --import ./scripts/path-alias-loader.ts <script>
 *
 * Production Next.js handles `@/` via webpack — this loader is only for
 * Node-direct script execution.
 */

import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import * as path from 'node:path'

// Build the loader URL relative to this file so the registration is
// location-independent. The second arg to register() is the parentURL
// against which the resolver path is interpreted; `import.meta.url` is
// the right anchor.
const loaderURL = pathToFileURL(path.join(import.meta.dirname, 'path-alias-resolver.mjs'))
register(loaderURL.href, {
  parentURL: import.meta.url,
  data: pathToFileURL(process.cwd() + path.sep).href,
})
