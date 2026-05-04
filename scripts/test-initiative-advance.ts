/**
 * POL-15-21-22b — Initiative advance helper unit test.
 *
 * Verifies `advanceInitiative` against a synthetic session with a 4-entry
 * initiative containing 2 PCs and 2 NPCs:
 *
 *   1. First call advances index 0 → 1 within the same round, returns
 *      the next character's name.
 *   2. Second call with the SAME triggering id is a no-op (idempotent).
 *   3. Third call with a NEW triggering id advances index 1 → 2 (Tarric,
 *      a PC), and creates the corresponding ledger row for round 1.
 *   4. Fourth call advances index 2 → 3 (NPC2).
 *   5. Fifth call wraps: index 3 → 0, round 1 → 2, reaction_reset = true.
 *
 * Also asserts:
 *   - Idempotency leaves snapshot_seq unchanged.
 *   - Ledger row is created for the new active PC at the start of the
 *     new round.
 *
 * Run with (Node 24+, loads .env.local from project root):
 *   node --experimental-strip-types --import ./scripts/path-alias-loader.ts \
 *        scripts/test-initiative-advance.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { advanceInitiative } from '../lib/db/initiative.ts'
import { upsertGameState, getGameState } from '../lib/db/game-state.ts'

// ---------------------------------------------------------------------------
// Env loading
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
// Fixture
// ---------------------------------------------------------------------------

const NAME_WYNN = `test-init-wynn-${Date.now()}`
const NAME_TARRIC = `test-init-tarric-${Date.now()}`

let sessionId = ''
let wynnId = ''
let tarricId = ''

async function setup(): Promise<void> {
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .insert({ name: 'TEST: initiative-advance' })
    .select('id')
    .maybeSingle()
  if (sErr || !session?.id) {
    throw new Error(`setup: failed to create session: ${sErr?.message ?? 'no row'}`)
  }
  sessionId = session.id

  const { data: wynn, error: wErr } = await supabase
    .from('characters')
    .insert({
      session_id: sessionId,
      player_name: 'TEST',
      character_name: NAME_WYNN,
      class: 'Wizard',
      race: 'Half-elf',
      hp: 18,
      max_hp: 18,
      ac: 12,
    })
    .select('id')
    .maybeSingle()
  if (wErr || !wynn?.id) throw new Error(`setup: wynn: ${wErr?.message}`)
  wynnId = wynn.id

  const { data: tarric, error: tErr } = await supabase
    .from('characters')
    .insert({
      session_id: sessionId,
      player_name: 'TEST',
      character_name: NAME_TARRIC,
      class: 'Fighter',
      race: 'Human',
      hp: 22,
      max_hp: 22,
      ac: 16,
    })
    .select('id')
    .maybeSingle()
  if (tErr || !tarric?.id) throw new Error(`setup: tarric: ${tErr?.message}`)
  tarricId = tarric.id

  // Seed combat_state: 4-entry initiative — Wynn / NPC1 / Tarric / NPC2.
  // active_initiative_index = 0 (Wynn's turn), round = 1.
  await upsertGameState(sessionId, {
    combat_state: {
      active: true,
      round: 1,
      active_initiative_index: 0,
      snapshot_seq: 0,
      initiative: [
        {
          name: NAME_WYNN,
          initiative: 18,
          hp: 18,
          max_hp: 18,
          is_player: true,
          conditions: [],
        },
        {
          name: 'NPC1',
          initiative: 14,
          hp: 6,
          max_hp: 6,
          is_player: false,
          conditions: [],
        },
        {
          name: NAME_TARRIC,
          initiative: 12,
          hp: 22,
          max_hp: 22,
          is_player: true,
          conditions: [],
        },
        {
          name: 'NPC2',
          initiative: 8,
          hp: 6,
          max_hp: 6,
          is_player: false,
          conditions: [],
        },
      ],
    },
  })

  console.log(
    `[setup] session=${sessionId} wynn=${wynnId} tarric=${tarricId}`,
  )
}

async function cleanup(): Promise<void> {
  if (sessionId) {
    await supabase.from('sessions').delete().eq('id', sessionId)
    console.log(`[cleanup] deleted session ${sessionId}`)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runChecks(): Promise<void> {
  console.log('\n=== POL-15-21-22b initiative-advance test ===\n')

  // 1. First advance: 0 (Wynn) → 1 (NPC1), round 1, no wrap.
  const r1 = await advanceInitiative(sessionId, 'fake-id-1')
  record(
    'advance #1: 0 → 1 (NPC1), round 1',
    r1?.advanced === true &&
      r1?.new_round === 1 &&
      r1?.new_active_index === 1 &&
      r1?.new_active_character_name === 'NPC1' &&
      r1?.reaction_reset === false,
    `result=${JSON.stringify(r1)}`,
  )

  // Capture snapshot_seq after first advance for the idempotency check.
  const gsAfter1 = await getGameState(sessionId)
  const seqAfter1 =
    (gsAfter1?.combat_state as { snapshot_seq?: number } | null)?.snapshot_seq ?? -1

  // 2. Idempotency: same triggering id ⇒ null, no state change.
  const r2 = await advanceInitiative(sessionId, 'fake-id-1')
  record(
    'advance #1 again with same id: returns null (idempotent)',
    r2 === null,
    `result=${JSON.stringify(r2)}`,
  )

  const gsAfter2 = await getGameState(sessionId)
  const seqAfter2 =
    (gsAfter2?.combat_state as { snapshot_seq?: number } | null)?.snapshot_seq ?? -1
  record(
    'idempotency: snapshot_seq unchanged after no-op advance',
    seqAfter1 === seqAfter2,
    `before=${seqAfter1} after=${seqAfter2}`,
  )

  // 3. New triggering id advances: 1 → 2 (Tarric), round 1.
  //    Tarric is a PC, so a ledger row should be created at round 1.
  const r3 = await advanceInitiative(sessionId, 'fake-id-2')
  record(
    'advance #2: 1 → 2 (Tarric), round 1',
    r3?.advanced === true &&
      r3?.new_round === 1 &&
      r3?.new_active_index === 2 &&
      r3?.new_active_character_name === NAME_TARRIC &&
      r3?.reaction_reset === false,
    `result=${JSON.stringify(r3)}`,
  )

  const { data: tarricLedger } = await supabase
    .from('character_combat_turn')
    .select('round, action_used')
    .eq('session_id', sessionId)
    .eq('character_id', tarricId)
    .eq('round', 1)
    .maybeSingle()
  record(
    'Tarric ledger row exists for round 1 (created by advance helper)',
    tarricLedger?.round === 1 && tarricLedger?.action_used === false,
    `ledger=${JSON.stringify(tarricLedger)}`,
  )

  // 4. Next advance: 2 → 3 (NPC2), still round 1.
  const r4 = await advanceInitiative(sessionId, 'fake-id-3')
  record(
    'advance #3: 2 → 3 (NPC2), round 1',
    r4?.advanced === true &&
      r4?.new_round === 1 &&
      r4?.new_active_index === 3 &&
      r4?.new_active_character_name === 'NPC2' &&
      r4?.reaction_reset === false,
    `result=${JSON.stringify(r4)}`,
  )

  // 5. Wrap: 3 → 0 (Wynn), round 1 → 2, reaction_reset = true.
  const r5 = await advanceInitiative(sessionId, 'fake-id-4')
  record(
    'advance #4: 3 → 0 wraps to round 2 (Wynn), reaction_reset=true',
    r5?.advanced === true &&
      r5?.new_round === 2 &&
      r5?.new_active_index === 0 &&
      r5?.new_active_character_name === NAME_WYNN &&
      r5?.reaction_reset === true,
    `result=${JSON.stringify(r5)}`,
  )

  // Wynn is a PC — round-2 ledger row should now exist.
  const { data: wynnLedgerR2 } = await supabase
    .from('character_combat_turn')
    .select('round, action_used, reaction_used')
    .eq('session_id', sessionId)
    .eq('character_id', wynnId)
    .eq('round', 2)
    .maybeSingle()
  record(
    'Wynn ledger row exists for round 2 with reaction_used=false',
    wynnLedgerR2?.round === 2 && wynnLedgerR2?.reaction_used === false,
    `ledger=${JSON.stringify(wynnLedgerR2)}`,
  )

  // 6. snapshot_seq has been bumped 4 times (advances 1, 3, 4, 5). The
  //    no-op advance (2) didn't bump.
  const gsFinal = await getGameState(sessionId)
  const seqFinal =
    (gsFinal?.combat_state as { snapshot_seq?: number } | null)?.snapshot_seq ?? -1
  record(
    'snapshot_seq bumped exactly 4 times (one per real advance)',
    seqFinal === 4,
    `final snapshot_seq=${seqFinal}`,
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
