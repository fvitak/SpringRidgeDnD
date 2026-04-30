/**
 * Upload Blackthorn map + token assets to Supabase Storage.
 *
 * Per ADR 2026-04-28, the licensed art (© Urban Realms) does NOT live in the
 * repo. For development, assets sit under `public/maps/blackthorn/` (gitignored)
 * and the app reads them as static files. Before any non-local deployment,
 * run this script to copy them into a private Supabase Storage bucket and
 * flip the scenes table to use signed-URL paths.
 *
 * Usage:
 *   1. `cp -R _assets/blackthorn public/maps/blackthorn` (local dev)
 *   2. When ready to migrate to Storage:
 *        npx tsx scripts/upload-blackthorn-assets.ts
 *   3. Update scenes.image_path with the new storage paths (this script
 *      prints the SQL update statements; copy into a follow-up migration).
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (NOT the anon key — needs upload privilege)
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'node:fs'
import * as path from 'node:path'

const BUCKET = 'maps'
const SRC_ROOT = path.resolve(__dirname, '..', 'public', 'maps', 'blackthorn')
const DEST_PREFIX = 'blackthorn'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
    process.exit(1)
  }

  if (!fs.existsSync(SRC_ROOT)) {
    console.error(`Source folder not found: ${SRC_ROOT}`)
    console.error('Drop your map + token assets there first, then re-run.')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  // Ensure the bucket exists (private — signed URLs only).
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: false,
    })
    if (createErr) {
      console.error('Failed to create bucket:', createErr.message)
      process.exit(1)
    }
    console.log(`Created bucket "${BUCKET}".`)
  }

  // Walk public/maps/blackthorn recursively, upload each file.
  const files = walk(SRC_ROOT)
  const updates: Array<{ from: string; to: string }> = []
  for (const local of files) {
    const rel = path.relative(SRC_ROOT, local).split(path.sep).join('/')
    const remote = `${DEST_PREFIX}/${rel}`
    const buf = fs.readFileSync(local)
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(remote, buf, {
        upsert: true,
        contentType: contentTypeFor(local),
      })
    if (upErr) {
      console.warn(`Upload failed for ${remote}: ${upErr.message}`)
      continue
    }
    console.log(`✓ ${remote}`)
    updates.push({
      from: `/maps/blackthorn/${rel}`,
      to: `storage://${BUCKET}/${remote}`,
    })
  }

  if (updates.length > 0) {
    console.log('\nFollow-up migration: update scenes.image_path so the app reads from Storage.')
    console.log('Suggested SQL:')
    for (const u of updates) {
      console.log(
        `  UPDATE scenes SET image_path = '${u.to}' WHERE image_path = '${u.from}';`,
      )
    }
    console.log(
      '\nThen update lib/supabase to mint signed URLs for image_path values starting with "storage://".',
    )
  }
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
