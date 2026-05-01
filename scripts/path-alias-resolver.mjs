// Node ESM module hooks — resolves `@/...` to project-root-relative paths.
// Paired with scripts/path-alias-loader.ts. See that file for usage.

import { pathToFileURL } from 'node:url'
import * as path from 'node:path'

// Project root is passed in via register()'s data argument.
let projectRoot = process.cwd()

export async function initialize(rootURL) {
  if (!rootURL) return
  // rootURL is a file:// URL ending in a separator.
  const u = new URL(rootURL)
  // pathname starts with a leading slash on POSIX and on Windows like /C:/...
  projectRoot = path.normalize(decodeURIComponent(u.pathname.replace(/^\/([A-Z]:)/, '$1')))
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const rest = specifier.slice(2)
    // Try `<rest>.ts` first (most lib files), fall back to `<rest>.tsx`,
    // then `<rest>` as-is. Node's strip-types only handles .ts/.tsx, so we
    // bias toward those.
    const candidates = [
      path.join(projectRoot, rest + '.ts'),
      path.join(projectRoot, rest + '.tsx'),
      path.join(projectRoot, rest),
    ]
    for (const candidate of candidates) {
      try {
        const url = pathToFileURL(candidate).href
        return await nextResolve(url, context)
      } catch {
        // try next
      }
    }
  }
  return nextResolve(specifier, context)
}
