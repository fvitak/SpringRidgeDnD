/**
 * Pre-built level-4 character templates for Rescue of the Blackthorn Clan.
 * Stat blocks paraphrased from the source PDF (pp 59-69) — adapted, not copied.
 *
 * The shape mirrors what computeCharacter() produces for the home-grown
 * 4-step creator (compute-character.ts ComputedCharacter), so these rows can
 * be inserted directly into the `characters` table.
 *
 * POL-23a (Cluster A) — full sheet completeness: weapons, spells_known,
 * class_features, feature_uses, prof_bonus, spell_save_dc/attack/ability
 * are sourced verbatim from the PDF character sheets (Wynn pp 67-70,
 * Tarric pp 61-62, Briar p 63). Spell descriptions are kept verbatim
 * because the AI will read them directly when POL-23b ships the per-turn
 * sheet payload; paraphrased text would silently mutate the rules.
 */

import type {
  ClassFeatureEntry,
  ComputedCharacter,
  FeatureUseEntry,
  SpellEntry,
  SpellcastingAbility,
  WeaponEntry,
} from '@/lib/character/compute-character'

type BlackthornTemplate = Omit<
  ComputedCharacter,
  'session_id' | 'slot' | 'player_name' | 'character_name'
> & {
  suggestedName: string
  /**
   * Hardcoded pronouns from the Blackthorn PDF (Wynn = she/her,
   * Tarric = he/him). Surfaced to the AI per-turn scene context and
   * to the host-screen intake gate copy. Optional so future templates
   * (or non-romance modules) can leave it undefined → AI defaults to
   * they/them.
   */
  pronouns?: string
}

// ---------------------------------------------------------------------------
// Wynn — Sorcerer-stand-in (mapped onto our Wizard class), CHA 17, level 4
// PDF pp 67-70. CHA 16 in the brief was a typo: the PDF gives Wynn CHA 17
// (mod +3) → spell save DC = 8 + 2 prof + 3 = 13, spell atk = +5. Both
// match the brief's stated numbers.
// ---------------------------------------------------------------------------

const WYNN_WEAPONS: WeaponEntry[] = [
  // Wynn carries a quarterstaff (1d6 base, 1d8 versatile two-handed) and
  // two daggers per the PDF Inventory list. Attack bonuses use prof +2
  // and DEX +2 (DEX 14): quarterstaff +0 (no STR 8 mod) — but Wynn's PDF
  // sheet shows Staff at 1d6+2 / 1d8+2, implying use with DEX via finesse
  // narrative or magical pendant. We encode the PDF's printed numbers.
  {
    id: 'wynn-quarterstaff',
    name: 'Quarterstaff',
    type: 'melee',
    attack_bonus: 2,
    damage_dice: '1d6+2',
    damage_type: 'bludgeoning',
    properties: ['versatile (1d8+2)'],
    reach_or_range: '5 ft',
  },
  {
    id: 'wynn-dagger',
    name: 'Dagger',
    type: 'melee',
    attack_bonus: 4, // PDF shows +4 melee for Wynn's dagger (DEX 14, prof 2)
    damage_dice: '1d4+2',
    damage_type: 'piercing',
    properties: ['finesse', 'light', 'thrown'],
    reach_or_range: '5 ft / 20 ft thrown',
  },
]

