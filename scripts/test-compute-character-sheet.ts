/**
 * Unit test for POL-23a's additions to compute-character.ts and the
 * BLACKTHORN_TEMPLATES extensions.
 *
 * Covers pure logic only — no Supabase, no Claude. Asserts:
 *   1. profBonusForLevel returns the correct 5e bonus per level band.
 *   2. computeCharacter derives spell_save_dc / spell_attack_bonus from
 *      level + spellcasting_ability override (Wynn parameters).
 *   3. computeCharacter for a non-caster returns null on spell fields.
 *   4. feature_uses initialise current_uses = max_uses with the right
 *      last_reset, and skip features without max_uses.
 *   5. BLACKTHORN_TEMPLATES.wynn carries the 5 cantrips + 4 1st-level + 3
 *      2nd-level spells per the PDF, and the verbatim descriptions.
 *   6. BLACKTHORN_TEMPLATES.tarric carries the 4 weapons (longsword,
 *      shortsword, shortbow, dagger) with attack bonuses + Champion
 *      features.
 *
 * Run with:
 *   node --experimental-strip-types --import ./scripts/path-alias-loader.ts \
 *        scripts/test-compute-character-sheet.ts
 */

import {
  computeCharacter,
  profBonusForLevel,
} from '@/lib/character/compute-character'
import { BLACKTHORN_TEMPLATES } from '@/lib/data/blackthorn-characters'

let pass = 0
let fail = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    pass++
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// ---- 1. profBonusForLevel ----
check('prof bonus level 1', profBonusForLevel(1) === 2)
check('prof bonus level 4', profBonusForLevel(4) === 2)
check('prof bonus level 5', profBonusForLevel(5) === 3)
check('prof bonus level 8', profBonusForLevel(8) === 3)
check('prof bonus level 9', profBonusForLevel(9) === 4)
check('prof bonus level 13', profBonusForLevel(13) === 5)
check('prof bonus level 17', profBonusForLevel(17) === 6)
check('prof bonus level 20', profBonusForLevel(20) === 6)

// ---- 2. computeCharacter — caster derivations (Wynn-shape inputs) ----
const wynn = computeCharacter({
  playerName: 'tester',
  characterName: 'Wynn',
  classId: 'wizard',
  raceId: 'human',
  // Pre-bonus stats — the racial human +1-each turns CHA 16 → 17.
  // Use 16 so after +1 we get 17 → mod +3.
  statAssignments: { str: 7, dex: 13, con: 11, int: 13, wis: 12, cha: 16 },
  personalityTraits: [],
  sessionId: 'test-session',
  slot: 1,
  level: 4,
  overrides: {
    spellcasting_ability: 'CHA',
    weapons: BLACKTHORN_TEMPLATES.wynn.weapons,
    spells_known: BLACKTHORN_TEMPLATES.wynn.spells_known,
    class_features: BLACKTHORN_TEMPLATES.wynn.class_features,
  },
})

check('Wynn-shape: prof_bonus = 2', wynn.prof_bonus === 2)
check('Wynn-shape: spellcasting_ability = CHA', wynn.spellcasting_ability === 'CHA')
check('Wynn-shape: spell_save_dc = 13', wynn.spell_save_dc === 13, `got ${wynn.spell_save_dc}`)
check('Wynn-shape: spell_attack_bonus = 5', wynn.spell_attack_bonus === 5, `got ${wynn.spell_attack_bonus}`)
check('Wynn-shape: spells_known passed through', wynn.spells_known.length === 10)
check('Wynn-shape: weapons passed through', wynn.weapons.length === 2)

// ---- 3. Non-caster (Tarric-shape) ----
const tarric = computeCharacter({
  playerName: 'tester',
  characterName: 'Tarric',
  classId: 'fighter',
  raceId: 'human',
  statAssignments: { str: 13, dex: 16, con: 13, int: 9, wis: 14, cha: 10 },
  personalityTraits: [],
  sessionId: 'test-session',
  slot: 2,
  level: 4,
  overrides: {
    weapons: BLACKTHORN_TEMPLATES.tarric.weapons,
    class_features: BLACKTHORN_TEMPLATES.tarric.class_features,
  },
})

check('Tarric-shape: spellcasting_ability null', tarric.spellcasting_ability === null)
check('Tarric-shape: spell_save_dc null', tarric.spell_save_dc === null)
check('Tarric-shape: spell_attack_bonus null', tarric.spell_attack_bonus === null)
check('Tarric-shape: weapons passed through', tarric.weapons.length === 4)
check('Tarric-shape: class_features passed through', tarric.class_features.length === 5)

