// ============================================================
// Character Computation Engine — D&D 5e Level 1
// ============================================================

import { CLASSES, RACES } from '@/lib/data/character-options'

// ---------------------------------------------------------------------------
// Skill definitions: which ability each skill uses, by class
// ---------------------------------------------------------------------------

const CLASS_SKILLS: Record<string, string[]> = {
  fighter: ['Athletics', 'Intimidation'],
  cleric: ['Medicine', 'Religion'],
  rogue: ['Acrobatics', 'Deception', 'Insight', 'Stealth'],
  wizard: ['Arcana', 'History'],
}

// All 5e skills mapped to their governing ability score
const SKILL_ABILITY_MAP: Record<string, string> = {
  Acrobatics: 'dex',
  'Animal Handling': 'wis',
  Arcana: 'int',
  Athletics: 'str',
  Deception: 'cha',
  History: 'int',
  Insight: 'wis',
  Intimidation: 'cha',
  Investigation: 'int',
  Medicine: 'wis',
  Nature: 'int',
  Perception: 'wis',
  Performance: 'cha',
  Persuasion: 'cha',
  Religion: 'int',
  'Sleight of Hand': 'dex',
  Stealth: 'dex',
  Survival: 'wis',
}

// ---------------------------------------------------------------------------
// Cluster A: full sheet shapes (POL-23a)
// ---------------------------------------------------------------------------
// These shapes are the on-disk JSONB contract for the new `weapons`,
// `spells_known`, `class_features`, and `feature_uses` columns added in
// migration 20260503000000_character_sheet_completeness.sql. The mobile
// sheet (POL-23c) and the per-turn payload (POL-23b) will read them
// verbatim. See docs/ARCHITECTURE.md §9.2 "Schema deltas — characters".

export interface WeaponEntry {
  id: string
  name: string
  type: 'melee' | 'ranged' | 'thrown'
  attack_bonus: number
  /** "1d8+3", "2d6", etc. */
  damage_dice: string
  damage_type: string
  /** "light", "finesse", "two-handed", etc. */
  properties: string[]
  /** "5 ft", "80/320 ft", "20 ft" (thrown). */
  reach_or_range: string
}

export interface SpellEntry {
  id: string
  name: string
  /** 0 for cantrips. */
  level: number
  school?: string
  casting_time: string
  range: string
  /** ["V", "S", "M (a sprig of mistletoe)"] */
  components: string[]
  duration: string
  /** Verbatim from source — full text, not summarised. */
  description: string
  save_ability?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'
  concentration?: boolean
  ritual?: boolean
}

export type FeatureRecharge = 'short_rest' | 'long_rest' | 'turn' | 'unlimited'

export interface ClassFeatureEntry {
  id: string
  name: string
  description: string
  uses_per?: FeatureRecharge
  max_uses?: number
}

/**
 * Map of `feature_id → use-tracking row`. Long-rest features (Action Surge,
 * Second Wind) live here on the `characters` row. Turn-scoped features
 * (Cunning Action) belong on the per-round ledger added in Cluster B
 * (`character_combat_turn`); they may also appear here for back-compat.
 */
export type FeatureUseLastReset = 'short_rest' | 'long_rest' | 'never'

export interface FeatureUseEntry {
  current_uses: number
  last_reset: FeatureUseLastReset
}

export type SpellcastingAbility = 'INT' | 'WIS' | 'CHA'

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface ComputedCharacter {
  session_id: string
  player_name: string
  character_name: string
  class: string
  race: string
  level: number
  xp: number
  hp: number
  max_hp: number
  ac: number
  stats: Record<string, number>
  saving_throws: Record<string, number>
  skills: Record<string, number>
  inventory: Array<{ name: string; quantity: number }>
  spell_slots: Record<string, number>
  conditions: string[]
  tolerance_threshold: number
  drinks_consumed: number
  slot: number
  personality_traits: string[]
  // ---- Cluster A additions (POL-23a) ----
  weapons: WeaponEntry[]
  spells_known: SpellEntry[]
  class_features: ClassFeatureEntry[]
  feature_uses: Record<string, FeatureUseEntry>
  prof_bonus: number
  spell_save_dc: number | null
  spell_attack_bonus: number | null
  spellcasting_ability: SpellcastingAbility | null
}

/**
 * Inputs not derivable from class+stats — usually supplied by a module
 * template (BLACKTHORN_TEMPLATES) or character-create flow. Pure overrides;
 * `computeCharacter` falls back to class-derived defaults when omitted.
 */
export interface ComputeOverrides {
  weapons?: WeaponEntry[]
  spells_known?: SpellEntry[]
  class_features?: ClassFeatureEntry[]
  spellcasting_ability?: SpellcastingAbility
}

// ---------------------------------------------------------------------------
// Compute function
// ---------------------------------------------------------------------------

/**
 * Proficiency bonus by character level (5e SRD).
 * 1–4 → +2, 5–8 → +3, 9–12 → +4, 13–16 → +5, 17–20 → +6.
 */
export function profBonusForLevel(level: number): number {
  if (level >= 17) return 6
  if (level >= 13) return 5
  if (level >= 9) return 4
  if (level >= 5) return 3
  return 2
}

/**
 * Default spellcasting ability by class id. `null` for non-casters.
 * Wizards use INT (the homebrew "Wizard-stand-in-for-Sorcerer" used by
 * the Blackthorn Wynn template overrides this to CHA via the template's
 * explicit `spellcasting_ability` field — see `ComputeOverrides`).
 */
function defaultSpellcastingAbility(classId: string): SpellcastingAbility | null {
  switch (classId) {
    case 'wizard':
      return 'INT'
    case 'cleric':
      return 'WIS'
    default:
      return null
  }
}

