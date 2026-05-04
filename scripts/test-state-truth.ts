/**
 * POL-15-21-22b — State-truth builder unit test.
 *
 * Verifies `buildStateTruth` against a synthetic session in two states:
 *
 *   1. Combat ACTIVE: assert
 *      - `active === true`
 *      - `round`, `active_initiative_index` echo combat_state
 *      - `active_character_name` resolves from initiative entry
 *      - `initiative_order[]` carries enriched ledger fields ONLY on PCs
 *      - `party_status[]` populated from characters table
 *      - `snapshot_seq` echoes combat_state.snapshot_seq
 *
 *   2. Combat INACTIVE: assert minimal shape
 *      `{ active: false, initiative_order: [], party_status: [] }`
 *
 * Run with (Node 24+, loads .env.local from project root):
 *   node --experimental-strip-types --import ./scripts/path-alias-loader.ts \
 *        scripts/test-state-truth.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildStateTruth } from '../lib/db/state-truth.ts'
import { upsertGameState } from '../lib/db/game-state.ts'
import { getOrCreateCombatTurn } from '../lib/db/combat-turn.ts'

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

const NAME_WYNN = `test-st-wynn-${Date.now()}`
const NAME_TARRIC = `test-st-tarric-${Date.now()}`

let sessionId = ''
let wynnId = ''
let tarricId = ''

async function setup(): Promise<void> {
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .insert({ name: 'TEST: state-truth' })
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
      hp: 14,
      max_hp: 18,
      ac: 12,
      conditions: ['concentrating: bless'],
      spell_slots: { '1': 2, '2': 1 },
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
      conditions: [],
      spell_slots: {},
    })
    .select('id')
    .maybeSingle()
  if (tErr || !tarric?.id) throw new Error(`setup: tarric: ${tErr?.message}`)
  tarricId = tarric.id

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
  console.log('\n=== POL-15-21-22b state-truth test ===\n')

  // ---- Case A: combat INACTIVE, no combat_state at all ----
  // Pre-condition: game_state has no combat_state set yet.
  const inactive = await buildStateTruth(sessionId)
  record(
    'inactive (no combat_state): { active: false, initiative_order: [], party_status: [] }',
    inactive.active === false &&
      Array.isArray(inactive.initiative_order) &&
      inactive.initiative_order.length === 0 &&
      Array.isArray(inactive.party_status) &&
      inactive.party_status.length === 0 &&
      inactive.round === undefined &&
      inactive.active_initiative_index === undefined &&
      inactive.active_character_name === undefined,
    `result keys=${Object.keys(inactive).join(',')}`,
  )

  // ---- Case B: combat_state present but active=false ----
  await upsertGameState(sessionId, {
    combat_state: { active: false, round: 1, initiative: [] },
  })
  const inactiveB = await buildStateTruth(sessionId)
  record(
    'combat_state.active=false: minimal shape',
    inactiveB.active === false &&
      inactiveB.initiative_order.length === 0 &&
      inactiveB.party_status.length === 0,
    `result=${JSON.stringify(inactiveB)}`,
  )

  // ---- Case C: combat ACTIVE with initiative + ledger row for Wynn ----
  // Wynn used her bonus action (round 1).
  await getOrCreateCombatTurn(sessionId, wynnId, 1)
  await supabase
    .from('character_combat_turn')
    .update({ bonus_action_used: true, movement_used: 15 })
    .eq('session_id', sessionId)
    .eq('character_id', wynnId)
    .eq('round', 1)

  // Tarric has no ledger row yet (we want to assert the helper still
  // surfaces default 0/false fields for him).

  await upsertGameState(sessionId, {
    combat_state: {
      active: true,
      round: 1,
      active_initiative_index: 0,
      snapshot_seq: 7,
      initiative: [
        {
          name: NAME_WYNN,
          initiative: 18,
          hp: 14,
          max_hp: 18,
          is_player: true,
          conditions: ['concentrating: bless'],
        },
        {
          name: 'GoblinScout',
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
      ],
    },
  })

  const active = await buildStateTruth(sessionId)

  record(
    'active: active===true, round=1, snapshot_seq=7',
    active.active === true && active.round === 1 && active.snapshot_seq === 7,
    `active=${active.active} round=${active.round} seq=${active.snapshot_seq}`,
  )

  record(
    'active: active_initiative_index=0, active_character_name=Wynn',
    active.active_initiative_index === 0 &&
      active.active_character_name === NAME_WYNN,
    `idx=${active.active_initiative_index} name=${active.active_character_name}`,
  )

  record(
    'active: initiative_order has 3 entries',
    active.initiative_order.length === 3,
    `len=${active.initiative_order.length}`,
  )

  // Wynn (PC, has ledger row): all four ledger fields present.
  const wynnEntry = active.initiative_order[0]
  record(
    'active: Wynn entry has ledger fields populated from row',
    wynnEntry?.is_player === true &&
      wynnEntry?.action_used === false &&
      wynnEntry?.bonus_action_used === true &&
      wynnEntry?.reaction_used === false &&
      wynnEntry?.movement_used === 15,
    `wynn=${JSON.stringify(wynnEntry)}`,
  )

  // Goblin (NPC): ledger fields ABSENT (not enriched for non-players).
  const goblinEntry = active.initiative_order[1]
  record(
    'active: NPC entry has NO ledger fields',
    goblinEntry?.is_player === false &&
      goblinEntry?.action_used === undefined &&
      goblinEntry?.bonus_action_used === undefined &&
      goblinEntry?.reaction_used === undefined &&
      goblinEntry?.movement_used === undefined,
    `goblin=${JSON.stringify(goblinEntry)}`,
  )

  // Tarric (PC, no ledger row): ledger fields default to false/0.
  const tarricEntry = active.initiative_order[2]
  record(
    'active: PC without ledger row gets default ledger fields (false/0)',
    tarricEntry?.is_player === true &&
      tarricEntry?.action_used === false &&
      tarricEntry?.bonus_action_used === false &&
      tarricEntry?.reaction_used === false &&
      tarricEntry?.movement_used === 0,
    `tarric=${JSON.stringify(tarricEntry)}`,
  )

  // party_status: 2 entries (Wynn + Tarric), populated from characters.
  record(
    'active: party_status has 2 entries',
    active.party_status.length === 2,
    `len=${active.party_status.length}`,
  )

  const wynnStatus = active.party_status.find((p) => p.name === NAME_WYNN)
  record(
    'active: party_status[Wynn] hp=14, max=18, conditions+spell_slots present',
    wynnStatus?.hp === 14 &&
      wynnStatus?.max_hp === 18 &&
      Array.isArray(wynnStatus?.conditions) &&
      wynnStatus?.conditions.includes('concentrating: bless') &&
      wynnStatus?.spell_slots?.['1'] === 2 &&
      wynnStatus?.spell_slots?.['2'] === 1,
    `wynnStatus=${JSON.stringify(wynnStatus)}`,
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
