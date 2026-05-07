/**
 * POL-25 — Action picker template unit test.
 *
 * Pure-logic test for `lib/picker/action-templates.ts`. Verifies:
 *
 *   1. Generic action / reaction lists return the seven and two free
 *      universal chips respectively, all with non-empty templates.
 *   2. weaponChips renders one chip per weapon with "+5 / 1d6+3"-style
 *      labels and an "Attack with X: " template ending in a space.
 *   3. weaponBonusChips returns chips ONLY when ≥2 light melee weapons
 *      are detected (Two-Weapon Fighting trigger).
 *   4. cantripChips and leveledSpellChips partition by `level`, with
 *      `spell_level` set ONLY on leveled spells.
 *   5. featureChips routes Second Wind / Cunning Action to the bonus
 *      category; everything else stays in the feature category.
 *   6. movementChip renders a "Move (N ft remaining)" label and a
 *      template ending in " toward ".
 *   7. composeInput correctly stacks templates:
 *      - empty input → template only
 *      - trailing whitespace → strip + ". " separator
 *      - input ending with terminal punctuation → space separator
 *      - cursor offset always equal to next.length
 *
 * No DB / no React. Run with:
 *   node --experimental-strip-types --import ./scripts/path-alias-loader.ts \
 *        scripts/test-action-templates.ts
 */

import {
  genericActionChips,
  genericReactionChips,
  weaponChips,
  weaponBonusChips,
  cantripChips,
  leveledSpellChips,
  featureChips,
  movementChip,
  composeInput,
} from '../lib/picker/action-templates.ts'
import type {
  WeaponEntry,
  SpellEntry,
  ClassFeatureEntry,
} from '../lib/character/compute-character.ts'

// ---------------------------------------------------------------------------
// Tiny assertion helpers — no test framework, no dependencies.
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0

function assert(cond: boolean, label: string): void {
  if (cond) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.error(`  FAIL  ${label}`)
  }
}

