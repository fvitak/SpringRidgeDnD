// ---------------------------------------------------------------------------
// Action picker templates (POL-25)
// ---------------------------------------------------------------------------
//
// Pure helpers for the host-laptop action picker chips. The picker
// (`app/components/ActionPicker.tsx`) reads the active PC's full sheet
// (`weapons`, `spells_known`, `class_features`, `spell_slots`) plus the
// per-PC turn ledger (`character_combat_turn`) and renders chips that,
// when clicked, prepend a natural-language template into the host text
// input. Cluster A surfaces the sheet data; Cluster B surfaces the
// ledger; this module just maps both into chip rows.
//
// The templates' wording matches the natural-language style the AI
// already parses today (per playtest event-log review). Any change to
// template wording should round-trip through one Blackthorn turn to
// confirm the AI still routes correctly.
//
// Pure logic only — no React, no DB, no I/O. Unit-tested by
// `scripts/test-action-templates.ts`.
// ---------------------------------------------------------------------------

import type {
  WeaponEntry,
  SpellEntry,
  ClassFeatureEntry,
} from '@/lib/character/compute-character'

// ---------------------------------------------------------------------------
// Shared chip shape
// ---------------------------------------------------------------------------

/**
 * Action category — drives which row the chip lives on AND which ledger
 * field gates its `disabled` state.
 *
 *   - `action`    → Row 1 (standard actions). Gated by `action_used`.
 *   - `bonus`     → Row 3. Gated by `bonus_action_used`.
 *   - `reaction`  → Row 3. Gated by `reaction_used`.
 *   - `movement`  → Row 3. Gated by `movement_used >= speed`.
 *   - `spell`     → Row 2. Gated by `action_used` (most spells are
 *                   actions) AND by spell-slot availability for that
 *                   level.
 *   - `cantrip`   → Row 1. Gated by `action_used` only — cantrips don't
 *                   consume slots.
 *   - `feature`   → Row 1 by default; bonus-action features
 *                   (Cunning Action, Second Wind on bonus) override the
 *                   chip's category to `bonus` at registration time.
 *
 * Generic free actions (Dash / Dodge / Help / Hide / Ready / Search /
 * Disengage) all live under `action`.
 */
export type ChipCategory =
  | 'action'
  | 'bonus'
  | 'reaction'
  | 'movement'
  | 'spell'
  | 'cantrip'
  | 'feature'

export interface ActionChip {
  /** Stable id for React keys — unique within a render. */
  id: string
  category: ChipCategory
  /** Short label rendered on the chip face. */
  label: string
  /**
   * Natural-language template prepended to the input field on click.
   * Includes a trailing space when the cursor is meant to land at the
   * end ready for elaboration ("Cast Charm Person on "). When the
   * template is fully terminal (Dodge), no trailing space.
   */
  template: string
  /** Optional descriptor surfaced in the hover/long-press popover. */
  details?: ChipDetails
  /**
   * Spell slot level this chip consumes, when applicable. Used by the
   * picker to fade the chip when slots are exhausted at that level.
   * Undefined for cantrips, weapons, generic actions, and features.
   */
  spell_level?: number
}

export interface ChipDetails {
  /** Optional one-line description ("1d6+3 piercing, light, finesse"). */
  summary?: string
  /** Damage / die expression (weapons only). */
  damage?: string
  /** Range or reach ("5 ft", "120 ft", "Touch"). */
  range?: string
  /** Damage / school / condition type ("piercing", "evocation"). */
  flavor?: string
  /** Components string ("V, S, M (a tiny ball of bat guano)"). */
  components?: string
  /** Casting time ("1 action", "1 bonus action"). */
  casting_time?: string
  /** Duration ("Instantaneous", "Concentration, up to 1 minute"). */
  duration?: string
  /** Save type ("DEX save vs. spell DC"). */
  save?: string
  /** Free-form description used as a fallback long-press body. */
  description?: string
  /** Weapon properties list ("light", "finesse", "two-handed"). */
  properties?: string[]
}

// ---------------------------------------------------------------------------
// Generic free actions — same set every PC gets in 5e.
// ---------------------------------------------------------------------------

/**
 * The seven universal actions any PC can take. Returned every render so
 * the picker can render them; each has its own `category` and template
 * so the disabled-gate works automatically.
 */