// PDF pp 68-70, full text. Only edits: line breaks normalised, no
// paraphrasing. Each `description` is the rules text the AI will read.
const WYNN_SPELLS: SpellEntry[] = [
  // ---- Cantrips (Unlimited Casting) ----
  {
    id: 'acid-splash',
    name: 'Acid Splash',
    level: 0,
    school: 'Conjuration',
    casting_time: '1 action',
    range: '60 feet',
    components: ['V', 'S'],
    duration: 'Instantaneous',
    description:
      'You hurl a bubble of acid. Choose one creature within range, or choose two creatures within range that are within 5 feet of each other. A target must succeed on a Dexterity saving throw or take 1d6 acid damage.',
    save_ability: 'DEX',
  },
  {
    id: 'light',
    name: 'Light',
    level: 0,
    school: 'Evocation',
    casting_time: '1 action',
    range: 'Touch',
    components: ['V', 'M (a firefly or phosphorescent moss)'],
    duration: '1 hour',
    description:
      'You touch one object no larger than 10 feet in any dimension. The object sheds bright light in a 20-foot radius and dim light for an additional 20 feet. The light can be colored as you like. Covering the object with something opaque blocks the light. The spell ends if you cast it again or dismiss it as an action. If you target an object held or worn by a hostile creature, that creature must succeed on a Dexterity saving throw to avoid the spell.',
    save_ability: 'DEX',
  },
  {
    id: 'mage-hand',
    name: 'Mage Hand',
    level: 0,
    school: 'Conjuration',
    casting_time: '1 action',
    range: '30 feet',
    components: ['V', 'S'],
    duration: '1 minute',
    description:
      "A spectral hand appears at a point you choose within range. The hand vanishes if it is ever more than 30 feet away from you or if you cast this spell again. Use your action to control the hand to manipulate an object, open an unlocked door or container, stow or retrieve an item from an open container, or pour the contents out of a vial. You can move the hand up to 30 feet each time you use it. The hand can't attack, activate magic items, or carry more than 10 pounds.",
  },
  {
    id: 'message',
    name: 'Message',
    level: 0,
    school: 'Transmutation',
    casting_time: '1 action',
    range: '120 feet',
    components: ['V', 'S', 'M (a short piece of copper wire)'],
    duration: '1 round',
    description:
      "You point your finger toward a creature within range and whisper a message. The target (and only the target) hears the message and can reply in a whisper that only you can hear. You can cast this spell through solid objects if you are familiar with the target and know it is beyond the barrier. Magical silence, 1 foot of stone, 1 inch of common metal, a thin sheet of lead, or 3 feet of wood blocks the spell. The spell doesn't have to follow a straight line and can travel freely around corners or through openings.",
  },
  {
    id: 'prestidigitation',
    name: 'Prestidigitation',
    level: 0,
    school: 'Transmutation',
    casting_time: '1 action',
    range: '10 feet',
    components: ['V', 'S'],
    duration: 'Up to 1 hour',
    description:
      'This is a minor magical trick that novice spellcasters use for practice. You create one of the following effects within range: An instantaneous, harmless sensory effect, such as a shower of sparks. Light or snuff out a candle, torch, or small campfire. Clean or soil an object no larger than 1 cubic foot. Chill, warm, or flavor up to 1 cubic foot of nonliving material for 1 hour. Make a color, a mark, or a symbol appear on a surface for 1 hour. Create a nonmagical trinket or an illusory image that can fit in your hand and that lasts until the end of your next turn. If you cast multiple times, you can have three effects active at a time, and you can dismiss them as an action.',
  },
  // ---- 1st Level Spells (4 slots per the PDF p 69) ----
  {
    id: 'charm-person',
    name: 'Charm Person',
    level: 1,
    school: 'Enchantment',
    casting_time: '1 action',
    range: '30 feet',
    components: ['V', 'S'],
    duration: '1 hour',
    description:
      'You attempt to charm a humanoid you can see within range. It must make a Wisdom saving throw, and has advantage if you or your companions are fighting it. If it fails the saving throw, it is charmed until the spell ends or until you or your companions do anything harmful to it. The charmed creature regards you as a friendly acquaintance. When the spell ends, the creature knows it was charmed.',
    save_ability: 'WIS',
  },
  {
    id: 'magic-missile',
    name: 'Magic Missile',
    level: 1,
    school: 'Evocation',
    casting_time: '1 action',
    range: '120 feet',
    components: ['V', 'S'],
    duration: 'Instantaneous',
    description:
      'You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several. (If cast using a 2nd level spell slot, an addition dart is cast for a total of four.)',
  },
  {
    id: 'shield',
    name: 'Shield',
    level: 1,
    school: 'Abjuration',
    casting_time: '1 reaction, which you take when you are hit by an attack or targeted by the magic missile spell',
    range: 'Self',
    components: ['V', 'S'],
    duration: '1 round',
    description:
      'An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from magic missile.',
  },
  // ---- 2nd Level Spells (3 slots per the PDF p 70) ----
  {
    id: 'enhance-ability',
    name: 'Enhance Ability',
    level: 2,
    school: 'Transmutation',
    casting_time: '1 action',
    range: 'Touch',
    components: ['V', 'S', 'M (fur or a feather from a beast)'],
    duration: 'Concentration, up to 1 hour.',
    description:
      "You touch a creature and bestow upon it a magical enhancement. Choose one of the following effects; the target gains that effect until the spell ends. Bear's Endurance. The target has advantage on Constitution checks. It also gains 2d6 temporary hit points, which are lost when the spell ends. Bull's Strength. The target has advantage on Strength checks, and his or her carrying capacity doubles. Cat's Grace. The target has advantage on Dexterity checks. It also doesn't take damage from falling 20 feet or less if it isn't incapacitated. Eagle's Splendor. The target has advantage on Charisma checks. Fox's Cunning. The target has advantage on Intelligence checks. Owl's Wisdom. The target has advantage on Wisdom checks.",
    concentration: true,
  },
  {
    id: 'knock',
    name: 'Knock',
    level: 2,
    school: 'Transmutation',
    casting_time: '1 action',
    range: '30 feet',
    components: ['V'],
    duration: 'Instantaneous',
    description:
      'Choose an object that you can see within range. The object can be a door, a box, a chest, a set of manacles, a padlock, or any object that contains a mundane or magical means that prevents access. A target that is held shut by a mundane lock or that is stuck or barred becomes unlocked, unstuck, or unbarred. If you choose a target that is held shut with arcane lock, that spell is suppressed for 10 minutes, during which time the target can be opened and shut normally. (Spell has been altered slightly for story purposes. The auditory effect has been removed and the range shortened.)',
  },
]