function assertEqual<T>(a: T, b: T, label: string): void {
  assert(a === b, `${label} (got ${JSON.stringify(a)} expected ${JSON.stringify(b)})`)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const shortsword: WeaponEntry = {
  id: 'w1',
  name: 'Shortsword',
  type: 'melee',
  attack_bonus: 5,
  damage_dice: '1d6+3',
  damage_type: 'piercing',
  properties: ['light', 'finesse'],
  reach_or_range: '5 ft',
}

const dagger: WeaponEntry = {
  id: 'w2',
  name: 'Dagger',
  type: 'melee',
  attack_bonus: 5,
  damage_dice: '1d4+3',
  damage_type: 'piercing',
  properties: ['light', 'finesse', 'thrown'],
  reach_or_range: '5 ft',
}

const longsword: WeaponEntry = {
  id: 'w3',
  name: 'Longsword',
  type: 'melee',
  attack_bonus: 4,
  damage_dice: '1d8+2',
  damage_type: 'slashing',
  properties: ['versatile'],
  reach_or_range: '5 ft',
}

const acidSplash: SpellEntry = {
  id: 's0',
  name: 'Acid Splash',
  level: 0,
  school: 'conjuration',
  casting_time: '1 action',
  range: '60 ft',
  components: ['V', 'S'],
  duration: 'Instantaneous',
  description:
    'You hurl a bubble of acid. Choose one or two creatures you can see within range. If you choose two, they must be within 5 feet of each other.',
  save_ability: 'DEX',
}

const charmPerson: SpellEntry = {
  id: 's1',
  name: 'Charm Person',
  level: 1,
  school: 'enchantment',
  casting_time: '1 action',
  range: '30 ft',
  components: ['V', 'S'],
  duration: '1 hour',
  description:
    'You attempt to charm a humanoid you can see within range. It must make a Wisdom saving throw, and does so with advantage if you or your companions are fighting it.',
  save_ability: 'WIS',
}

const enhanceAbility: SpellEntry = {
  id: 's2',
  name: "Enhance Ability",
  level: 2,
  school: 'transmutation',
  casting_time: '1 action',
  range: 'Touch',
  components: ['V', 'S', 'M (fur or a feather)'],
  duration: 'Concentration, up to 1 hour',
  description:
    'You touch a creature and bestow upon it a magical enhancement.',
}

const secondWind: ClassFeatureEntry = {
  id: 'second_wind',
  name: 'Second Wind',
  description:
    'You have a limited well of stamina that you can draw on to protect yourself from harm. On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level. Once you use this feature, you must finish a short or long rest before you can use it again.',
  uses_per: 'short_rest',
  max_uses: 1,
}

const actionSurge: ClassFeatureEntry = {
  id: 'action_surge',
  name: 'Action Surge',
  description:
    'Starting at 2nd level, you can push yourself beyond your normal limits for a moment. On your turn, you can take one additional action.',
  uses_per: 'short_rest',
  max_uses: 1,
}

// ---------------------------------------------------------------------------
// Run tests
// ---------------------------------------------------------------------------

console.log('\nPOL-25 — action-templates unit test')
console.log('=====================================\n')

console.log('Generic action chips')
{
  const chips = genericActionChips()
  assertEqual(chips.length, 7, 'returns 7 universal actions')
  assert(
    chips.every((c) => c.category === 'action'),
    'all categories are "action"',
  )
  assert(
    chips.every((c) => c.template.length > 0),
    'every chip has a non-empty template',
  )
  const dodge = chips.find((c) => c.id === 'generic:dodge')
  assert(dodge !== undefined, 'Dodge chip exists')
  assertEqual(
    dodge!.template,
    'Take the Dodge action.',
    'Dodge template is terminal (no trailing space)',
  )
  const help = chips.find((c) => c.id === 'generic:help')
  assertEqual(
    help!.template,
    'Help an ally with ',
    'Help template ends in a space (cursor lands at end)',
  )
}

console.log('\nGeneric reaction chips')
{
  const chips = genericReactionChips()
  assertEqual(chips.length, 2, 'returns Opportunity Attack + Readied')
  assert(
    chips.every((c) => c.category === 'reaction'),
    'all categories are "reaction"',
  )
}

console.log('\nWeapon chips')
{
  const chips = weaponChips([shortsword, longsword])
  assertEqual(chips.length, 2, 'one chip per weapon')
  assertEqual(
    chips[0].label,
    'Shortsword (+5 / 1d6+3)',
    'shortsword chip uses "+5 / 1d6+3" format',
  )
  assertEqual(
    chips[0].template,
    'Attack with shortsword: ',
    'attack template lowercases the weapon name',
  )
  assertEqual(chips[0].category, 'action', 'weapon chip is action category')
  assert(
    Array.isArray(chips[0].details?.properties) && chips[0].details!.properties!.includes('light'),
    'details.properties includes the weapon properties',
  )
}

console.log('\nWeapon bonus chips (Two-Weapon Fighting)')
{
  // 0 weapons → 0 chips
  assertEqual(weaponBonusChips([]).length, 0, 'empty weapons → 0 bonus chips')

  // 1 light weapon → 0 (need ≥2 for TWF)
  assertEqual(
    weaponBonusChips([shortsword]).length,
    0,
    '1 light melee weapon → 0 bonus chips (TWF requires ≥2)',
  )

  // 2 light weapons → 1 bonus chip (the second one)
  const twf = weaponBonusChips([shortsword, dagger])
  assertEqual(twf.length, 1, '2 light melee weapons → 1 bonus chip')
  assertEqual(twf[0].category, 'bonus', 'TWF off-hand is bonus category')
  assert(
    twf[0].label.includes('Off-hand') && twf[0].label.toLowerCase().includes('dagger'),
    'TWF off-hand label includes "Off-hand" and the weapon name',
  )

  // Non-light melee → no TWF
  assertEqual(
    weaponBonusChips([longsword, longsword]).length,
    0,
    'non-light melee weapons → 0 bonus chips',
  )
}

console.log('\nCantrip chips')
{
  const chips = cantripChips([acidSplash, charmPerson])
  assertEqual(chips.length, 1, 'only level-0 spells become cantrip chips')
  assertEqual(chips[0].category, 'cantrip', 'category is cantrip')
  assertEqual(chips[0].spell_level, undefined, 'cantrips have no spell_level (no slot cost)')
  assertEqual(chips[0].template, 'Cast Acid Splash on ', 'cantrip template')
}

console.log('\nLeveled spell chips')
{
  const chips = leveledSpellChips([acidSplash, charmPerson, enhanceAbility])
  assertEqual(chips.length, 2, 'cantrips excluded; only level ≥ 1')
  const cp = chips.find((c) => c.id === 'spell:s1')!
  assertEqual(cp.spell_level, 1, 'Charm Person has spell_level = 1')
  assertEqual(cp.category, 'spell', 'category is spell')
  const ea = chips.find((c) => c.id === 'spell:s2')!
  assertEqual(ea.spell_level, 2, 'Enhance Ability has spell_level = 2')
}

console.log('\nFeature chips — bonus-action override')
{
  const features = [secondWind, actionSurge]
  const uses = {
    second_wind: { current_uses: 1, last_reset: 'short_rest' },
    action_surge: { current_uses: 1, last_reset: 'short_rest' },
  }
  const chips = featureChips(features, uses)
  assertEqual(chips.length, 2, 'one chip per feature')
  const sw = chips.find((c) => c.id === 'feature:second_wind')!
  assertEqual(sw.category, 'bonus', 'Second Wind routes to bonus category')
  assert(
    sw.template.startsWith('Bonus action:'),
    'Second Wind template uses "Bonus action:" prefix',
  )
  const as = chips.find((c) => c.id === 'feature:action_surge')!
  assertEqual(as.category, 'feature', 'Action Surge stays in feature category')
  assert(
    as.label.includes('(1/1)'),
    'feature label shows uses fraction "(1/1)" when uses are tracked',
  )
}

console.log('\nMovement chip')
{
  const chip = movementChip(30, 0)
  assertEqual(chip.label, 'Move (30 ft remaining)', 'fresh-turn label shows full speed')
  assertEqual(chip.template, 'Move 30 ft toward ', 'fresh-turn template prepopulates 30 ft')

  const used = movementChip(30, 25)
  assertEqual(used.label, 'Move (5 ft remaining)', 'partial-move label subtracts')
  const exhausted = movementChip(30, 35)
  assertEqual(exhausted.label, 'Move (0 ft remaining)', 'overspent never goes negative')
}

console.log('\ncomposeInput — multi-action stacking')
{
  // Empty input → template only
  const empty = composeInput('', 'Cast Charm Person on ')
  assertEqual(empty.next, 'Cast Charm Person on ', 'empty input → template only')
  assertEqual(empty.cursorOffset, 'Cast Charm Person on '.length, 'cursor at end')

  // Trailing whitespace → trim + ". "
  const trailingWS = composeInput('Move 30 ft toward Oberon  ', 'Attack with shortsword: ')
  assertEqual(
    trailingWS.next,
    'Move 30 ft toward Oberon. Attack with shortsword: ',
    'trailing whitespace stripped + ". " separator',
  )
  assertEqual(trailingWS.cursorOffset, trailingWS.next.length, 'cursor at end')

  // Already ends with terminal punctuation → " " separator
  const punct = composeInput('Take the Dodge action.', 'Move 10 ft toward ')
  assertEqual(
    punct.next,
    'Take the Dodge action. Move 10 ft toward ',
    'terminal punctuation → " " separator (no extra ". ")',
  )

  // Mid-sentence → ". " separator
  const mid = composeInput('Wynn casts Bless', 'Move 20 ft toward ')
  assertEqual(
    mid.next,
    'Wynn casts Bless. Move 20 ft toward ',
    'mid-sentence → ". " separator',
  )
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n=====================================')
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