export function genericActionChips(): ActionChip[] {
  return [
    {
      id: 'generic:dash',
      category: 'action',
      label: 'Dash',
      template: 'Dash to ',
      details: {
        summary: 'Double your speed for the turn.',
        description:
          "When you take the Dash action, you gain extra movement equal to your speed. Any increases or decreases to your speed change this additional movement by the same amount.",
      },
    },
    {
      id: 'generic:dodge',
      category: 'action',
      label: 'Dodge',
      template: 'Take the Dodge action.',
      details: {
        summary: 'Attacks have disadvantage; DEX saves at advantage.',
        description:
          'Until the start of your next turn, any attack roll made against you has disadvantage if you can see the attacker, and you make Dexterity saving throws with advantage. You lose this benefit if you are incapacitated or your speed drops to 0.',
      },
    },
    {
      id: 'generic:help',
      category: 'action',
      label: 'Help',
      template: 'Help an ally with ',
      details: {
        summary: 'Give an ally advantage on their next ability check or attack.',
        description:
          "You can lend your aid to another creature in the completion of a task. The creature you aid gains advantage on the next ability check it makes to perform the task you are helping with, provided that it makes the check before the start of your next turn.",
      },
    },
    {
      id: 'generic:hide',
      category: 'action',
      label: 'Hide',
      template: 'Hide behind ',
      details: {
        summary: 'Make a Stealth check to become hidden.',
        description:
          'When you take the Hide action, you make a Dexterity (Stealth) check in an attempt to hide, following the rules for hiding.',
      },
    },
    {
      id: 'generic:ready',
      category: 'action',
      label: 'Ready',
      template: 'Ready an action: ',
      details: {
        summary: 'Prepare a reaction triggered by a chosen condition.',
        description:
          'You can prepare a reaction to act later in the round, by trading some of your speed and an action now for a single action you can take later. You choose the trigger and the reaction.',
      },
    },
    {
      id: 'generic:search',
      category: 'action',
      label: 'Search',
      template: 'Search for ',
      details: {
        summary: 'Make a Perception or Investigation check.',
        description:
          "When you take the Search action, you devote your attention to finding something. Depending on the nature of your search, the GM might ask you to make a Wisdom (Perception) check or an Intelligence (Investigation) check.",
      },
    },
    {
      id: 'generic:disengage',
      category: 'action',
      label: 'Disengage',
      template: 'Disengage and move ',
      details: {
        summary: 'Move without provoking opportunity attacks.',
        description:
          'If you take the Disengage action, your movement does not provoke opportunity attacks for the rest of the turn.',
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

/** "+5" / "−1" / "+0" — drops the sign normalisation onto one place. */
function formatBonus(n: number): string {
  if (n >= 0) return `+${n}`
  return `${n}` // already has the minus
}

/**
 * Returns one chip per weapon. Two-handed weapons get a single chip;
 * `light`-weapon offhands are surfaced as separate bonus-action chips
 * (see `weaponBonusChips`).
 */
export function weaponChips(weapons: WeaponEntry[]): ActionChip[] {
  return weapons.map((w) => {
    const bonus = formatBonus(w.attack_bonus)
    const damage = `${w.damage_dice} ${w.damage_type}`
    return {
      id: `weapon:${w.id}`,
      category: 'action',
      label: `${w.name} (${bonus} / ${w.damage_dice})`,
      template: `Attack with ${w.name.toLowerCase()}: `,
      details: {
        summary: `Attack ${bonus}, ${damage}`,
        damage,
        range: w.reach_or_range,
        flavor: w.damage_type,
        properties: w.properties,
      },
    }
  })
}

/**
 * Surfaces an off-hand bonus-action chip when two-weapon-fighting is
 * detected. Two-Weapon Fighting trigger: two `light` melee weapons
 * (5e core rule). We render a chip per detected light-melee weapon
 * BEYOND the first — the first is the primary attack, subsequent
 * lights become the bonus-action option.
 *
 * No magic — just iterates the weapons array; up to module data /
 * compute-character to mark `light` correctly.
 */
export function weaponBonusChips(weapons: WeaponEntry[]): ActionChip[] {
  const lightMelee = weapons.filter(
    (w) => w.type === 'melee' && w.properties.includes('light'),
  )
  if (lightMelee.length < 2) return []

  // First light melee is the primary; remaining ones become bonus-action
  // off-hand chips.
  return lightMelee.slice(1).map((w) => ({
    id: `weapon-bonus:${w.id}`,
    category: 'bonus',
    label: `Off-hand ${w.name.toLowerCase()} (Bonus)`,
    template: `Bonus action: off-hand ${w.name.toLowerCase()} swing — `,
    details: {
      summary: `Two-Weapon Fighting bonus attack with ${w.name}`,
      damage: `${w.damage_dice} ${w.damage_type}`,
      range: w.reach_or_range,
      flavor: w.damage_type,
      properties: w.properties,
    },
  }))
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

/** Cantrips — level 0 spells. Always available; never consume slots. */
export function cantripChips(spells: SpellEntry[]): ActionChip[] {
  return spells
    .filter((s) => s.level === 0)
    .map((s) => ({
      id: `cantrip:${s.id}`,
      category: 'cantrip',
      label: s.name,
      template: `Cast ${s.name} on `,
      details: spellDetails(s),
    }))
}

/**
 * Leveled spells (1+). Returns one chip per spell with `spell_level`
 * set so the picker can fade the chip when the matching slot tier is
 * exhausted. We do NOT filter by slot availability here — the picker
 * applies that gate so it can render exhausted spells with the
 * faded-strikethrough state instead of hiding them.
 */
export function leveledSpellChips(spells: SpellEntry[]): ActionChip[] {
  return spells
    .filter((s) => s.level >= 1)
    .map((s) => ({
      id: `spell:${s.id}`,
      category: 'spell',
      label: s.name,
      template: `Cast ${s.name} on `,
      details: spellDetails(s),
      spell_level: s.level,
    }))
}

function spellDetails(s: SpellEntry): ChipDetails {
  const components = s.components.join(', ')
  const flavor = s.school
    ? s.school.charAt(0).toUpperCase() + s.school.slice(1)
    : undefined
  return {
    summary: s.description.length > 140
      ? `${s.description.slice(0, 137).trimEnd()}…`
      : s.description,
    range: s.range,
    flavor,
    components,
    casting_time: s.casting_time,
    duration: s.duration,
    save: s.save_ability ? `${s.save_ability} save` : undefined,
    description: s.description,
  }
}

// ---------------------------------------------------------------------------
// Class features
// ---------------------------------------------------------------------------

/**
 * Map of feature-id → chip-category override. Some features are bonus
 * actions (Second Wind, Cunning Action) and need to render in Row 3
 * regardless of how the feature is annotated. Default category is
 * `feature` (Row 1 alongside generic actions).
 */
const FEATURE_BONUS_IDS = new Set<string>([
  'second_wind',
  'second-wind',
  'cunning_action',
  'cunning-action',
])

const FEATURE_REACTION_IDS = new Set<string>([
  'shield', // wizard reaction — though typically tracked via spells too
  'uncanny_dodge',
  'uncanny-dodge',
])

export function featureChips(
  features: ClassFeatureEntry[],
  feature_uses: Record<string, { current_uses: number; last_reset: string }>,
): ActionChip[] {
  return features.map((f) => {
    let category: ChipCategory = 'feature'
    if (FEATURE_BONUS_IDS.has(f.id)) category = 'bonus'
    else if (FEATURE_REACTION_IDS.has(f.id)) category = 'reaction'

    const usesRow = feature_uses[f.id]
    const remaining = usesRow?.current_uses
    const max = f.max_uses
    const usesSuffix =
      typeof remaining === 'number' && typeof max === 'number'
        ? ` (${remaining}/${max})`
        : ''

    return {
      id: `feature:${f.id}`,
      category,
      label: `${f.name}${usesSuffix}`,
      template:
        category === 'bonus'
          ? `Bonus action: ${f.name} — `
          : category === 'reaction'
          ? `Reaction: ${f.name} — `
          : `Use ${f.name}: `,
      details: {
        summary: f.description.length > 140
          ? `${f.description.slice(0, 137).trimEnd()}…`
          : f.description,
        description: f.description,
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

/**
 * Universal reactions every PC has access to. Opportunity Attack is
 * always available; Ready'd action is a placeholder for whatever the PC
 * Readied earlier this round (we don't track that surface yet — the
 * chip just inserts a placeholder template the player elaborates).
 */
export function genericReactionChips(): ActionChip[] {
  return [
    {
      id: 'reaction:opportunity-attack',
      category: 'reaction',
      label: 'Opportunity Attack',
      template: 'Reaction: opportunity attack on ',
      details: {
        summary: 'Strike a foe leaving your reach.',
        description:
          'You can make an opportunity attack when a hostile creature that you can see moves out of your reach. To make the opportunity attack, you use your reaction to make one melee attack against the provoking creature. The attack interrupts the provoking creature\'s movement, occurring right before the creature leaves your reach.',
      },
    },
    {
      id: 'reaction:readied',
      category: 'reaction',
      label: 'Readied action…',
      template: 'Reaction: trigger my Readied action — ',
      details: {
        summary: 'Trigger an action you Readied earlier this round.',
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

export function movementChip(
  speed: number,
  movement_used: number,
): ActionChip {
  const remaining = Math.max(0, speed - movement_used)
  return {
    id: 'movement:move',
    category: 'movement',
    label: `Move (${remaining} ft remaining)`,
    template: `Move ${remaining} ft toward `,
    details: {
      summary: `Move up to ${remaining} ft on this turn.`,
    },
  }
}

// ---------------------------------------------------------------------------
// Stack a template onto an existing input value.
// ---------------------------------------------------------------------------

/**
 * Composes the new input string when a chip is clicked. If the input
 * is empty, returns the template directly. If the input has trailing
 * whitespace, trims-then-joins with ". ". If the input ends with `.`,
 * `!`, `?`, or whitespace already, joins with " " or just the
 * separator. The cursor position returned points at the end of the
 * composed string (= ready for elaboration).
 *
 * Multi-action stacking is the spec's example:
 *   "Move 30 ft toward |"   + click Attack →
 *   "Move 30 ft toward Oberon. Attack with shortsword: |"
 *
 * Pure — no DOM access. The component does the actual setSelectionRange.
 */
export function composeInput(
  current: string,
  template: string,
): { next: string; cursorOffset: number } {
  const trimmed = current.replace(/\s+$/, '')
  if (trimmed.length === 0) {
    return { next: template, cursorOffset: template.length }
  }

  // Pick a separator. If user already ended with terminal punctuation,
  // a space is enough; otherwise insert ". ".
  const lastChar = trimmed[trimmed.length - 1]
  const sep = /[.!?]/.test(lastChar) ? ' ' : '. '
  const next = `${trimmed}${sep}${template}`
  return { next, cursorOffset: next.length }
}