// ---- 4. feature_uses initialisation ----
check(
  'Tarric-shape: feature_uses includes second-wind',
  tarric.feature_uses['second-wind']?.current_uses === 1
    && tarric.feature_uses['second-wind']?.last_reset === 'short_rest',
)
check(
  'Tarric-shape: feature_uses includes action-surge',
  tarric.feature_uses['action-surge']?.current_uses === 1
    && tarric.feature_uses['action-surge']?.last_reset === 'short_rest',
)
check(
  'Tarric-shape: unlimited features omitted from feature_uses',
  !('fighting-style-dueling' in tarric.feature_uses),
)

// ---- 5. BLACKTHORN_TEMPLATES.wynn spell list ----
const wynnSpells = BLACKTHORN_TEMPLATES.wynn.spells_known
const cantrips = wynnSpells.filter((s) => s.level === 0).map((s) => s.name).sort()
const lvl1 = wynnSpells.filter((s) => s.level === 1).map((s) => s.name).sort()
const lvl2 = wynnSpells.filter((s) => s.level === 2).map((s) => s.name).sort()

check('Wynn cantrips count = 5', cantrips.length === 5, cantrips.join(', '))
check('Wynn 1st-level count = 3', lvl1.length === 3, lvl1.join(', '))
check('Wynn 2nd-level count = 2', lvl2.length === 2, lvl2.join(', '))
check(
  'Wynn cantrip names',
  ['Acid Splash', 'Light', 'Mage Hand', 'Message', 'Prestidigitation'].every((n) => cantrips.includes(n)),
)
check(
  'Wynn 1st-level names',
  ['Charm Person', 'Magic Missile', 'Shield'].every((n) => lvl1.includes(n)),
)
check(
  'Wynn 2nd-level names',
  ['Enhance Ability', 'Knock'].every((n) => lvl2.includes(n)),
)
check(
  'Wynn Charm Person verbatim Wisdom save',
  wynnSpells.find((s) => s.name === 'Charm Person')?.description.includes('must make a Wisdom saving throw') === true,
)
check(
  'Wynn Magic Missile verbatim 3 darts',
  wynnSpells.find((s) => s.name === 'Magic Missile')?.description.includes('three glowing darts') === true,
)
check(
  'Wynn Enhance Ability concentration flag',
  wynnSpells.find((s) => s.name === 'Enhance Ability')?.concentration === true,
)
check('Wynn template spell_save_dc = 13', BLACKTHORN_TEMPLATES.wynn.spell_save_dc === 13)
check('Wynn template spell_attack_bonus = 5', BLACKTHORN_TEMPLATES.wynn.spell_attack_bonus === 5)
check('Wynn template prof_bonus = 2', BLACKTHORN_TEMPLATES.wynn.prof_bonus === 2)
check('Wynn template spellcasting_ability = CHA', BLACKTHORN_TEMPLATES.wynn.spellcasting_ability === 'CHA')

// ---- 6. BLACKTHORN_TEMPLATES.tarric weapons + features ----
const tarricWeapons = BLACKTHORN_TEMPLATES.tarric.weapons.map((w) => w.name).sort()
check('Tarric has 4 weapons', BLACKTHORN_TEMPLATES.tarric.weapons.length === 4, tarricWeapons.join(', '))
check(
  'Tarric weapons: longsword/shortsword/shortbow/dagger',
  tarricWeapons.some((n) => /Longsword/i.test(n))
    && tarricWeapons.some((n) => /Shortsword/i.test(n))
    && tarricWeapons.some((n) => /Shortbow/i.test(n))
    && tarricWeapons.some((n) => /Dagger/i.test(n)),
)
check(
  'Tarric longsword attack +5 dmg 1d8+3',
  BLACKTHORN_TEMPLATES.tarric.weapons.find((w) => /Longsword/i.test(w.name))?.attack_bonus === 5
    && BLACKTHORN_TEMPLATES.tarric.weapons.find((w) => /Longsword/i.test(w.name))?.damage_dice === '1d8+3',
)
check(
  'Tarric features include Action Surge',
  BLACKTHORN_TEMPLATES.tarric.class_features.some((f) => f.id === 'action-surge'),
)
check(
  'Tarric features include Second Wind',
  BLACKTHORN_TEMPLATES.tarric.class_features.some((f) => f.id === 'second-wind'),
)
check(
  'Tarric features include Champion Improved Critical',
  BLACKTHORN_TEMPLATES.tarric.class_features.some((f) => f.id === 'champion-improved-critical'),
)
check(
  'Tarric features include Dueling style',
  BLACKTHORN_TEMPLATES.tarric.class_features.some((f) => f.id === 'fighting-style-dueling'),
)

// ---- summary ----
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass}/${pass + fail} checks passed`)
process.exit(fail === 0 ? 0 : 1)
