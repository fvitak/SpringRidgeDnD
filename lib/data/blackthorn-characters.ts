/**
 * Pre-built level-4 character templates for Rescue of the Blackthorn Clan.
 * Stat blocks paraphrased from the source PDF (pp 59-69) — adapted, not copied.
 *
 * The shape mirrors what computeCharacter() produces for the home-grown
 * 4-step creator (compute-character.ts ComputedCharacter), so these rows can
 * be inserted directly into the `characters` table.
 */

import type { ComputedCharacter } from '@/lib/character/compute-character'

type BlackthornTemplate = Omit<ComputedCharacter, 'session_id' | 'slot' | 'player_name' | 'character_name'>
  & { suggestedName: string }

export const BLACKTHORN_TEMPLATES: Record<'wynn' | 'tarric', BlackthornTemplate> = {
  wynn: {
    suggestedName: 'Wynn',
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
  },
  tarric: {
    suggestedName: 'Tarric',
    class: 'fighter', // closest of our four base classes — stand-in for Ranger
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
    spell_slots: { '1': 3 },
    conditions: [],
    tolerance_threshold: 5,
    drinks_consumed: 0,
    personality_traits: [
      'Slow to anger, slower to forgive a betrayal of trust',
      'Reads tracks before he reads people',
      'Lets Briar speak first in any uncertain doorway',
    ],
  },
}

/** Slot 1 = Wynn, Slot 2 = Tarric. */
export const BLACKTHORN_SLOT_MAP: Record<number, 'wynn' | 'tarric'> = {
  1: 'wynn',
  2: 'tarric',
}
