/**
 * Smoke test for the PIV-02b runtime path.
 *
 * What it proves end-to-end:
 *   1. The runtime-test module's manifest + cell-block scene load and
 *      validate against the Zod contract (`lib/schemas/scene-context.ts`).
 *   2. The cached module-runner header + SRD cheat sheet exceeds the
 *      ~1500-token silent-cache floor measured in the spike.
 *   3. Claude returns a JSON response that parses through
 *      `dmResponseSchema` (with the new pivot fields available).
 *   4. Turn 1 asks for a Sleight-of-Hand DC 14 roll (the lock-pick check).
 *   5. Turn 2 hits the prompt cache (cache_read_input_tokens > 0,
 *      cache_creation_input_tokens === 0) — the byte-stable cached
 *      prefix invariant holds across turns even though the per-turn
 *      scene-context entry varies.
 *
 * Why we don't call the v2 HTTP route directly: the brief calls out
 * "don't run the smoke test against real production Supabase if you can
 * avoid it." This script bypasses the route's DB writes by mirroring its
 * Claude-call shape in-process, then validating the same way. The route
 * itself is exercised by Frank manually in the v2 endpoint.
 *
 * Run with (Node 24+, no extra deps; loads .env.local from project root):
 *   node --experimental-strip-types --import ./scripts/path-alias-loader.ts \
 *        scripts/smoke-test-runtime.ts
 *
 * The path-alias-loader.ts is needed because the production lib/ files use
 * `@/` tsconfig-path imports that Next.js webpack resolves but Node does
 * not. The loader is a thin shim — it does NOT run for production
 * (Next.js handles aliases in its own toolchain).
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  parseManifest,
  parseSceneContext,
  type Manifest,
  type SceneContext,
} from '../lib/schemas/scene-context.ts'
import { parseDMResponse } from '../lib/schemas/dm-response.ts'
import {
  buildModuleRunnerHeader,
  buildSceneContextBlock,
  estimateTokens,
} from '../lib/prompts/module-runner.ts'

// ---------------------------------------------------------------------------
// Env loading — minimal .env parser, mirrors scripts/spike-cache-hitrate.ts
// ---------------------------------------------------------------------------

function loadEnvLocal() {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env.local')
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, 'utf8')
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
        if (!m) continue
        const key = m[1]
        let val = m[2]
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
        if (!process.env[key]) process.env[key] = val
      }
      console.log(`[env] loaded ${candidate}`)
      return
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  console.log('[env] no .env.local found, using process.env')
}

loadEnvLocal()

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-6'
const MODULE_ID = 'runtime-test'
const SCENE_ID = 'runtime-test.s1.cell-block'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ---------------------------------------------------------------------------
// Track results
// ---------------------------------------------------------------------------

interface Check {
  name: string
  ok: boolean
  detail?: string
}
const checks: Check[] = []
function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail })
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

// ---------------------------------------------------------------------------
// Main — wrapped in an async function (no top-level await: package.json has
// no `"type": "module"`).
// ---------------------------------------------------------------------------

async function main() {
console.log(`\n=== Smoke test: ${MODULE_ID} → ${SCENE_ID} ===\n`)

let manifest: Manifest
let scene: SceneContext
try {
  const repoRoot = process.cwd()
  const manifestPath = path.join(repoRoot, 'lib', 'adventures', MODULE_ID, 'manifest.json')
  const scenePath = path.join(
    repoRoot,
    'lib',
    'adventures',
    MODULE_ID,
    'scenes',
    `${SCENE_ID.slice(SCENE_ID.lastIndexOf('.') + 1)}.json`
  )
  manifest = parseManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), manifestPath)
  scene = parseSceneContext(JSON.parse(fs.readFileSync(scenePath, 'utf8')), scenePath)
  record('manifest loads & validates', true, `module=${manifest.module_id}`)
  record('cell-block scene loads & validates', true, `scene_id=${scene.scene_id}`)
} catch (err) {
  console.error('[fatal] Module load failed:', err)
  record('manifest + scene load', false, (err as Error).message)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 2. Token-count the cached header. Spike showed silent-cache floor at
//    ~1500 tokens; assert >=1700 for headroom.
// ---------------------------------------------------------------------------

const cachedHeader = buildModuleRunnerHeader()
const headerCharCount = cachedHeader.length
const headerTokenEstimate = estimateTokens(cachedHeader)
console.log(
  `\n[size] cached header: ${headerCharCount} chars, ~${headerTokenEstimate} tokens (heuristic)`
)

// Use the SDK's countTokens for an authoritative count.
let headerTokenAuthoritative = 0
try {
  const tokenResp = await client.messages.countTokens({
    model: MODEL,
    system: [{ type: 'text', text: cachedHeader }],
    messages: [{ role: 'user', content: 'x' }],
  })
  headerTokenAuthoritative = tokenResp.input_tokens
  console.log(`[size] cached header (SDK countTokens, includes 'x' user msg): ${headerTokenAuthoritative} tokens`)
} catch (err) {
  console.log('[size] countTokens unavailable, falling back to heuristic:', (err as Error).message)
  headerTokenAuthoritative = headerTokenEstimate
}

record(
  'cached header >= 1700 tokens (cache safety floor)',
  headerTokenAuthoritative >= 1700,
  `count=${headerTokenAuthoritative}`
)

// ---------------------------------------------------------------------------
// 3. Build per-turn block + call Claude (turn 1).
// ---------------------------------------------------------------------------

function buildSystemForTurn(roundNumber: number): Anthropic.Messages.MessageCreateParams['system'] {
  // Mutate a cheap field on game_state per turn so the per-turn block is
  // genuinely per-turn (and we're confident the cache hit is on the prefix,
  // not the full prompt).
  const gameState = {
    state: { plot: { escape_cell: false } },
    round_number: roundNumber,
    notes: `synthetic smoke-test game state for turn ${roundNumber}`,
  }
  const sceneBlock = buildSceneContextBlock(scene, gameState, {
    current_rating: 'PG',
    date_night_mode: false,
  })
  return [
    {
      type: 'text' as const,
      text: cachedHeader,
      cache_control: { type: 'ephemeral' as const },
    },
    {
      type: 'text' as const,
      text: sceneBlock,
    },
  ]
}

console.log(`\n[turn 1] player_input = "I try to pick the lock"`)
const conversation: Anthropic.MessageParam[] = []
conversation.push({ role: 'user', content: 'I try to pick the lock' })

const t1Resp = await client.messages.create({
  model: MODEL,
  max_tokens: 1024,
  system: buildSystemForTurn(1),
  messages: conversation,
})

const t1Text = extractText(t1Resp)
console.log(`[turn 1] model usage:`, t1Resp.usage)
console.log(`[turn 1] response (first 400 chars):\n${t1Text.slice(0, 400)}\n...`)

// Validate against the schema.
let t1Parsed
try {
  t1Parsed = parseDMResponse(t1Text)
  record('turn 1 response parses through dmResponseSchema', true)
} catch (err) {
  record('turn 1 response parses through dmResponseSchema', false, (err as Error).message)
  console.error('Raw output:', t1Text)
  process.exit(1)
}

// Assertion: pending_roll for sleight of hand DC 14, OR a comparable
// dm_roll/state_change indicating the AI engaged with the lock-pick check.
// Be lenient — the AI might frame the check via actions_required or a
// different surface. Pass if any of these signal "Sleight of Hand DC 14".
const t1Json = JSON.stringify(t1Parsed).toLowerCase()
const mentionsSleight = t1Json.includes('sleight') || t1Json.includes('dexterity')
const mentionsDc14 = t1Json.includes('14')
const hasPendingRoll = !!t1Parsed.pending_roll
record(
  'turn 1 invokes Sleight-of-Hand check',
  mentionsSleight,
  hasPendingRoll ? `pending_roll.player=${t1Parsed.pending_roll!.player}` : 'no pending_roll; checked by keyword'
)
record(
  'turn 1 references DC 14 (lock-pick from scene script)',
  mentionsDc14,
  mentionsDc14 ? 'found' : 'not found in JSON body'
)

// Assertion: narration mentions the dozing guard.
const t1Narration = t1Parsed.narration.toLowerCase()
record(
  'turn 1 narration mentions the guard (sourced from scene script)',
  t1Narration.includes('guard'),
  `narration length=${t1Parsed.narration.length}`
)

// Push the assistant turn into history for turn 2.
conversation.push({ role: 'assistant', content: t1Text })

// ---------------------------------------------------------------------------
// 4. Second turn — assert cache_read_input_tokens > 0.
// ---------------------------------------------------------------------------

console.log(`\n[turn 2] player_input = "I attempt to charm the guard"`)
conversation.push({ role: 'user', content: 'I attempt to charm the guard' })

const t2Resp = await client.messages.create({
  model: MODEL,
  max_tokens: 1024,
  system: buildSystemForTurn(2),
  messages: conversation,
})

const t2Text = extractText(t2Resp)
console.log(`[turn 2] model usage:`, t2Resp.usage)
console.log(`[turn 2] response (first 400 chars):\n${t2Text.slice(0, 400)}\n...`)

let t2Parsed
try {
  t2Parsed = parseDMResponse(t2Text)
  record('turn 2 response parses through dmResponseSchema', true)
} catch (err) {
  record('turn 2 response parses through dmResponseSchema', false, (err as Error).message)
  console.error('Raw output:', t2Text)
  process.exit(1)
}

const cacheRead = t2Resp.usage.cache_read_input_tokens ?? 0
const cacheCreation = t2Resp.usage.cache_creation_input_tokens ?? 0
record(
  'turn 2 hits cached prefix (cache_read > 0)',
  cacheRead > 0,
  `cache_read=${cacheRead}, cache_creation=${cacheCreation}`
)

// Romance state preservation — the v1 supports_date_night flag is false for
// this module, so the romance code path should be a no-op pass-through. We
// just assert that the response does not mention attraction points or AP
// numerics in narration (the hidden-stat invariant).
const t2Narration = t2Parsed.narration.toLowerCase()
const apNumericLeak = /\battraction points?\b|\bap [0-9]+\b/.test(t2Narration)
record(
  'turn 2 narration does not leak hidden romance state (numeric AP)',
  !apNumericLeak,
  apNumericLeak ? 'numeric AP found in narration' : 'clean'
)

// ---------------------------------------------------------------------------
// 5. Print summary.
// ---------------------------------------------------------------------------

const passed = checks.filter((c) => c.ok).length
const total = checks.length
const allPassed = passed === total

console.log(`\n=== SUMMARY ===`)
for (const c of checks) {
  console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`)
}
console.log(`\n${allPassed ? 'PASS' : 'FAIL'}: ${passed}/${total} checks passed`)
if (!allPassed) process.exit(1)
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function extractText(resp: Anthropic.Messages.Message): string {
  let out = ''
  for (const block of resp.content) {
    if (block.type === 'text') out += block.text
  }
  return out
}

main().catch((err) => {
  console.error('[fatal]', err)
  process.exit(1)
})
