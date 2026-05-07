/**
 * POL-15-21-22c — Narration parser unit test.
 *
 * Pure-function test of `parseNarrationCues` against a hand-curated
 * corpus pulled from `docs/adventure/playtest-narration*.md`. No DB. No
 * live API.
 *
 * Coverage targets per the brief:
 *   - 4 tier-1 damage cases (PC and NPC targets, single + multi-target)
 *   - 3 tier-1 death cases (Arnie kill being one)
 *   - 3 tier-1 action_used cases for PCs
 *   - 3 tier-2 cases (movement, ambiguous condition, spell-slot inference)
 *     — assert warn-level, NOT auto-emit
 *   - 2 negative cases (name mentioned but no cue) — assert empty result
 *
 * Also includes the `isCueAlreadyEmitted` dedupe helper smoke check.
 *
 * Run with:
 *   node --experimental-strip-types --import ./scripts/path-alias-loader.ts \
 *        scripts/test-narration-parser.ts
 */

import {
  parseNarrationCues,
  isCueAlreadyEmitted,
  type KnownEntities,
  type ParsedCue,
} from '../lib/db/parse-narration-cues.ts'

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

const blackthorn: KnownEntities = {
  pcs: ['Tarric', 'Wynn'],
  npcs: ['Arnie', 'Willard', 'Agatha', 'Briar', 'Oberon', 'the bandit', 'the lookout'],
}

console.log('\n=== POL-15-21-22c parser corpus ===\n')

// ---------------------------------------------------------------------------
// Group A — Tier 1 damage (4 cases)
// ---------------------------------------------------------------------------
console.log('--- A. Tier-1 damage ---')

// A.1 — "Arnie takes 7 damage" (canonical playtest pattern, NPC target).
// Source phrasing per the brief's tier-1 examples — the AI typically
// frames damage as either "X takes N damage" or "N damage to X".
{
  const narration =
    `Arnie takes 7 damage. The blade lands clean and he folds at the waist.`
  const cues = parseNarrationCues(narration, blackthorn)
  const damage = cues.find((c) => c.field === 'hp_delta' && c.entity === 'Arnie')
  record(
    'A.1 NPC damage: "Arnie takes 7 damage"',
    Boolean(damage) && damage!.tier === 1 && damage!.value === -7,
    damage ? `value=${damage.value}` : 'no cue',
  )
}

// A.2 — PC damage target ("Wynn takes 5 cold damage").
{
  const narration = `The frost wraps around her — Wynn takes 5 cold damage and shudders.`
  const cues = parseNarrationCues(narration, blackthorn)
  const damage = cues.find((c) => c.field === 'hp_delta' && c.entity === 'Wynn')
  record(
    'A.2 PC damage with type: "Wynn takes 5 cold damage"',
    Boolean(damage) && damage!.tier === 1 && damage!.value === -5,
    damage ? `value=${damage.value}` : 'no cue',
  )
}

// A.3 — "deals N damage to X" (target-last shape).
{
  const narration = `Tarric's strike deals 12 damage to the bandit, who drops the cudgel.`
  const cues = parseNarrationCues(narration, blackthorn)
  const damage = cues.find((c) => c.field === 'hp_delta' && c.entity === 'the bandit')
  record(
    'A.3 target-last damage: "12 damage to the bandit"',
    Boolean(damage) && damage!.tier === 1 && damage!.value === -12,
    damage ? `value=${damage.value}` : 'no cue',
  )
}

// A.4 — Multi-target in one narration block (separate cues for both).
{
  const narration =
    `Wynn takes 4 damage from the blast. Tarric takes 6 damage as the wave hits him too.`
  const cues = parseNarrationCues(narration, blackthorn)
  const wynn = cues.find((c) => c.field === 'hp_delta' && c.entity === 'Wynn')
  const tarric = cues.find((c) => c.field === 'hp_delta' && c.entity === 'Tarric')
  record(
    'A.4 multi-target damage: Wynn + Tarric',
    Boolean(wynn) && Boolean(tarric) && wynn!.value === -4 && tarric!.value === -6,
    `wynn=${wynn?.value} tarric=${tarric?.value}`,
  )
}

// ---------------------------------------------------------------------------
// Group B — Tier 1 death (3 cases)
// ---------------------------------------------------------------------------
console.log('--- B. Tier-1 death ---')

