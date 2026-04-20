// ============================================================
// D&D 5e Character Options — Level 1 Data
// ============================================================

export const ABILITY_SCORES = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
] as const;

export type AbilityScore = (typeof ABILITY_SCORES)[number];

// Standard array (point-buy equivalent, descending)
export const STANDARD_STAT_ARRAY = [16, 14, 13, 12, 10, 8] as const;

// Recommended stat layouts per class — players can adjust from these defaults
export const CLASS_STAT_DEFAULTS: Record<string, Record<string, number>> = {
  fighter: { str: 16, con: 14, dex: 13, wis: 12, cha: 10, int: 8 },
  cleric:  { wis: 16, con: 14, cha: 13, str: 12, dex: 10, int: 8 },
  rogue:   { dex: 16, int: 14, cha: 13, con: 12, wis: 10, str: 8 },
  wizard:  { int: 16, dex: 14, con: 13, wis: 12, cha: 10, str: 8 },
};

// ============================================================
// Classes
// ============================================================

export interface CharacterClass {
  id: string;
  name: string;
  description: string;
  tagline: string;
  hitDie: number;
  primaryAbility: AbilityScore;
  savingThrows: [AbilityScore, AbilityScore];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  skillCount: number;
  spellcaster: boolean;
  startingEquipment: string[];
  classFeatures: string[];
}

export const CLASSES: CharacterClass[] = [
  {
    id: "fighter",
    name: "Fighter",
    description:
      "A battle-hardened warrior who has mastered weapons and armor to dominate the front lines of any fight.",
    tagline: "Hits things. Doesn't stop.",
    hitDie: 10,
    primaryAbility: "str",
    savingThrows: ["str", "con"],
    armorProficiencies: ["Light armor", "Medium armor", "Heavy armor", "Shields"],
    weaponProficiencies: ["Simple weapons", "Martial weapons"],
    skillCount: 2,
    spellcaster: false,
    startingEquipment: [
      "Chain mail",
      "Longsword",
      "Shield",
      "Light crossbow and 20 bolts",
      "Dungeoneer's pack",
    ],
    classFeatures: [
      "Fighting Style (choose one specialty like Dueling or Defense)",
      "Second Wind (heal yourself once per short rest as a bonus action)",
    ],
  },
  {
    id: "cleric",
    name: "Cleric",
    description:
      "A devoted servant of a god who channels divine power to heal allies, smite enemies, and protect the innocent.",
    tagline: "Blessed, armed, and dangerous.",
    hitDie: 8,
    primaryAbility: "wis",
    savingThrows: ["wis", "cha"],
    armorProficiencies: ["Light armor", "Medium armor", "Shields"],
    weaponProficiencies: ["Simple weapons"],
    skillCount: 2,
    spellcaster: true,
    startingEquipment: [
      "Mace",
      "Scale mail",
      "Shield",
      "Holy symbol",
      "Priest's pack",
      "Light crossbow and 20 bolts",
    ],
    classFeatures: [
      "Spellcasting (prepare and cast healing and divine spells using Wisdom)",
      "Divine Domain (choose a domain like Life or Light that grants bonus abilities)",
      "Domain Spells (bonus spells always prepared based on your domain)",
    ],
  },
  {
    id: "rogue",
    name: "Rogue",
    description:
      "A cunning trickster who relies on stealth, speed, and precision to outmaneuver opponents and strike at the perfect moment.",
    tagline: "In, out, no one saw.",
    hitDie: 8,
    primaryAbility: "dex",
    savingThrows: ["dex", "int"],
    armorProficiencies: ["Light armor"],
    weaponProficiencies: [
      "Simple weapons",
      "Hand crossbows",
      "Longswords",
      "Rapiers",
      "Shortswords",
    ],
    skillCount: 4,
    spellcaster: false,
    startingEquipment: [
      "Rapier",
      "Shortbow and 20 arrows",
      "Leather armor",
      "Two daggers",
      "Thieves' tools",
      "Burglar's pack",
    ],
    classFeatures: [
      "Expertise (double your proficiency bonus on two chosen skills)",
      "Sneak Attack (deal extra damage when you have advantage or an ally nearby)",
      "Thieves' Cant (secret language and signals known only to rogues)",
    ],
  },
  {
    id: "wizard",
    name: "Wizard",
    description:
      "A scholar of the arcane arts who bends reality through careful study of spells, turning knowledge itself into power.",
    tagline: "Studied hard. Can fireball.",
    hitDie: 6,
    primaryAbility: "int",
    savingThrows: ["int", "wis"],
    armorProficiencies: [],
    weaponProficiencies: [
      "Daggers",
      "Darts",
      "Slings",
      "Quarterstaffs",
      "Light crossbows",
    ],
    skillCount: 2,
    spellcaster: true,
    startingEquipment: [
      "Quarterstaff",
      "Spellbook",
      "Arcane focus",
      "Scholar's pack",
      "Leather armor (dagger alternative)",
      "Two daggers",
    ],
    classFeatures: [
      "Spellcasting (learn and cast powerful arcane spells using Intelligence)",
      "Arcane Recovery (regain some spell slots during a short rest once per day)",
    ],
  },
];