export function computeCharacter(input: {
  playerName: string
  characterName: string
  classId: string
  raceId: string
  statAssignments: Record<string, number>
  personalityTraits: string[]
  sessionId: string
  slot: number
  /**
   * Optional overrides for fields the home-grown 4-step creator can't
   * derive on its own (full spell descriptions, weapons, named features).
   * BLACKTHORN_TEMPLATES supplies these for Wynn / Tarric.
   */
  overrides?: ComputeOverrides
  /**
   * Optional level override. Defaults to 1 (the home-grown creator only
   * supports level-1 PCs); Blackthorn templates supply level 4.
   */
  level?: number
}): ComputedCharacter {
  const charClass = CLASSES.find((c) => c.id === input.classId)
  if (!charClass) throw new Error(`Unknown class: ${input.classId}`)

  const charRace = RACES.find((r) => r.id === input.raceId)
  if (!charRace) throw new Error(`Unknown race: ${input.raceId}`)

  // 1. Apply racial ability bonuses on top of stat assignments
  const stats: Record<string, number> = {}
  for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    const base = input.statAssignments[ability] ?? 10
    const bonus = (charRace.abilityBonuses as Record<string, number>)[ability] ?? 0
    stats[ability] = base + bonus
  }

  // 2. Ability modifiers
  const mod = (score: number) => Math.floor((score - 10) / 2)
  const conMod = mod(stats.con)
  const dexMod = mod(stats.dex)

  // 3. Max HP: hit die + CON modifier (minimum 1)
  const maxHp = Math.max(1, charClass.hitDie + conMod)

  // 4. AC: 10 + DEX modifier (basic unarmored)
  const ac = 10 + dexMod

  // 5. Saving throws: proficient saves get +2 (level 1 proficiency bonus)
  const savingThrows: Record<string, number> = {}
  for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    const isProficient = charClass.savingThrows.includes(ability as never)
    savingThrows[ability] = mod(stats[ability]) + (isProficient ? 2 : 0)
  }

  // 6. Skills: class skill proficiencies get +2
  const proficientSkills = new Set(CLASS_SKILLS[input.classId] ?? [])
  const skills: Record<string, number> = {}
  for (const [skill, ability] of Object.entries(SKILL_ABILITY_MAP)) {
    const abilityMod = mod(stats[ability] ?? 10)
    skills[skill] = abilityMod + (proficientSkills.has(skill) ? 2 : 0)
  }

  // 7. Spell slots
  const spellSlots: Record<string, number> =
    input.classId === 'wizard' || input.classId === 'cleric' ? { '1': 2 } : {}

  // 8. Inventory from startingEquipment
  const inventory = charClass.startingEquipment.map((name) => ({ name, quantity: 1 }))

  // 9. Tolerance threshold: d6 roll + CON modifier, minimum 1 (SECRET stat)
  const d6Roll = Math.floor(Math.random() * 6) + 1
  const toleranceThreshold = Math.max(1, d6Roll + conMod)

  // 10. Cluster A — full sheet derivations (POL-23a).
  //     - prof_bonus from level
  //     - spellcasting_ability from class (override-able by template)
  //     - spell_save_dc / spell_attack_bonus when spellcasting_ability is set
  //     - weapons / spells_known / class_features come from the template
  //       (level-1 creator has no curated source; defaults to empty).
  const level = input.level ?? 1
  const prof_bonus = profBonusForLevel(level)

  const spellcasting_ability: SpellcastingAbility | null =
    input.overrides?.spellcasting_ability ?? defaultSpellcastingAbility(input.classId)

  const abilityKey =
    spellcasting_ability === 'INT' ? 'int'
      : spellcasting_ability === 'WIS' ? 'wis'
      : spellcasting_ability === 'CHA' ? 'cha'
      : null
  const castingMod = abilityKey ? mod(stats[abilityKey] ?? 10) : 0

  const spell_save_dc = spellcasting_ability ? 8 + prof_bonus + castingMod : null
  const spell_attack_bonus = spellcasting_ability ? prof_bonus + castingMod : null

  const weapons: WeaponEntry[] = input.overrides?.weapons ?? []
  const spells_known: SpellEntry[] = input.overrides?.spells_known ?? []
  const class_features: ClassFeatureEntry[] = input.overrides?.class_features ?? []

  // 11. feature_uses — initialise current_uses = max_uses for any feature
  //     with bounded uses. Unlimited / turn-scoped features get an entry
  //     too so the UI can render a row even when usage is implicit.
  const feature_uses: Record<string, FeatureUseEntry> = {}
  for (const feat of class_features) {
    if (typeof feat.max_uses === 'number') {
      const recharge: FeatureUseLastReset =
        feat.uses_per === 'short_rest' || feat.uses_per === 'long_rest'
          ? feat.uses_per
          : 'never'
      feature_uses[feat.id] = {
        current_uses: feat.max_uses,
        last_reset: recharge,
      }
    }
  }

  return {
    session_id: input.sessionId,
    player_name: input.playerName,
    character_name: input.characterName,
    class: input.classId,
    race: input.raceId,
    level,
    xp: 0,
    hp: maxHp,
    max_hp: maxHp,
    ac,
    stats,
    saving_throws: savingThrows,
    skills,
    inventory,
    spell_slots: spellSlots,
    conditions: [],
    tolerance_threshold: toleranceThreshold,
    drinks_consumed: 0,
    slot: input.slot,
    personality_traits: input.personalityTraits,
    weapons,
    spells_known,
    class_features,
    feature_uses,
    prof_bonus,
    spell_save_dc,
    spell_attack_bonus,
    spellcasting_ability,
  }
}