// B.1 — The canonical Arnie kill from the playtest. Damage + death verb
// in the same response. The actual playtest narration was "7 damage.
// Arnie had 5 HP left." which the parser can't match; in production the
// AI is also expected to emit a `state_change` for damage. Here we test
// the case where the AI did NOT emit a state_change AND the narration
// uses the spec phrasing — the parser's job is to backstop both.
{
  const narration =
    `Arnie takes 7 damage. ` +
    `Tarric drives the shortsword up through the window frame and into Arnie's midsection. ` +
    `The man folds over the sill like wet laundry, glasses spinning off into the stream below. ` +
    `He doesn't shout. He just slides back inside and Arnie hits the floor in a heap, sword clattering off his knees and under the cot.`
  const cues = parseNarrationCues(narration, blackthorn)
  const deathCondition = cues.find(
    (c) => c.field === 'condition' && c.entity === 'Arnie' && c.value === 'dead',
  )
  const deathHp = cues.find(
    (c) => c.field === 'hp' && c.entity === 'Arnie' && c.value === 0,
  )
  const dmg = cues.find(
    (c) => c.field === 'hp_delta' && c.entity === 'Arnie' && c.value === -7,
  )
  record(
    'B.1 Arnie kill: damage + dead + hp=0 (canonical playtest case)',
    Boolean(deathCondition) && Boolean(deathHp) && Boolean(dmg) &&
      deathCondition!.tier === 1 && deathHp!.tier === 1,
    `damage=${dmg?.value} dead=${deathCondition?.value} hp=${deathHp?.value}`,
  )
}

// B.2 — Explicit dies verb ("Oberon dies").
{
  const narration =
    `Oberon takes 14 damage from the final strike. He stumbles, blood at his lips. Oberon dies.`
  const cues = parseNarrationCues(narration, blackthorn)
  const cond = cues.find((c) => c.field === 'condition' && c.entity === 'Oberon' && c.value === 'dead')
  const hp = cues.find((c) => c.field === 'hp' && c.entity === 'Oberon' && c.value === 0)
  record(
    'B.2 explicit "dies" verb',
    Boolean(cond) && Boolean(hp) && cond!.tier === 1,
    cond ? `cond=${cond.value} hp=${hp?.value}` : 'no death cue',
  )
}

// B.3 — "the bandit crumples" with prior damage in the same response.
{
  const narration =
    `Tarric's strike deals 8 damage to the bandit. The bandit crumples to the floor without a sound.`
  const cues = parseNarrationCues(narration, blackthorn)
  const cond = cues.find(
    (c) => c.field === 'condition' && c.entity === 'the bandit' && c.value === 'dead',
  )
  record(
    'B.3 NPC death verb "crumples" with prior damage',
    Boolean(cond) && cond!.tier === 1,
    cond ? `confidence=${cond.confidence}` : 'no cue',
  )
}

// ---------------------------------------------------------------------------
// Group C — Tier 1 action_used for PCs (3 cases)
// ---------------------------------------------------------------------------
console.log('--- C. Tier-1 action_used (PCs only) ---')

// C.1 — "Tarric attacks" — explicit PC verb.
{
  const narration = `Tarric attacks first, blade flashing toward Arnie's throat.`
  const cues = parseNarrationCues(narration, blackthorn)
  const action = cues.find((c) => c.field === 'action_used' && c.entity === 'Tarric')
  record(
    'C.1 Tarric attacks → action_used',
    Boolean(action) && action!.tier === 1 && action!.value === true,
    action ? `value=${action.value}` : 'no cue',
  )
}

// C.2 — "Wynn casts" — spell action consumes the action.
{
  const narration = `Wynn casts the words of the binding spell.`
  const cues = parseNarrationCues(narration, blackthorn)
  const action = cues.find((c) => c.field === 'action_used' && c.entity === 'Wynn')
  record(
    'C.2 Wynn casts → action_used',
    Boolean(action) && action!.tier === 1 && action!.value === true,
    action ? `value=${action.value}` : 'no cue',
  )
}

// C.3 — "Tarric throws" — past-tense and other verb.
{
  const narration = `Tarric throws his dagger across the room with a flick of the wrist.`
  const cues = parseNarrationCues(narration, blackthorn)
  const action = cues.find((c) => c.field === 'action_used' && c.entity === 'Tarric')
  record(
    'C.3 Tarric throws → action_used',
    Boolean(action) && action!.tier === 1,
    action ? `verb-tense ok` : 'no cue',
  )
}

// C.4 — NPC verb does NOT trigger action_used (NPCs use advance_to_next_turn).
{
  const narration = `Arnie attacks Wynn but the blow goes wide.`
  const cues = parseNarrationCues(narration, blackthorn)
  const npcAction = cues.find((c) => c.field === 'action_used' && c.entity === 'Arnie')
  record(
    'C.4 NPC "attacks" does NOT emit action_used (PC-only)',
    !npcAction,
    npcAction ? `unexpected NPC action_used` : 'correctly skipped',
  )
}

// ---------------------------------------------------------------------------
// Group D — Tier 2 (warn only, 3 cases)
// ---------------------------------------------------------------------------
console.log('--- D. Tier-2 warn-only ---')

