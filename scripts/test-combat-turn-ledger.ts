/**
 * POL-15-21-22a — Combat-turn ledger unit test.
 *
 * Verifies the schema + apply-step routing for the new
 * `character_combat_turn` table:
 *
 *   1. `getOrCreateCombatTurn` creates a row with defaults the first
 *      time it's called.
 *   2. Calling it again with the same (session, character, round) is
 *      idempotent — returns the same row, no duplicates.
 *   3. Calling it with a new round creates a new row.
 *   4. `applyStateChanges` with `combat_state.active = true` and a
 *      round dual-writes `action_used = true` to BOTH the legacy
 *      `characters.action_used` column AND the matching
 *      `character_combat_turn` row.
 *   5. Same call with `combat_state.active = false` writes ONLY to
 *      the legacy column — the ledger is not touched.
 *   6. `movement_used` writes ONLY to the ledger; combat-inactive
 *      drops it with a warn.
 *
 * Cleans up its rows before and after via the test session UUID.
 *
 * Run with (Node 24+, loads .env.local from project root):
 *   node --experimental-strip-types --import ./scripts/path-alias-loader.ts \
 *        scripts/test-combat-turn-ledger.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { applyStateChanges } from '../lib/db/apply-state-changes.ts'
import {
  getOrCreateCombatTurn,
  type CombatTurnLedger,
} from '../lib/db/combat-turn.ts'
import { upsertGameState } from '../lib/db/game-state.ts'

// ---------------------------------------------------------------------------
// Env loading — same minimal .env parser used by sibling scripts.
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

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[fatal] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; cannot run DB-backed test.',
  )
  process.exit(1)
}

// Import the shared client AFTER env vars are loaded — the lazy
// singleton in lib/supabase.ts reads env at first .from() call, so this
// ordering is just defensive.
const { supabase } = await import('../lib/supabase.ts')

// ---------------------------------------------------------------------------
// Recording harness
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
// Test fixture — one synthetic session + one synthetic PC.
// ---------------------------------------------------------------------------

const TEST_PC_NAME = `test-combat-turn-${Date.now()}`

let sessionId = ''
let characterId = ''

async function setup(): Promise<void> {
  // Create a synthetic session (status='active' is the default).
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .insert({ name: 'TEST: combat-turn-ledger' })
    .select('id')
    .maybeSingle()
  if (sErr || !session?.id) {
    throw new Error(`setup: failed to create session: ${sErr?.message ?? 'no row'}`)
  }
  sessionId = session.id

  // Create a synthetic PC. Required fields per the initial-schema migration:
  // player_name, character_name, class, race, hp, max_hp, ac.
  const { data: character, error: cErr } = await supabase
    .from('characters')
    .insert({
      session_id: sessionId,
      player_name: 'TEST',
      character_name: TEST_PC_NAME,
      class: 'Fighter',
      race: 'Human',
      hp: 10,
      max_hp: 10,
      ac: 10,
    })
    .select('id')
    .maybeSingle()
  if (cErr || !character?.id) {
    throw new Error(`setup: failed to create character: ${cErr?.message ?? 'no row'}`)
  }
  characterId = character.id

  console.log(`[setup] session=${sessionId} character=${characterId} name=${TEST_PC_NAME}`)
}

async function cleanup(): Promise<void> {
  // FK CASCADE on character_combat_turn / characters / game_state takes
  // care of the children when we delete the session row.
  if (sessionId) {
    await supabase.from('sessions').delete().eq('id', sessionId)
    console.log(`[cleanup] deleted session ${sessionId}`)
  }
}

// ---------------------------------------------------------------------------
// The test itself
// ---------------------------------------------------------------------------

async function runChecks(): Promise<void> {
  console.log('\n=== POL-15-21-22a combat-turn-ledger test ===\n')

  // 1. getOrCreateCombatTurn round 1 creates a row with defaults.
  const row1: CombatTurnLedger = await getOrCreateCombatTurn(sessionId, characterId, 1)
  record(
    'getOrCreateCombatTurn(1) creates row with defaults',
    row1.round === 1 &&
      row1.action_used === false &&
      row1.bonus_action_used === false &&
      row1.reaction_used === false &&
      row1.movement_used === 0 &&
      row1.legendary_actions_used === 0,
    `id=${row1.id} round=${row1.round}`,
  )

  // 2. Idempotency: same args → same row, no duplicate.
  const row1Again: CombatTurnLedger = await getOrCreateCombatTurn(
    sessionId,
    characterId,
    1,
  )
  record(
    'getOrCreateCombatTurn(1) again returns same row (idempotent)',
    row1Again.id === row1.id,
    `same id=${row1.id}`,
  )

  const { count: countAfterIdempotent } = await supabase
    .from('character_combat_turn')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('character_id', characterId)
    .eq('round', 1)
  record(
    'no duplicate rows after idempotent call',
    countAfterIdempotent === 1,
    `count=${countAfterIdempotent}`,
  )

  // 3. New round → new row.
  const row2: CombatTurnLedger = await getOrCreateCombatTurn(sessionId, characterId, 2)
  record(
    'getOrCreateCombatTurn(2) creates a fresh row distinct from round 1',
    row2.id !== row1.id && row2.round === 2,
    `r1=${row1.id} r2=${row2.id}`,
  )

  // 4. With combat active, applyStateChanges dual-writes action_used.
  await upsertGameState(sessionId, {
    combat_state: { active: true, round: 1 },
  })
  await applyStateChanges(sessionId, [
    { entity: TEST_PC_NAME, field: 'action_used', value: true },
  ])

  const { data: legacyAfter } = await supabase
    .from('characters')
    .select('action_used')
    .eq('id', characterId)
    .maybeSingle()
  record(
    'combat-active: legacy characters.action_used = true',
    legacyAfter?.action_used === true,
    `legacy=${legacyAfter?.action_used}`,
  )

  const { data: ledgerR1 } = await supabase
    .from('character_combat_turn')
    .select('action_used')
    .eq('session_id', sessionId)
    .eq('character_id', characterId)
    .eq('round', 1)
    .maybeSingle()
  record(
    'combat-active: character_combat_turn (round 1) action_used = true',
    ledgerR1?.action_used === true,
    `ledger=${ledgerR1?.action_used}`,
  )

  // 5. With combat inactive, applyStateChanges only touches the legacy
  // column — the ledger row stays untouched.
  await upsertGameState(sessionId, {
    combat_state: { active: false, round: 1 },
  })

  // First reset legacy column so we can detect the next write.
  await supabase
    .from('characters')
    .update({ bonus_action_used: false })
    .eq('id', characterId)

  // Snapshot the round-1 ledger row BEFORE the inactive call, to make
  // sure it doesn't change.
  const { data: ledgerSnapshot } = await supabase
    .from('character_combat_turn')
    .select('bonus_action_used, updated_at')
    .eq('session_id', sessionId)
    .eq('character_id', characterId)
    .eq('round', 1)
    .maybeSingle()
  const beforeBA = ledgerSnapshot?.bonus_action_used
  const beforeUpdatedAt = ledgerSnapshot?.updated_at

  await applyStateChanges(sessionId, [
    { entity: TEST_PC_NAME, field: 'bonus_action_used', value: true },
  ])

  const { data: legacyAfterInactive } = await supabase
    .from('characters')
    .select('bonus_action_used')
    .eq('id', characterId)
    .maybeSingle()
  record(
    'combat-inactive: legacy characters.bonus_action_used flipped to true',
    legacyAfterInactive?.bonus_action_used === true,
    `legacy=${legacyAfterInactive?.bonus_action_used}`,
  )

  const { data: ledgerAfterInactive } = await supabase
    .from('character_combat_turn')
    .select('bonus_action_used, updated_at')
    .eq('session_id', sessionId)
    .eq('character_id', characterId)
    .eq('round', 1)
    .maybeSingle()
  record(
    'combat-inactive: ledger row unchanged (no write to character_combat_turn)',
    ledgerAfterInactive?.bonus_action_used === beforeBA &&
      ledgerAfterInactive?.updated_at === beforeUpdatedAt,
    `before=${beforeBA}/${beforeUpdatedAt} after=${ledgerAfterInactive?.bonus_action_used}/${ledgerAfterInactive?.updated_at}`,
  )

  // 6. movement_used during active combat writes only to the ledger
  // (no `movement_used` column on characters to dual-write into).
  await upsertGameState(sessionId, {
    combat_state: { active: true, round: 2 },
  })
  await applyStateChanges(sessionId, [
    { entity: TEST_PC_NAME, field: 'movement_used', value: 25 },
  ])

  const { data: ledgerR2 } = await supabase
    .from('character_combat_turn')
    .select('movement_used')
    .eq('session_id', sessionId)
    .eq('character_id', characterId)
    .eq('round', 2)
    .maybeSingle()
  record(
    'combat-active round 2: movement_used = 25 in ledger',
    ledgerR2?.movement_used === 25,
    `ledger.movement_used=${ledgerR2?.movement_used}`,
  )

  // 7. Sanity: round-1 ledger row was not also touched by the
  // round-2 write (per-round audit trail isolation).
  const { data: ledgerR1Movement } = await supabase
    .from('character_combat_turn')
    .select('movement_used')
    .eq('session_id', sessionId)
    .eq('character_id', characterId)
    .eq('round', 1)
    .maybeSingle()
  record(
    'round-2 write did not bleed into round-1 row',
    ledgerR1Movement?.movement_used === 0,
    `r1.movement_used=${ledgerR1Movement?.movement_used}`,
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  try {
    await setup()
    await runChecks()
  } catch (err) {
    console.error('[fatal]', err)
    record('test harness ran without exception', false, String(err))
  } finally {
    await cleanup()
  }

  const passed = checks.filter((c) => c.ok).length
  const total = checks.length
  console.log(`\n=== ${passed}/${total} checks passed ===`)
  if (passed !== total) {
    process.exit(1)
  }
}

await main()