const WYNN_FEATURES: ClassFeatureEntry[] = [
  {
    id: 'sorcerer-spellcasting',
    name: 'Spellcasting',
    description:
      'Wynn casts spells using Charisma. Spell save DC 13, spell attack +5. She knows the cantrips and 1st/2nd level spells listed above and recovers slots on a long rest.',
    uses_per: 'long_rest',
  },
  {
    id: 'sorcerer-font-of-magic',
    name: 'Font of Magic (Sorcery Points)',
    description:
      'At 2nd level, Wynn taps an inner wellspring of magic — 4 sorcery points (= sorcerer level). She can convert spell slots ↔ sorcery points as a bonus action. Sorcery points refresh on a long rest.',
    uses_per: 'long_rest',
    max_uses: 4,
  },
  {
    id: 'sorcerer-metamagic',
    name: 'Metamagic — Twinned Spell, Heightened Spell',
    description:
      'At 3rd level, Wynn knows two Metamagic options. Twinned Spell (1 sorcery point per spell level): when she casts a spell that targets only one creature, she can target a second creature in range. Heightened Spell (3 sorcery points): one target of a spell that requires a save has disadvantage on its first saving throw against it.',
    uses_per: 'long_rest',
  },
]

// ---------------------------------------------------------------------------
// Tarric — Fighter (Champion) level 4, PDF pp 61-62
// ---------------------------------------------------------------------------

const TARRIC_WEAPONS: WeaponEntry[] = [
  // Numbers come from the PDF Combat Tracker (p 105):
  //   Lg swd +5 1d8+3 (d10), Sht swd +5 1d6+3, Sht bow +4 1d6+2, Dagger +5 1d4+3
  // STR 14 → +2 mod, DEX 17 → +3 mod, prof +2.
  // Tarric's longsword is +1 magical (PDF p 61 Inventory), so the +5 reflects
  // STR 2 + prof 2 + magic 1; damage 1d8+3 = 1d8 + STR 2 + magic 1. Versatile
  // d10 noted in properties. Dueling fighting style adds +2 damage to one-
  // handed melee attacks; we leave that as a per-attack rule encoded in the
  // class features, not baked into the weapon damage_dice (so the AI can
  // narrate the bonus when applicable).
  {
    id: 'tarric-longsword',
    name: 'Longsword (+1 magical)',
    type: 'melee',
    attack_bonus: 5,
    damage_dice: '1d8+3',
    damage_type: 'slashing',
    properties: ['versatile (1d10+3)', 'magical +1'],
    reach_or_range: '5 ft',
  },
  {
    id: 'tarric-shortsword',
    name: 'Shortsword',
    type: 'melee',
    attack_bonus: 5,
    damage_dice: '1d6+3', // DEX 3 + prof 2 → +5; uses DEX via finesse
    damage_type: 'piercing',
    properties: ['finesse', 'light'],
    reach_or_range: '5 ft',
  },
  {
    id: 'tarric-shortbow',
    name: 'Shortbow',
    type: 'ranged',
    attack_bonus: 5, // PDF tracker shows Sht bow +4; use +5 (DEX 3 + prof 2). Note in open-questions.
    damage_dice: '1d6+3',
    damage_type: 'piercing',
    properties: ['ammunition (arrows)', 'two-handed'],
    reach_or_range: '80/320 ft',
  },
  {
    id: 'tarric-dagger',
    name: 'Dagger',
    type: 'melee',
    attack_bonus: 5,
    damage_dice: '1d4+3',
    damage_type: 'piercing',
    properties: ['finesse', 'light', 'thrown'],
    reach_or_range: '5 ft / 20 ft thrown',
  },
]