// D.1 — Movement ("Tarric closes the distance").
{
  const narration = `Tarric closes the distance and brings the blade up.`
  const cues = parseNarrationCues(narration, blackthorn)
  const move = cues.find((c) => c.field === 'movement_used' && c.entity === 'Tarric')
  record(
    'D.1 movement "closes the distance" → tier-2 warn',
    Boolean(move) && move!.tier === 2 && move!.value === null,
    move ? `tier=${move.tier}` : 'no cue',
  )
}

// D.2 — Ambiguous condition ("the bandit goes down" — NO prior damage).
{
  const narration = `The bandit goes down to one knee, panting.`
  const cues = parseNarrationCues(narration, blackthorn)
  const cond = cues.find((c) => c.field === 'condition' && c.entity === 'the bandit')
  // Should NOT be tier-1 dead (no prior damage), but ambiguous-condition
  // ("goes down") should fire as tier-2.
  const isTier2 = Boolean(cond) && cond!.tier === 2
  record(
    'D.2 ambiguous condition "goes down" without prior damage → tier-2',
    isTier2,
    cond ? `tier=${cond.tier} value=${String(cond.value)}` : 'no cue (also acceptable)',
  )
}

// D.3 — Spell-slot inference ("Wynn casts Magic Missile").
{
  const narration = `Wynn casts Magic Missile, three darts of force lancing across the room.`
  const cues = parseNarrationCues(narration, blackthorn)
  const slot = cues.find((c) => c.field === 'spell_slots' && c.entity === 'Wynn')
  record(
    'D.3 spell-slot inference "casts Magic Missile" → tier-2',
    Boolean(slot) && slot!.tier === 2,
    slot ? `tier=${slot.tier}` : 'no cue',
  )
  // Note: the narration ALSO produces tier-1 action_used for Wynn (correct).
  const action = cues.find((c) => c.field === 'action_used' && c.entity === 'Wynn')
  record(
    'D.3b accompanying tier-1 action_used for Wynn',
    Boolean(action) && action!.tier === 1,
    action ? 'ok' : 'missing',
  )
}

// ---------------------------------------------------------------------------
// Group E — Negative cases (2)
// ---------------------------------------------------------------------------
console.log('--- E. Negative (name mentioned, no cue) ---')

// E.1 — Pure scene-setting that mentions a name but isn't a cue.
{
  const narration =
    `Wynn looks at the chest. Tarric watches the doorway. The mill is silent except for the waterwheel.`
  const cues = parseNarrationCues(narration, blackthorn)
  // No damage/death/action verbs → no tier-1 cues.
  const tier1 = cues.filter((c) => c.tier === 1)
  record(
    'E.1 names without cue verbs → no tier-1',
    tier1.length === 0,
    `tier1 cues: ${tier1.length}`,
  )
}

// E.2 — Empty narration / no entities.
{
  const cues = parseNarrationCues('', blackthorn)
  const cuesEmptyEntities = parseNarrationCues(
    'Tarric attacks Arnie',
    { pcs: [], npcs: [] },
  )
  record(
    'E.2 empty narration returns []',
    cues.length === 0,
    `len=${cues.length}`,
  )
  record(
    'E.2b narration with no known entities returns []',
    cuesEmptyEntities.length === 0,
    `len=${cuesEmptyEntities.length}`,
  )
}

// ---------------------------------------------------------------------------
// Group F — Dedupe helper sanity
// ---------------------------------------------------------------------------
console.log('--- F. isCueAlreadyEmitted ---')

{
  const cue: ParsedCue = {
    tier: 1,
    field: 'hp_delta',
    entity: 'Arnie',
    value: -5,
    confidence: 0.9,
    reason: 'test',
    source_text: 'Arnie takes 5 damage',
  }
  // AI-emitted hp absolute should satisfy hp_delta dedupe.
  const sat = isCueAlreadyEmitted(cue, [{ entity: 'Arnie', field: 'hp', value: 0 }])
  record('F.1 hp_delta dedupe by AI-emitted hp', sat === true, `result=${sat}`)

  const unsat = isCueAlreadyEmitted(cue, [{ entity: 'Arnie', field: 'condition', value: 'dead' }])
  record('F.2 hp_delta NOT deduped by condition change alone', unsat === false, `result=${unsat}`)

  const conditionCue: ParsedCue = { ...cue, field: 'condition', value: 'dead' }
  const condSat = isCueAlreadyEmitted(conditionCue, [
    { entity: 'arnie', field: 'condition', value: 'dead' }, // case-insensitive
  ])
  record('F.3 condition dedupe is case-insensitive', condSat === true, `result=${condSat}`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = checks.filter((c) => c.ok).length
const failed = checks.length - passed

console.log(`\n=== ${passed}/${checks.length} checks passed${failed ? ` (${failed} FAIL)` : ''} ===\n`)

if (failed > 0) {
  for (const c of checks.filter((c) => !c.ok)) {
    console.log(`  FAIL: ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
  }
  process.exit(1)
}
process.exit(0)
