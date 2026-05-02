/**
 * Hand-curated 5e SRD reference. Lives in the cached portion of the
 * module-runner system prompt.
 *
 * Source intent: distilled from the 5e SRD (CC-BY-4.0). Aim ~1.5–2 KB so
 * the cached prefix stays a single ephemeral block. Updates here grow
 * the cache prefix and tokens-per-turn — review carefully.
 *
 * See DECISIONS.md 2026-04-30 ADR
 *   "5e SRD as a compact distilled cheat sheet in the cached prompt header".
 */

export const SRD_CHEAT_SHEET = `=== 5E SRD CHEAT SHEET ===

ABILITY MODIFIER (and Proficiency Bonus by character level):
- Ability mod = floor((score - 10) / 2). 8=-1, 10=0, 12=+1, 14=+2, 16=+3, 18=+4, 20=+5.
- Proficiency: levels 1-4 = +2, levels 5-8 = +3, levels 9-12 = +4, levels 13-16 = +5, levels 17-20 = +6.

ACTION ECONOMY (one of each per turn):
- Action: Attack, Cast a Spell (1 action), Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object.
- Bonus action: only when a feature/spell explicitly grants one (e.g. Cunning Action, Healing Word, Two-Weapon Fighting offhand attack).
- Reaction: 1/round. Most common is Opportunity Attack (triggered when an enemy leaves your reach without Disengaging). Counterspell, Shield, Hellish Rebuke also reactions.
- Movement: up to your speed; can be split before/after action.
- Free interaction: 1 trivial object interaction per turn (draw one weapon, open an unlocked door).

ATTACK ROLL vs AC:
- Roll: d20 + ability mod + proficiency (if proficient with the weapon) + other bonuses.
- Hit if total >= target's AC (5e is "meet or beat"; player-facing copy says "beat").
- Natural 20 = critical hit (roll all damage dice twice, then add modifiers).
- Natural 1 = automatic miss on attack rolls (NOT on saves or skill checks in 5e RAW — explain this only when it comes up).
- Damage roll: weapon dice + ability mod (STR for melee/thrown, DEX for finesse/ranged).

ABILITY CHECKS / SAVING THROWS:
- Roll: d20 + ability mod + proficiency (if proficient with the skill/save).
- Skill -> ability mapping:
    STR: Athletics
    DEX: Acrobatics, Sleight of Hand, Stealth
    INT: Arcana, History, Investigation, Nature, Religion
    WIS: Animal Handling, Insight, Medicine, Perception, Survival
    CHA: Deception, Intimidation, Performance, Persuasion
- Saving throw DC for a spell or feature: 8 + ability mod + proficiency.
- Passive Perception: 10 + WIS mod + proficiency (if proficient).

DC BANDS (suggested):
- Very easy 5, Easy 10, Medium 15, Hard 20, Very hard 25, Nearly impossible 30.

ADVANTAGE / DISADVANTAGE:
- Advantage: roll 2d20, take the higher.
- Disadvantage: roll 2d20, take the lower.
- Multiple sources of advantage do NOT stack. One source of each cancels out (you roll a single d20).

CONCENTRATION:
- A creature can concentrate on only one spell at a time.
- On taking damage, make a CON save (DC = max(10, half damage taken)) or lose concentration.
- Incapacitation, sleep, or death also breaks concentration.

CONDITIONS (in 5e SRD; one-line summaries):
- Blinded: auto-fail sight checks; attacks against you have advantage; your attacks have disadvantage.
- Charmed: cannot attack the charmer or target them with harmful abilities.
- Deafened: auto-fail hearing checks.
- Frightened: disadvantage on checks/attacks while source in line of sight; cannot willingly move closer.
- Grappled: speed becomes 0; ends if grappler is incapacitated.
- Incapacitated: no actions or reactions.
- Invisible: heavily obscured to others; attacks against have disadvantage; your attacks have advantage.
- Paralyzed: incapacitated; cannot move/speak; auto-fail STR/DEX saves; attacks against have advantage; melee hits within 5ft are crits.
- Petrified: turned to stone; incapacitated; resistant to all damage.
- Poisoned: disadvantage on attacks and ability checks.
- Prone: disadvantage on attacks; ranged attacks against you have disadvantage; melee attacks against you have advantage.
- Restrained: speed 0; disadvantage on attacks and DEX saves; attacks against have advantage.
- Stunned: incapacitated; auto-fail STR/DEX saves; attacks against have advantage.
- Unconscious: incapacitated, prone; auto-fail STR/DEX saves; melee attacks within 5ft crit; ranged advantage.

DEATH SAVES:
- At 0 HP, on each of your turns, roll d20 (no modifier).
- 10+ = success. <10 = failure. 1 = two failures. 20 = regain 1 HP.
- Three successes = stable. Three failures = dead. Damage at 0 HP = 1 failure (crit = 2).

REST:
- Short rest: 1 hour; spend Hit Dice to heal (1 die per spend, +CON mod each).
- Long rest: 8 hours; regain all HP, half max Hit Dice, all spell slots (most classes), reset short-rest features.
- Cannot benefit from more than one long rest per 24 hours.

COVER:
- Half cover: +2 to AC and DEX saves. Three-quarters cover: +5. Total cover: cannot be targeted directly.

LIGHT:
- Bright light: normal vision. Dim light: lightly obscured (disadvantage on Perception sight). Darkness: heavily obscured (effectively blinded).

INITIATIVE / SURPRISE:
- Roll d20 + DEX mod. Ties: higher DEX score wins; PCs vs NPCs ties go to the PC.
- Surprised creatures cannot move or take actions on their first turn and cannot take reactions until that turn ends.

GRAPPLE / SHOVE (special melee actions):
- Grapple: replace one attack with a contested STR (Athletics) check vs target's STR (Athletics) or DEX (Acrobatics).
- Shove: same contest; success knocks target prone OR pushes 5ft.

OPPORTUNITY ATTACK:
- Provoked when a hostile creature you can see leaves your reach without Disengaging or teleporting.
- Costs your reaction. Make one melee weapon attack against the leaving creature.

LIFTING / CARRYING (rule of thumb):
- Carrying capacity = STR x 15 lb. Push/drag/lift = STR x 30 lb (speed halves above carry).

VISION:
- Darkvision: see in dim light as if bright (60ft typical), darkness as dim. Cannot discern colour in darkness.
- Blindsight: perceive surroundings without sight, range varies.

TEACHING-MODE QUICK REFERENCE FORMULA (for the rule-explainer voice):
- Skill check: "[Skill] check. Roll d20 + [ability] ([+mod]). Beat DC [DC] to [outcome]."
- Saving throw: "[Ability] save. Roll d20 + [ability] ([+mod]). Beat the DC ([DC]) and you shake off the worst of it."
- Attack roll: "Attack roll. Roll d20 + your attack bonus (+[bonus]). Beat the target's AC ([AC]) and you hit."
- After roll: "You rolled [d20], +[mod] = [total]. That [beats / falls short of] [DC] — [outcome]."

VOICE / PACING REMINDERS:
- Show the math the first time a mechanic appears. Subsequent fires shorten to a one-liner.
- Use 'beat' (not 'meet or beat') in teaching copy. The cheat sheet here is honest about the RAW; player-facing voice is friendlier.
- Name what the DC represents in fiction the first time ("the lookout's Passive Perception"). After that, just "DC 13".
`