const TARRIC_FEATURES: ClassFeatureEntry[] = [
  {
    id: 'fighting-style-dueling',
    name: 'Fighting Style: Dueling',
    description:
      'When wielding a melee weapon in one hand and no other weapons, Tarric gains a +2 bonus to damage rolls with that weapon.',
    uses_per: 'unlimited',
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    description:
      'On his turn, Tarric can use a bonus action to regain hit points equal to 1d10+3 (fighter level + CON mod). Once used, must finish a short or long rest before using again.',
    uses_per: 'short_rest',
    max_uses: 1,
  },
  {
    id: 'action-surge',
    name: 'Action Surge',
    description:
      'On his turn, Tarric can take one additional action on top of his regular action and a possible bonus action. Once used, must finish a short or long rest before using again.',
    uses_per: 'short_rest',
    max_uses: 1,
  },
  {
    id: 'champion-improved-critical',
    name: 'Improved Critical (Champion)',
    description:
      'Tarric scores a critical hit on a roll of 19 or 20 with weapon attacks.',
    uses_per: 'unlimited',
  },
  {
    id: 'martial-archetype-champion',
    name: 'Martial Archetype: Champion',
    description:
      'At 3rd level, Tarric chose the Champion archetype, gaining Improved Critical (above) and a focus on raw martial prowess over tactical tricks.',
    uses_per: 'unlimited',
  },
]

// ---------------------------------------------------------------------------
// Briar — Tarric's wolf companion. NPC-controlled in combat (Tarric issues
// verbal commands as a free action per PDF p 63). Minimal entry: no weapons
// (the bite is encoded as a class_feature so the picker can chip it), no
// spells, single combat feature for Bite + Trip.
// ---------------------------------------------------------------------------

const BRIAR_FEATURES: ClassFeatureEntry[] = [
  {
    id: 'briar-bite',
    name: 'Bite',
    description:
      'Briar bites a target within 5 ft on Tarric\'s verbal command (free action). +6 to hit, 2d4+4 piercing damage. On hit, the target makes a DC 11 STR save or is knocked prone (Trip).',
    uses_per: 'unlimited',
  },
]

