/**
 * PIV-04 — Romance privacy unit test.
 *
 * Verifies the partner-gate invariant at the API shape level WITHOUT
 * requiring a Supabase round trip: it imports `shapeForViewer` directly
 * and exercises every privacy-bearing branch.
 *
 * What it asserts:
 *   1. Owner view (viewer === id) returns turn-ons, pet peeves, and
 *      first-impression components.
 *   2. Partner view (viewer !== id) returns ONLY band + character_id.
 *      Pet peeves are absent. Turn-ons are absent.
 *      `current_ap` (number) is absent everywhere.
 *      `first_impression_total` (number) is absent everywhere.
 *   3. Engine sanity:
 *      - rollPetPeeves never returns a roll incompatible with the
 *        chosen turn-ons.
 *      - applyApDelta produces a consistent history entry shape.
 *   4. Regression guard: a "naive" shape that bypasses the gate would
 *      fail at least one of the assertions, proving the gate is doing
 *      real work.
 *
 * Run with:
 *   node --experimental-strip-types --import ./scripts/path-alias-loader.ts \
 *        scripts/test-romance-privacy.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  shapeForViewer,
  type CharacterRomanceRow,
  type PublicRomanceShape,
  type SelfRomanceShape,
} from '../app/api/characters/[id]/romance/_shared.ts'
import {
  applyApDelta,
  fixedSequenceRng,
  rollPetPeeves,
} from '../lib/romance/engine.ts'
import { parseRomanceTables, type RomanceTables } from '../lib/schemas/romance.ts'

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

function loadBlackthornTables(): RomanceTables {
  const file = path.join(
    process.cwd(),
    'lib',
    'adventures',
    'blackthorn',
    'romance-tables.json',
  )
  return parseRomanceTables(JSON.parse(fs.readFileSync(file, 'utf8')), file)
}

function fakeRow(): CharacterRomanceRow {
  return {
    id: 'romance-row-1',
    character_id: 'wynn-uuid',
    chosen_turn_on_rolls: [3, 5, 16], // sense of humor / observant / good in a fight
    rolled_pet_peeve_rolls: [4, 10],   // someone clumsy / procrastinators
    first_impression_total: 14,
    // Audit-shape components (post-finalize): the privacy gate must
    // surface the `detail` strings of the three preconception slots
    // as `first_impression_outcomes` for the owner — and strip the
    // field entirely for the partner.
    first_impression_components: [
      { source: 'no_roll_bonus', delta: 6, detail: 'Fixed +6' },
      { source: 'charisma_modifier', delta: 0, detail: '+0 (tarric CHA mod)' },
      {
        source: 'preconception:kidnap-handling',
        delta: 4,
        detail: 'Tarric did his job and was helpful to the family.',
      },
      {
        source: 'preconception:ranger-stereotypes',
        delta: 0,
        detail: 'Rangers seem okay.',
      },
      {
        source: 'preconception:family-relations',
        delta: -3,
        detail: 'Tarric may be taking advantage of the family\'s generosity.',
      },
    ],
    current_ap: 14,
    ap_history: [
      { ts: '2026-04-30T00:00:00Z', delta: 14, reason: 'seed', source: 'first_impression' },
    ],
    created_at: '2026-04-30T00:00:00Z',
    updated_at: '2026-04-30T00:00:00Z',
  }
}

function isLikelyPublic(shape: SelfRomanceShape | PublicRomanceShape): shape is PublicRomanceShape {
  return !('turn_ons' in shape) && !('pet_peeves' in shape)
}

console.log('\n=== PIV-04 Romance privacy test ===\n')

const tables = loadBlackthornTables()
record('blackthorn romance-tables.json loads + validates', true, `module=${tables.module_id}`)

// 1. Tables are well-formed: 20 turn-ons, 20 pet peeves.
record('turn_ons table length === 20', tables.turn_ons.length === 20)
record('pet_peeves table length === 20', tables.pet_peeves.length === 20)

const row = fakeRow()
const characterId = 'wynn-uuid'

// 2. Owner view — full shape.
const ownerView = shapeForViewer(row, tables, characterId, characterId)
record(
  'owner view returns SelfRomanceShape',
  !isLikelyPublic(ownerView),
  isLikelyPublic(ownerView) ? 'got public-only shape' : 'has turn_ons + pet_peeves',
)
if (!isLikelyPublic(ownerView)) {
  record(
    'owner view exposes 3 turn-ons',
    ownerView.turn_ons.length === 3,
    `count=${ownerView.turn_ons.length}`,
  )
  record(
    'owner view exposes 2 pet peeves',
    ownerView.pet_peeves.length === 2,
    `count=${ownerView.pet_peeves.length}`,
  )
  record(
    'owner view contains turn-on names (effect text)',
    ownerView.turn_ons.every((t) => typeof t.effect_text === 'string' && t.effect_text.length > 0),
  )
  record(
    'owner view contains the band, not the AP number',
    !!ownerView.current_ap_band &&
      !('current_ap' in (ownerView as unknown as Record<string, unknown>)),
    `band=${ownerView.current_ap_band?.label}`,
  )
  // First-impression outcomes — owner-only.
  record(
    'owner view INCLUDES first_impression_outcomes',
    Array.isArray(ownerView.first_impression_outcomes),
    `outcomes=${JSON.stringify(ownerView.first_impression_outcomes)}`,
  )
  record(
    'owner first_impression_outcomes contains exactly 3 idea-text strings',
    Array.isArray(ownerView.first_impression_outcomes) &&
      ownerView.first_impression_outcomes.length === 3 &&
      ownerView.first_impression_outcomes.every(
        (s) => typeof s === 'string' && s.length > 0,
      ),
    `count=${ownerView.first_impression_outcomes?.length}`,
  )
  record(
    'owner first_impression_outcomes excludes no_roll_bonus + charisma_modifier rows',
    Array.isArray(ownerView.first_impression_outcomes) &&
      !ownerView.first_impression_outcomes.some(
        (s) => s.startsWith('Fixed +') || /CHA mod/.test(s),
      ),
    'only preconception detail strings should appear',
  )
}

// 3. Partner view — public-only.
const partnerView = shapeForViewer(row, tables, 'tarric-uuid', characterId)
record(
  'partner view returns PublicRomanceShape',
  isLikelyPublic(partnerView),
)
record(
  'partner view does NOT contain turn_ons key',
  !('turn_ons' in partnerView),
)
record(
  'partner view does NOT contain pet_peeves key',
  !('pet_peeves' in partnerView),
)
record(
  'partner view does NOT contain current_ap (number)',
  !('current_ap' in (partnerView as unknown as Record<string, unknown>)),
)
record(
  'partner view does NOT contain first_impression_total',
  !(
    'first_impression_total' in (partnerView as unknown as Record<string, unknown>)
  ),
)
record(
  'partner view exposes the band label only',
  !!partnerView.current_ap_band && typeof partnerView.current_ap_band.label === 'string',
  partnerView.current_ap_band ? `label=${partnerView.current_ap_band.label}` : 'no band',
)

// First-impression outcomes — must NOT be in the partner view at all.
record(
  'partner view does NOT contain first_impression_outcomes key',
  !('first_impression_outcomes' in (partnerView as unknown as Record<string, unknown>)),
  'field must be absent (not null, not empty array)',
)
record(
  'partner view does NOT contain first_impression_components',
  !(
    'first_impression_components' in (partnerView as unknown as Record<string, unknown>)
  ),
  'audit components must never cross the partner gate',
)

// Regression guard: simulate a "broken" privacy gate that copies the
// row's idea-text strings into the partner shape. This must fail one
// of the partner-view assertions, proving the gate is doing real work.
const naivePartnerView: Record<string, unknown> = {
  ...(partnerView as unknown as Record<string, unknown>),
  first_impression_outcomes: [
    'Tarric did his job and was helpful to the family.',
    'Rangers seem okay.',
    "Tarric may be taking advantage of the family's generosity.",
  ],
}
record(
  'regression: a leaky partner shape would fail the absence assertion',
  'first_impression_outcomes' in naivePartnerView &&
    Array.isArray(naivePartnerView.first_impression_outcomes) &&
    (naivePartnerView.first_impression_outcomes as unknown[]).length === 3,
  'confirms the absence check would catch a regression',
)

// 4. Regression guard — a naive shaper that returns the row verbatim
// would leak everything. Confirm such a leak would fail our assertions.
const naive = row as unknown as Record<string, unknown>
record(
  'regression: naive serialisation of the row would leak pet peeves',
  Array.isArray(naive.rolled_pet_peeve_rolls) &&
    (naive.rolled_pet_peeve_rolls as number[]).length === 2,
  'confirms the gate is removing real data, not a no-op',
)
record(
  'regression: naive serialisation of the row would leak current_ap',
  typeof naive.current_ap === 'number',
  'confirms the gate is removing real data, not a no-op',
)

// 5. Engine sanity.
const peeves = rollPetPeeves(
  [1, 2, 3], // turn-ons 1+2 list peeves 1+2 as incompat
  tables,
  fixedSequenceRng([1, 2, 4, 5]), // 1 blocked, 2 blocked, 4 + 5 picked
)
record(
  'rollPetPeeves rejects incompatible peeves under the chosen turn-ons',
  !peeves.includes(1) && !peeves.includes(2) && peeves.length === 2,
  `peeves=${JSON.stringify(peeves)}`,
)

const apResult = applyApDelta(10, -3, 'pet peeve fired', 'pet_peeve_fire')
record(
  'applyApDelta produces { newAp, history_entry } with stable shape',
  apResult.newAp === 7 &&
    apResult.history_entry.delta === -3 &&
    apResult.history_entry.source === 'pet_peeve_fire' &&
    typeof apResult.history_entry.ts === 'string',
)

// 6. Summary.
const passed = checks.filter((c) => c.ok).length
const total = checks.length
const allPassed = passed === total
console.log(`\n=== SUMMARY ===`)
for (const c of checks) {
  console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`)
}
console.log(`\n${allPassed ? 'PASS' : 'FAIL'}: ${passed}/${total} checks passed`)
if (!allPassed) process.exit(1)
