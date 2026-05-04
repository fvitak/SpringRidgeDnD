-- =============================================================================
-- Migration: 20260503000000_character_sheet_completeness.sql
-- Theme:     POL-23a (Cluster A) — full character-sheet data on `characters`
-- Created:   2026-05-03
--
-- Background: the post-playtest combat-system overhaul depends on the AI
-- (and the host UI's action picker, and the mobile sheet) reading the PC's
-- full sheet — weapons, spells, features, derived bonuses — from
-- authoritative server state instead of trusting the AI's prompt-baked
-- knowledge of class capabilities. See ARCHITECTURE.md §9.2 "Schema
-- deltas" and DECISIONS.md 2026-05-03 "Server is the bookkeeper".
--
-- This migration is the foundation for that cluster. Cluster B reads it,
-- POL-23c renders it, POL-25 (action picker) chips off it. Nothing else
-- in the cluster moves until this lands.
--
-- Forward-only, additive, idempotent.
--
-- Adds eight columns to `characters`:
--   weapons              JSONB DEFAULT '[]'   — array of WeaponEntry
--   spells_known         JSONB DEFAULT '[]'   — array of SpellEntry
--   class_features       JSONB DEFAULT '[]'   — array of ClassFeatureEntry
--   feature_uses         JSONB DEFAULT '{}'   — map of feature_id -> use row
--   prof_bonus           INT   DEFAULT 2      — derived from level
--   spell_save_dc        INT   NULL           — null for non-casters
--   spell_attack_bonus   INT   NULL           — null for non-casters
--   spellcasting_ability TEXT  NULL           — 'INT'|'WIS'|'CHA' or NULL
--
-- Backfills the two Blackthorn PCs (Wynn, Tarric) with verbatim PDF data;
-- Briar (companion) gets a minimal entry. Non-Blackthorn rows are
-- untouched and keep the column defaults.
--
-- Shape contract: see lib/character/compute-character.ts (WeaponEntry,
-- SpellEntry, ClassFeatureEntry, FeatureUseEntry). The TS types and the
-- JSONB defaults must stay in sync; if you change one, change the other.
-- =============================================================================

-- 1. Add the columns. NOT NULL on the JSONB / int defaults so reads never
--    have to coalesce; spell-related ints stay nullable for non-casters.
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS weapons              JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS spells_known         JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS class_features       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_uses         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS prof_bonus           INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS spell_save_dc        INTEGER,
  ADD COLUMN IF NOT EXISTS spell_attack_bonus   INTEGER,
  ADD COLUMN IF NOT EXISTS spellcasting_ability TEXT;

COMMENT ON COLUMN characters.weapons IS
  'Array of WeaponEntry blobs ({id,name,type,attack_bonus,damage_dice,damage_type,properties[],reach_or_range}). Computed in compute-character.ts; populated for Blackthorn PCs by this migration. Mobile sheet renders as attack rows; AI reads via per-turn party[].sheet payload.';

COMMENT ON COLUMN characters.spells_known IS
  'Array of SpellEntry blobs with verbatim rules text in `description`. NEVER paraphrase — the AI reads these directly when emitting spell narration.';

COMMENT ON COLUMN characters.class_features IS
  'Array of ClassFeatureEntry blobs. Long-rest features track use counts on `feature_uses`; turn-scoped features track on the per-round ledger added in Cluster B (`character_combat_turn`).';

COMMENT ON COLUMN characters.feature_uses IS
  'Map of feature_id -> { current_uses, last_reset }. Independent of round-scoped action economy. Reset on the matching short/long rest.';

COMMENT ON COLUMN characters.prof_bonus IS
  'Cached proficiency bonus derived from level. 1-4=2, 5-8=3, 9-12=4, 13-16=5, 17-20=6.';

COMMENT ON COLUMN characters.spell_save_dc IS
  'Cached: 8 + prof_bonus + spellcasting ability mod. NULL for non-casters.';

COMMENT ON COLUMN characters.spell_attack_bonus IS
  'Cached: prof_bonus + spellcasting ability mod. NULL for non-casters.';

COMMENT ON COLUMN characters.spellcasting_ability IS
  'One of ''INT'',''WIS'',''CHA'' for casters; NULL otherwise. Drives the DC + attack-bonus derivations.';

-- ---------------------------------------------------------------------------
-- 2. Backfill: Wynn (Sorcerer-stand-in, level 4, CHA 17 → DC 13, atk +5).
--    Match by (scenario_id = 'blackthorn-clan' via the session) and
--    character_name ILIKE 'wynn'. Only patch rows that still hold the
--    column defaults so re-runs are no-ops.
--    Spell descriptions are verbatim from the PDF (pp 68-70).
-- ---------------------------------------------------------------------------
UPDATE characters
SET
  weapons = $$[
    {"id":"wynn-quarterstaff","name":"Quarterstaff","type":"melee","attack_bonus":2,"damage_dice":"1d6+2","damage_type":"bludgeoning","properties":["versatile (1d8+2)"],"reach_or_range":"5 ft"},
    {"id":"wynn-dagger","name":"Dagger","type":"melee","attack_bonus":4,"damage_dice":"1d4+2","damage_type":"piercing","properties":["finesse","light","thrown"],"reach_or_range":"5 ft / 20 ft thrown"}
  ]$$::jsonb,
  spells_known = $$[
    {"id":"acid-splash","name":"Acid Splash","level":0,"school":"Conjuration","casting_time":"1 action","range":"60 feet","components":["V","S"],"duration":"Instantaneous","save_ability":"DEX","description":"You hurl a bubble of acid. Choose one creature within range, or choose two creatures within range that are within 5 feet of each other. A target must succeed on a Dexterity saving throw or take 1d6 acid damage."},
    {"id":"light","name":"Light","level":0,"school":"Evocation","casting_time":"1 action","range":"Touch","components":["V","M (a firefly or phosphorescent moss)"],"duration":"1 hour","save_ability":"DEX","description":"You touch one object no larger than 10 feet in any dimension. The object sheds bright light in a 20-foot radius and dim light for an additional 20 feet. The light can be colored as you like. Covering the object with something opaque blocks the light. The spell ends if you cast it again or dismiss it as an action. If you target an object held or worn by a hostile creature, that creature must succeed on a Dexterity saving throw to avoid the spell."},
    {"id":"mage-hand","name":"Mage Hand","level":0,"school":"Conjuration","casting_time":"1 action","range":"30 feet","components":["V","S"],"duration":"1 minute","description":"A spectral hand appears at a point you choose within range. The hand vanishes if it is ever more than 30 feet away from you or if you cast this spell again. Use your action to control the hand to manipulate an object, open an unlocked door or container, stow or retrieve an item from an open container, or pour the contents out of a vial. You can move the hand up to 30 feet each time you use it. The hand can't attack, activate magic items, or carry more than 10 pounds."},
    {"id":"message","name":"Message","level":0,"school":"Transmutation","casting_time":"1 action","range":"120 feet","components":["V","S","M (a short piece of copper wire)"],"duration":"1 round","description":"You point your finger toward a creature within range and whisper a message. The target (and only the target) hears the message and can reply in a whisper that only you can hear. You can cast this spell through solid objects if you are familiar with the target and know it is beyond the barrier. Magical silence, 1 foot of stone, 1 inch of common metal, a thin sheet of lead, or 3 feet of wood blocks the spell. The spell doesn't have to follow a straight line and can travel freely around corners or through openings."},
    {"id":"prestidigitation","name":"Prestidigitation","level":0,"school":"Transmutation","casting_time":"1 action","range":"10 feet","components":["V","S"],"duration":"Up to 1 hour","description":"This is a minor magical trick that novice spellcasters use for practice. You create one of the following effects within range: An instantaneous, harmless sensory effect, such as a shower of sparks. Light or snuff out a candle, torch, or small campfire. Clean or soil an object no larger than 1 cubic foot. Chill, warm, or flavor up to 1 cubic foot of nonliving material for 1 hour. Make a color, a mark, or a symbol appear on a surface for 1 hour. Create a nonmagical trinket or an illusory image that can fit in your hand and that lasts until the end of your next turn. If you cast multiple times, you can have three effects active at a time, and you can dismiss them as an action."},
    {"id":"charm-person","name":"Charm Person","level":1,"school":"Enchantment","casting_time":"1 action","range":"30 feet","components":["V","S"],"duration":"1 hour","save_ability":"WIS","description":"You attempt to charm a humanoid you can see within range. It must make a Wisdom saving throw, and has advantage if you or your companions are fighting it. If it fails the saving throw, it is charmed until the spell ends or until you or your companions do anything harmful to it. The charmed creature regards you as a friendly acquaintance. When the spell ends, the creature knows it was charmed."},
    {"id":"magic-missile","name":"Magic Missile","level":1,"school":"Evocation","casting_time":"1 action","range":"120 feet","components":["V","S"],"duration":"Instantaneous","description":"You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several. (If cast using a 2nd level spell slot, an addition dart is cast for a total of four.)"},
    {"id":"shield","name":"Shield","level":1,"school":"Abjuration","casting_time":"1 reaction, which you take when you are hit by an attack or targeted by the magic missile spell","range":"Self","components":["V","S"],"duration":"1 round","description":"An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from magic missile."},
    {"id":"enhance-ability","name":"Enhance Ability","level":2,"school":"Transmutation","casting_time":"1 action","range":"Touch","components":["V","S","M (fur or a feather from a beast)"],"duration":"Concentration, up to 1 hour.","concentration":true,"description":"You touch a creature and bestow upon it a magical enhancement. Choose one of the following effects; the target gains that effect until the spell ends. Bear's Endurance. The target has advantage on Constitution checks. It also gains 2d6 temporary hit points, which are lost when the spell ends. Bull's Strength. The target has advantage on Strength checks, and his or her carrying capacity doubles. Cat's Grace. The target has advantage on Dexterity checks. It also doesn't take damage from falling 20 feet or less if it isn't incapacitated. Eagle's Splendor. The target has advantage on Charisma checks. Fox's Cunning. The target has advantage on Intelligence checks. Owl's Wisdom. The target has advantage on Wisdom checks."},
    {"id":"knock","name":"Knock","level":2,"school":"Transmutation","casting_time":"1 action","range":"30 feet","components":["V"],"duration":"Instantaneous","description":"Choose an object that you can see within range. The object can be a door, a box, a chest, a set of manacles, a padlock, or any object that contains a mundane or magical means that prevents access. A target that is held shut by a mundane lock or that is stuck or barred becomes unlocked, unstuck, or unbarred. If you choose a target that is held shut with arcane lock, that spell is suppressed for 10 minutes, during which time the target can be opened and shut normally. (Spell has been altered slightly for story purposes. The auditory effect has been removed and the range shortened.)"}
  ]$$::jsonb,
  class_features = $$[
    {"id":"sorcerer-spellcasting","name":"Spellcasting","description":"Wynn casts spells using Charisma. Spell save DC 13, spell attack +5. She knows the cantrips and 1st/2nd level spells listed above and recovers slots on a long rest.","uses_per":"long_rest"},
    {"id":"sorcerer-font-of-magic","name":"Font of Magic (Sorcery Points)","description":"At 2nd level, Wynn taps an inner wellspring of magic — 4 sorcery points (= sorcerer level). She can convert spell slots ↔ sorcery points as a bonus action. Sorcery points refresh on a long rest.","uses_per":"long_rest","max_uses":4},
    {"id":"sorcerer-metamagic","name":"Metamagic — Twinned Spell, Heightened Spell","description":"At 3rd level, Wynn knows two Metamagic options. Twinned Spell (1 sorcery point per spell level): when she casts a spell that targets only one creature, she can target a second creature in range. Heightened Spell (3 sorcery points): one target of a spell that requires a save has disadvantage on its first saving throw against it.","uses_per":"long_rest"}
  ]$$::jsonb,
  feature_uses = $${
    "sorcerer-font-of-magic": {"current_uses": 4, "last_reset": "long_rest"}
  }$$::jsonb,
  prof_bonus = 2,
  spell_save_dc = 13,
  spell_attack_bonus = 5,
  spellcasting_ability = 'CHA'
WHERE character_name ILIKE 'wynn'
  AND session_id IN (SELECT id FROM sessions WHERE scenario_id = 'blackthorn-clan')
  AND weapons = '[]'::jsonb
  AND spells_known = '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Backfill: Tarric (Fighter Champion, level 4). Numbers match the PDF
--    Combat Tracker (p 105). Dueling +2 dmg style is encoded as a feature
--    (per-attack rule, not baked into damage_dice). Action Surge and
--    Second Wind are 1/short_rest each.
-- ---------------------------------------------------------------------------
UPDATE characters
SET
  weapons = $$[
    {"id":"tarric-longsword","name":"Longsword (+1 magical)","type":"melee","attack_bonus":5,"damage_dice":"1d8+3","damage_type":"slashing","properties":["versatile (1d10+3)","magical +1"],"reach_or_range":"5 ft"},
    {"id":"tarric-shortsword","name":"Shortsword","type":"melee","attack_bonus":5,"damage_dice":"1d6+3","damage_type":"piercing","properties":["finesse","light"],"reach_or_range":"5 ft"},
    {"id":"tarric-shortbow","name":"Shortbow","type":"ranged","attack_bonus":5,"damage_dice":"1d6+3","damage_type":"piercing","properties":["ammunition (arrows)","two-handed"],"reach_or_range":"80/320 ft"},
    {"id":"tarric-dagger","name":"Dagger","type":"melee","attack_bonus":5,"damage_dice":"1d4+3","damage_type":"piercing","properties":["finesse","light","thrown"],"reach_or_range":"5 ft / 20 ft thrown"}
  ]$$::jsonb,
  spells_known = '[]'::jsonb,
  class_features = $$[
    {"id":"fighting-style-dueling","name":"Fighting Style: Dueling","description":"When wielding a melee weapon in one hand and no other weapons, Tarric gains a +2 bonus to damage rolls with that weapon.","uses_per":"unlimited"},
    {"id":"second-wind","name":"Second Wind","description":"On his turn, Tarric can use a bonus action to regain hit points equal to 1d10+3 (fighter level + CON mod). Once used, must finish a short or long rest before using again.","uses_per":"short_rest","max_uses":1},
    {"id":"action-surge","name":"Action Surge","description":"On his turn, Tarric can take one additional action on top of his regular action and a possible bonus action. Once used, must finish a short or long rest before using again.","uses_per":"short_rest","max_uses":1},
    {"id":"champion-improved-critical","name":"Improved Critical (Champion)","description":"Tarric scores a critical hit on a roll of 19 or 20 with weapon attacks.","uses_per":"unlimited"},
    {"id":"martial-archetype-champion","name":"Martial Archetype: Champion","description":"At 3rd level, Tarric chose the Champion archetype, gaining Improved Critical (above) and a focus on raw martial prowess over tactical tricks.","uses_per":"unlimited"}
  ]$$::jsonb,
  feature_uses = $${
    "second-wind": {"current_uses": 1, "last_reset": "short_rest"},
    "action-surge": {"current_uses": 1, "last_reset": "short_rest"}
  }$$::jsonb,
  prof_bonus = 2,
  spell_save_dc = NULL,
  spell_attack_bonus = NULL,
  spellcasting_ability = NULL
WHERE character_name ILIKE 'tarric'
  AND session_id IN (SELECT id FROM sessions WHERE scenario_id = 'blackthorn-clan')
  AND weapons = '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 4. Backfill: Briar (companion). Today Briar lives as a flavour line in
--    Tarric's inventory and as a token; if/when Briar gets her own
--    `characters` row in a future migration, this UPDATE will populate
--    it. Until then this UPDATE is a no-op (it filters on character_name
--    ILIKE 'briar' which currently matches no row). Kept for completeness
--    so re-running the migration after Briar promotion still backfills.
-- ---------------------------------------------------------------------------
UPDATE characters
SET
  weapons = '[]'::jsonb,
  spells_known = '[]'::jsonb,
  class_features = $$[
    {"id":"briar-bite","name":"Bite","description":"Briar bites a target within 5 ft on Tarric's verbal command (free action). +6 to hit, 2d4+4 piercing damage. On hit, the target makes a DC 11 STR save or is knocked prone (Trip).","uses_per":"unlimited"}
  ]$$::jsonb,
  feature_uses = '{}'::jsonb,
  prof_bonus = 2,
  spell_save_dc = NULL,
  spell_attack_bonus = NULL,
  spellcasting_ability = NULL
WHERE character_name ILIKE 'briar'
  AND session_id IN (SELECT id FROM sessions WHERE scenario_id = 'blackthorn-clan')
  AND class_features = '[]'::jsonb;