// Helper — build a feature_uses map matching the templates' max_uses.
function buildFeatureUses(features: ClassFeatureEntry[]): Record<string, FeatureUseEntry> {
  const out: Record<string, FeatureUseEntry> = {}
  for (const feat of features) {
    if (typeof feat.max_uses === 'number') {
      const recharge = feat.uses_per === 'short_rest' || feat.uses_per === 'long_rest'
        ? feat.uses_per
        : 'never'
      out[feat.id] = { current_uses: feat.max_uses, last_reset: recharge }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const BLACKTHORN_TEMPLATES: Record<'wynn' | 'tarric', BlackthornTemplate> = {
  wynn: {
    suggestedName: 'Wynn',
    pronouns: 'she/her',
    class: 'wizard', // closest of our four base classes — stand-in for Sorcerer
    race: 'human',
    level: 4,
    xp: 2700,
    hp: 27,
    max_hp: 27,
    ac: 13,
    stats: { str: 8, dex: 14, con: 12, int: 14, wis: 13, cha: 17 },
    saving_throws: { cha: 5, con: 1 },
    skills: {
      Arcana: 4,
      History: 4,
      Insight: 1,
      Persuasion: 5,
      Deception: 5,
    },
    inventory: [
      { name: 'Magical pendant (turtle motif)', quantity: 1 },
      { name: 'Mentor’s ring (regeneration)', quantity: 1 },
      { name: 'Component pouch', quantity: 1 },
      { name: 'Quarterstaff', quantity: 1 },
      { name: 'Dagger', quantity: 2 },
      { name: 'Healing potion', quantity: 2 },
      { name: 'Travel pack', quantity: 1 },
    ],
    spell_slots: { '1': 4, '2': 3 },
    conditions: [],
    tolerance_threshold: 4,
    drinks_consumed: 0,
    personality_traits: [
      'Guarded with strangers; quick to warm with kindness',
      'Carries her mentor’s ring as both a tool and a tether',
      'Does not bluff well, but can sell a hard truth',
    ],
    weapons: WYNN_WEAPONS,
    spells_known: WYNN_SPELLS,
    class_features: WYNN_FEATURES,
    feature_uses: buildFeatureUses(WYNN_FEATURES),
    prof_bonus: 2,
    spell_save_dc: 13, // 8 + 2 prof + 3 CHA mod
    spell_attack_bonus: 5, // 2 prof + 3 CHA mod
    spellcasting_ability: 'CHA' as SpellcastingAbility,
  },
  tarric: {
    suggestedName: 'Tarric',
    pronouns: 'he/him',
    class: 'fighter', // Champion archetype — class slot maps to base 5e Fighter
    race: 'human',
    level: 4,
    xp: 2700,
    hp: 35,
    max_hp: 35,
    ac: 15,
    stats: { str: 14, dex: 17, con: 14, int: 10, wis: 15, cha: 11 },
    saving_throws: { str: 4, dex: 5 },
    skills: {
      Athletics: 4,
      Perception: 4,
      Stealth: 5,
      Survival: 4,
      'Animal Handling': 4,
    },
    inventory: [
      { name: 'Longsword (+1 magical)', quantity: 1 },
      { name: 'Short sword', quantity: 1 },
      { name: 'Shortbow + 30 arrows', quantity: 1 },
      { name: 'Magical leather armour', quantity: 1 },
      { name: 'Healing potion', quantity: 2 },
      { name: 'Survival pack', quantity: 1 },
      { name: 'Briar — wolf companion', quantity: 1 },
    ],
    spell_slots: {},
    conditions: [],
    tolerance_threshold: 5,
    drinks_consumed: 0,
    personality_traits: [
      'Slow to anger, slower to forgive a betrayal of trust',
      'Reads tracks before he reads people',
      'Lets Briar speak first in any uncertain doorway',
    ],
    weapons: TARRIC_WEAPONS,
    spells_known: [],
    class_features: TARRIC_FEATURES,
    feature_uses: buildFeatureUses(TARRIC_FEATURES),
    prof_bonus: 2,
    spell_save_dc: null,
    spell_attack_bonus: null,
    spellcasting_ability: null,
  },
}

/** Slot 1 = Wynn, Slot 2 = Tarric. */
export const BLACKTHORN_SLOT_MAP: Record<number, 'wynn' | 'tarric'> = {
  1: 'wynn',
  2: 'tarric',
}

// ---------------------------------------------------------------------------
// Briar — companion template (NPC, not a player slot). Surfaced so
// `app/api/sessions/route.ts` can seed Briar consistently if/when we add
// a "companions" row shape; today Briar lives in `inventory` as a flavour
// line on Tarric. Exported here so POL-23b can reference Briar's bite
// stats without re-deriving them from the PDF.
// ---------------------------------------------------------------------------

export const BRIAR_NPC_TEMPLATE = {
  name: 'Briar',
  hp: 18,
  max_hp: 18,
  ac: 15,
  // No weapons (NPC-controlled — Tarric commands free-action). Bite lives
  // as a class_feature so the action picker can chip it.
  weapons: [] as WeaponEntry[],
  class_features: BRIAR_FEATURES,
  feature_uses: buildFeatureUses(BRIAR_FEATURES),
  prof_bonus: 2,
  speed_squares: 8, // 40 ft / 5 ft per square
} as const

/**
 * Briar's class_features array, exported separately so the per-turn
 * payload (POL-23b) and the picker chips (POL-25) can read the same
 * verbatim list as the templates above.
 */
export { BRIAR_FEATURES }
