// 5e level-up rules for the four supported classes, levels 1–5.

export const XP_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 300,
  3: 900,
  4: 2700,
  5: 6500,
}

export function xpForNextLevel(level: number): number | null {
  return XP_THRESHOLDS[level + 1] ?? null
}

export function levelForXp(xp: number): number {
  let level = 1
  for (const [lvl, threshold] of Object.entries(XP_THRESHOLDS)) {
    if (xp >= threshold) level = Number(lvl)
  }
  return level
}

// ---------------------------------------------------------------------------
// Spell slot maximums per spellcaster class per level
// { "1": slots, "2": slots, ... }
// ---------------------------------------------------------------------------

export const SPELL_SLOTS_BY_LEVEL: Record<string, Record<number, Record<string, number>>> = {
  wizard: {
    1: { '1': 2 },
    2: { '1': 3 },
    3: { '1': 4, '2': 2 },
    4: { '1': 4, '2': 3 },
    5: { '1': 4, '2': 3, '3': 2 },
  },
  cleric: {
    1: { '1': 2 },
    2: { '1': 3 },
    3: { '1': 4, '2': 2 },
    4: { '1': 4, '2': 3 },
    5: { '1': 4, '2': 3, '3': 2 },
  },
}

// ---------------------------------------------------------------------------
// New features gained at each level per class
// ---------------------------------------------------------------------------

export interface LevelFeature {
  name: string
  description: string
}

export const CLASS_FEATURES_BY_LEVEL: Record<string, Record<number, LevelFeature[]>> = {
  fighter: {
    2: [
      { name: 'Action Surge', description: 'Once per rest, take one additional action on your turn. Use it for an extra Attack action, Dash, or anything else.' },
    ],
    3: [
      { name: 'Martial Archetype', description: 'Choose a subclass: Champion (critical on 19-20), Battle Master (superiority dice maneuvers), or Eldritch Knight (spells).' },
    ],
    4: [
      { name: 'Ability Score Improvement', description: 'Increase one ability score by 2, or two ability scores by 1 each (maximum 20).' },
    ],
    5: [
      { name: 'Extra Attack', description: 'You can attack twice whenever you take the Attack action.' },
    ],
  },
  cleric: {
    2: [
      { name: 'Channel Divinity', description: 'Once per rest, channel divine energy for a powerful effect. Turn Undead (force undead to flee) is always available; your domain grants a second option.' },
    ],
    3: [
      { name: '2nd-Level Spell Slots', description: 'You can now cast 2nd-level spells. Gain access to spells like Spiritual Weapon, Hold Person, and Silence.' },
    ],
    4: [
      { name: 'Ability Score Improvement', description: 'Increase one ability score by 2, or two ability scores by 1 each (maximum 20).' },
    ],
    5: [
      { name: 'Destroy Undead', description: 'When you use Turn Undead, any undead of CR 1/2 or lower is destroyed outright rather than just turned.' },
      { name: '3rd-Level Spell Slots', description: 'Gain 3rd-level spell slots. Access spells like Spirit Guardians, Mass Healing Word, and Dispel Magic.' },
    ],
  },
  rogue: {
    2: [
      { name: 'Cunning Action', description: 'Bonus action each turn to Dash, Disengage, or Hide. Perfect for hit-and-run tactics.' },
    ],
    3: [
      { name: 'Roguish Archetype', description: 'Choose a subclass: Thief (faster hands, superior climbing), Assassin (critical on surprise, poison use), or Arcane Trickster (magic spells).' },
      { name: 'Sneak Attack +2d6', description: 'Your Sneak Attack damage increases to 2d6.' },
    ],
    4: [
      { name: 'Ability Score Improvement', description: 'Increase one ability score by 2, or two ability scores by 1 each (maximum 20).' },
    ],
    5: [
      { name: 'Uncanny Dodge', description: 'When a visible attacker hits you, use your reaction to halve the damage.' },
      { name: 'Sneak Attack +3d6', description: 'Your Sneak Attack damage increases to 3d6.' },
    ],
  },
  wizard: {
    2: [
      { name: 'Arcane Tradition', description: 'Choose a school of magic: Evocation (empowered damage spells), Divination (portent dice to replace any roll), or Abjuration (defensive magic).' },
      { name: 'Arcane Recovery', description: 'Once per day after a short rest, recover spell slots whose levels total half your wizard level (rounded up).' },
    ],
    3: [
      { name: '2nd-Level Spell Slots', description: 'You can now cast 2nd-level spells. Gain access to Misty Step, Shatter, Blindness/Deafness, and more.' },
    ],
    4: [
      { name: 'Ability Score Improvement', description: 'Increase one ability score by 2, or two ability scores by 1 each (maximum 20).' },
    ],
    5: [
      { name: '3rd-Level Spell Slots', description: 'Gain 3rd-level spell slots. Access Fireball, Counterspell, Lightning Bolt, and Fly.' },
    ],
  },
}

// ---------------------------------------------------------------------------
// ASI — levels where an ASI is available per class
// ---------------------------------------------------------------------------

export const ASI_LEVELS: Record<string, number[]> = {
  fighter: [4, 6, 8, 12],
  cleric:  [4, 8, 12, 16],
  rogue:   [4, 8, 10, 12],
  wizard:  [4, 8, 12, 16],
}

export function hasASI(classId: string, level: number): boolean {
  return ASI_LEVELS[classId]?.includes(level) ?? false
}
