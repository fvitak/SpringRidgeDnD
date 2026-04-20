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
}

// ---------------------------------------------------------------------------
// Compute function
// ---------------------------------------------------------------------------

export function computeCharacter(input: {
  playerName: string
  characterName: string
  classId: string
  raceId: string
  statAssignments: Record<string, number>
  personalityTraits: string[]
  sessionId: string
  slot: number
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

  return {
    session_id: input.sessionId,
    player_name: input.playerName,
    character_name: input.characterName,
    class: input.classId,
    race: input.raceId,
    level: 1,
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
  }
}