// ============================================================
// Races
// ============================================================

export interface CharacterRace {
  id: string;
  name: string;
  description: string;
  speed: number;
  abilityBonuses: Partial<Record<AbilityScore, number>>;
  traits: string[];
  languages: string[];
}

export const RACES: CharacterRace[] = [
  {
    id: "human",
    name: "Human",
    description:
      "Adaptable and ambitious, humans are the most common folk in the world and excel at whatever they put their minds to.",
    speed: 30,
    abilityBonuses: {
      str: 1,
      dex: 1,
      con: 1,
      int: 1,
      wis: 1,
      cha: 1,
    },
    traits: [
      "Versatile (bonus +1 to every ability score)",
      "Extra Language (learn one additional language of your choice)",
    ],
    languages: ["Common", "One extra language of your choice"],
  },
  {
    id: "elf",
    name: "Elf",
    description:
      "Graceful and long-lived, elves have keen senses, natural magical talent, and an effortless elegance in everything they do.",
    speed: 30,
    abilityBonuses: {
      dex: 2,
      int: 1,
    },
    traits: [
      "Darkvision (see clearly in the dark up to 60 feet)",
      "Keen Senses (proficient in Perception checks)",
      "Fey Ancestry (advantage against being charmed, immune to magical sleep)",
      "Trance (meditate for 4 hours instead of sleeping 8)",
      "Elf Weapon Training (proficient with longsword, shortsword, shortbow, longbow)",
      "Cantrip (know one wizard cantrip, like light or mage hand)",
    ],
    languages: ["Common", "Elvish"],
  },
  {
    id: "dwarf",
    name: "Dwarf",
    description:
      "Tough as nails and stubborn as stone, dwarves are legendary crafters and warriors who never back down from a fight.",
    speed: 25,
    abilityBonuses: {
      con: 2,
      wis: 1,
    },
    traits: [
      "Darkvision (see clearly in the dark up to 60 feet)",
      "Dwarven Resilience (advantage on poison saves, resistance to poison damage)",
      "Dwarven Combat Training (proficient with battleaxe, handaxe, throwing hammer, warhammer)",
      "Stonecunning (double proficiency on History checks about stonework)",
      "Tool Proficiency (proficient with smith's tools, brewer's supplies, or mason's tools)",
      "Speed is not reduced by heavy armor",
    ],
    languages: ["Common", "Dwarvish"],
  },
  {
    id: "halfling",
    name: "Halfling",
    description:
      "Small, cheerful, and surprisingly lucky, halflings are beloved wanderers who have a knack for getting out of trouble.",
    speed: 25,
    abilityBonuses: {
      dex: 2,
      cha: 1,
    },
    traits: [
      "Lucky (reroll any 1 you roll on an attack, ability check, or saving throw)",
      "Brave (advantage against being frightened)",
      "Halfling Nimbleness (move through the space of any creature larger than you)",
      "Naturally Stealthy (can hide behind creatures one size larger than you)",
    ],
    languages: ["Common", "Halfling"],
  },
];
