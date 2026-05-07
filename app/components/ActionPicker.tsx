'use client'

// ---------------------------------------------------------------------------
// ActionPicker (POL-25) — host-laptop combat chip rail
// ---------------------------------------------------------------------------
//
// Renders below the host text input during combat. Reads the active PC's
// full sheet (weapons, spells, features) plus the per-PC per-round ledger
// (action/bonus/reaction/movement used) and produces clickable chips
// that prepend a natural-language template into the input. Eliminates
// the playtest "Bear's Grace" misnaming bug — players pick from a list,
// they don't type spell names from memory.
//
// Visibility:
//   - combatActive === false  →  null (hidden entirely; layout shrinks)
//   - activeCharacter === null →  small "NPC turn — wait for narration"
//                                  label (so the layout doesn't jump
//                                  between PC and NPC turns)
//   - otherwise                →  three rows of chips
//
// Chip rows:
//   1. Standard actions  — generic actions + cantrips + weapon attacks
//   2. Spells by level   — header "Level N (slots/max)" + spell chips
//   3. Bonus / reactions / movement
//
// Chip state:
//   - available          → full color, clickable
//   - used (faded)       → 60% opacity, strikethrough, non-clickable
//   - hover (desktop)    → popover with description / range / damage
//
// Hover popover is implemented as a `<div>` with `group-hover:` show. On
// touch, long-press isn't directly representable in CSS — we use the
// same hover hover behaviour and the player can tap-to-toggle via a
// small "i" affordance. Out of scope for this story; the popover is
// best-effort.
//
// Wired from `app/page.tsx` NarrationScreen below the input row.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import {
  genericActionChips,
  genericReactionChips,
  weaponChips,
  weaponBonusChips,
  cantripChips,
  leveledSpellChips,
  featureChips,
  movementChip,
  type ActionChip,
} from '@/lib/picker/action-templates'
import type {
  WeaponEntry,
  SpellEntry,
  ClassFeatureEntry,
  FeatureUseEntry,
} from '@/lib/character/compute-character'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Subset of `ComputedCharacter` the picker actually reads. Lets us pass
 * data from /api/players/[id] without leaking irrelevant character
 * surfaces into this component.
 */
export interface PickerSheet {
  id: string
  character_name: string
  weapons?: WeaponEntry[]
  spells_known?: SpellEntry[]
  class_features?: ClassFeatureEntry[]
  feature_uses?: Record<string, FeatureUseEntry>
  spell_slots?: Record<string, number>
}

export interface CombatTurnLedger {
  action_used: boolean
  bonus_action_used: boolean
  reaction_used: boolean
  movement_used: number
}

export interface ActionPickerProps {
  /**
   * Full sheet for the active PC. Null when no PC is active (NPC turn,
   * combat ended, or initial fetch in progress).
   */
  activeCharacter: PickerSheet | null
  /** Whether combat is currently active. */
  combatActive: boolean
  /** Per-PC per-round ledger for the active PC. Null while loading. */
  ledger: CombatTurnLedger | null
  /**
   * Movement speed in feet. 5e default 30; race-modified speed is not
   * stored on `characters` today — passed in by the parent so the
   * picker doesn't have to know about race data.
   */
  speed?: number
  /**
   * Called when a chip is clicked. The component is otherwise stateless
   * about input value — the parent owns the input string and calls
   * `composeInput` on receipt.
   */
  onPick: (template: string) => void
}

// ---------------------------------------------------------------------------
// Sub-components — chip + popover
// ---------------------------------------------------------------------------

function Chip({
  chip,
  disabled,
  onPick,
}: {
  chip: ActionChip
  disabled: boolean
  onPick: (template: string) => void
}) {
  const baseColors = {
    action: 'border-purple-700/60 hover:border-purple-500 text-purple-200 hover:bg-purple-900/30',
    bonus: 'border-amber-700/60 hover:border-amber-500 text-amber-200 hover:bg-amber-900/30',
    reaction: 'border-rose-700/60 hover:border-rose-500 text-rose-200 hover:bg-rose-900/30',
    movement: 'border-emerald-700/60 hover:border-emerald-500 text-emerald-200 hover:bg-emerald-900/30',
    spell: 'border-indigo-700/60 hover:border-indigo-500 text-indigo-200 hover:bg-indigo-900/30',
    cantrip: 'border-indigo-800/60 hover:border-indigo-500 text-indigo-300 hover:bg-indigo-900/30',
    feature: 'border-purple-700/60 hover:border-purple-500 text-purple-200 hover:bg-purple-900/30',
  }[chip.category]

  const stateClass = disabled
    ? 'opacity-60 line-through cursor-not-allowed pointer-events-none'
    : 'cursor-pointer'

  return (
    <span className="relative group inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick(chip.template)}
        className={[
          'text-xs px-2.5 py-1 rounded-full border bg-gray-900/70 transition-colors',
          baseColors,
          stateClass,
        ].join(' ')}
      >
        {chip.label}
      </button>
      {chip.details && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 max-w-xs hidden group-hover:block z-30 p-2.5 rounded-md bg-gray-950 border border-gray-700 shadow-lg text-[11px] text-gray-200 leading-snug whitespace-normal text-left"
        >
          {chip.details.summary && (
            <p className="font-semibold text-gray-100 mb-1">{chip.details.summary}</p>
          )}
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-gray-400">
            {chip.details.damage && (
              <>
                <span>Damage</span>
                <span className="text-gray-200">{chip.details.damage}</span>
              </>
            )}
            {chip.details.range && (
              <>
                <span>Range</span>
                <span className="text-gray-200">{chip.details.range}</span>
              </>
            )}
            {chip.details.casting_time && (
              <>
                <span>Cast time</span>
                <span className="text-gray-200">{chip.details.casting_time}</span>
              </>
            )}
            {chip.details.duration && (
              <>
                <span>Duration</span>
                <span className="text-gray-200">{chip.details.duration}</span>
              </>
            )}
            {chip.details.components && (
              <>
                <span>Components</span>
                <span className="text-gray-200">{chip.details.components}</span>
              </>
            )}
            {chip.details.save && (
              <>
                <span>Save</span>
                <span className="text-gray-200">{chip.details.save}</span>
              </>
            )}
            {chip.details.flavor && (
              <>
                <span>Type</span>
                <span className="text-gray-200">{chip.details.flavor}</span>
              </>
            )}
            {chip.details.properties && chip.details.properties.length > 0 && (
              <>
                <span>Props</span>
                <span className="text-gray-200">{chip.details.properties.join(', ')}</span>
              </>
            )}
          </div>
        </div>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determines if a chip should be rendered as `disabled` (faded /
 * strikethrough). Encapsulates the per-category gating logic so it's
 * easy to inspect in one place.
 */
function isChipUsed(
  chip: ActionChip,
  ledger: CombatTurnLedger,
  spellSlots: Record<string, number>,
  movementSpeed: number,
): boolean {
  switch (chip.category) {
    case 'action':
      return ledger.action_used
    case 'cantrip':
      // Cantrips ARE actions (most are 1 action), so they share the
      // action-used gate. They never consume slots.
      return ledger.action_used
    case 'spell': {
      // Spells are gated by BOTH the action gate AND the slot count
      // for their level. If either is exhausted, the chip is faded.
      if (ledger.action_used) return true
      const level = chip.spell_level
      if (typeof level !== 'number') return false
      const remaining = spellSlots[String(level)] ?? 0
      return remaining <= 0
    }
    case 'bonus':
      return ledger.bonus_action_used
    case 'reaction':
      return ledger.reaction_used
    case 'movement':
      return ledger.movement_used >= movementSpeed
    case 'feature':
      // Most features consume an action; for now we gate features the
      // same way unless their template explicitly identifies bonus or
      // reaction (the templates module already does this remap).
      return ledger.action_used
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActionPicker({
  activeCharacter,
  combatActive,
  ledger,
  speed = 30,
  onPick,
}: ActionPickerProps) {
  // Hidden entirely when not in combat — the picker doesn't apply outside
  // initiative.
  if (!combatActive) return null

  // NPC turn or no PC active — show a placeholder so the layout doesn't
  // jump between the chip rail and a smaller input area.
  if (!activeCharacter) {
    return (
      <div className="text-xs text-gray-500 italic px-1 py-2">
        NPC turn — wait for narration
      </div>
    )
  }

  // Ledger may be null while we're fetching it. Default to "nothing used"
  // so the player can still preview the chips while the network round-trip
  // resolves; the chip click triggers a re-fetch on the next turn anyway.
  const safeLedger: CombatTurnLedger = ledger ?? {
    action_used: false,
    bonus_action_used: false,
    reaction_used: false,
    movement_used: 0,
  }

  const weapons = activeCharacter.weapons ?? []
  const spellsKnown = activeCharacter.spells_known ?? []
  const features = activeCharacter.class_features ?? []
  const featureUsesObj = activeCharacter.feature_uses ?? {}
  const spellSlots = activeCharacter.spell_slots ?? {}

  // Row 1: standard actions = generic + weapons + cantrips + non-bonus features
  const generic = genericActionChips()
  const weaponRow = weaponChips(weapons)
  const cantrips = cantripChips(spellsKnown)
  const allFeatures = featureChips(features, featureUsesObj)
  const featuresRow1 = allFeatures.filter((f) => f.category === 'feature')
  const row1: ActionChip[] = [...weaponRow, ...cantrips, ...featuresRow1, ...generic]

  // Row 2: leveled spells, grouped by level
  const leveled = leveledSpellChips(spellsKnown)
  const spellsByLevel = new Map<number, ActionChip[]>()
  for (const chip of leveled) {
    const lvl = chip.spell_level ?? 1
    if (!spellsByLevel.has(lvl)) spellsByLevel.set(lvl, [])
    spellsByLevel.get(lvl)!.push(chip)
  }
  const sortedLevels = [...spellsByLevel.keys()].sort((a, b) => a - b)

  // Row 3: bonus + reactions + movement
  const featuresBonus = allFeatures.filter((f) => f.category === 'bonus')
  const featuresReaction = allFeatures.filter((f) => f.category === 'reaction')
  const row3: ActionChip[] = [
    ...weaponBonusChips(weapons),
    ...featuresBonus,
    ...genericReactionChips(),
    ...featuresReaction,
    movementChip(speed, safeLedger.movement_used),
  ]

  return (
    <div className="space-y-2 px-1 pb-1">
      {/* Row 1 — Standard actions */}
      {row1.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-500 mr-1">
            Actions
          </span>
          {row1.map((chip) => (
            <Chip
              key={chip.id}
              chip={chip}
              disabled={isChipUsed(chip, safeLedger, spellSlots, speed)}
              onPick={onPick}
            />
          ))}
        </div>
      )}

      {/* Row 2 — Spells by level (caster only) */}
      {sortedLevels.length > 0 &&
        sortedLevels.map((lvl) => {
          const chipsAtLevel = spellsByLevel.get(lvl) ?? []
          const remaining = spellSlots[String(lvl)] ?? 0
          // We don't have spell_slots_max separately; the cleanest
          // surface is "(N slots)" with a hyphen when 0. Future work:
          // surface spell_slots_max from the sheet and render "(R/M)".
          return (
            <div key={lvl} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-gray-500 mr-1">
                Level {lvl}{' '}
                <span
                  className={
                    remaining > 0 ? 'text-indigo-400' : 'text-gray-600'
                  }
                >
                  ({remaining} {remaining === 1 ? 'slot' : 'slots'})
                </span>
              </span>
              {chipsAtLevel.map((chip) => (
                <Chip
                  key={chip.id}
                  chip={chip}
                  disabled={isChipUsed(chip, safeLedger, spellSlots, speed)}
                  onPick={onPick}
                />
              ))}
            </div>
          )
        })}

      {/* Row 3 — Bonus / reactions / movement */}
      {row3.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-500 mr-1">
            Bonus / Reaction
          </span>
          {row3.map((chip) => (
            <Chip
              key={chip.id}
              chip={chip}
              disabled={isChipUsed(chip, safeLedger, spellSlots, speed)}
              onPick={onPick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hook — fetch the ledger row for the active PC + round
// ---------------------------------------------------------------------------

/**
 * Convenience hook the host uses to keep the picker's ledger in sync.
 * Re-fetches whenever sessionId/characterId/round change AND on a 4-second
 * interval (matches the existing host polling cadence). Returns
 * `{ ledger, refresh }`. The host calls `refresh()` after a successful
 * AI turn so the chips immediately reflect new action/bonus/movement
 * usage without waiting on the polling tick.
 */
export function useCombatTurnLedger(
  sessionId: string | null,
  characterId: string | null,
  round: number | null,
): {
  ledger: CombatTurnLedger | null
  refresh: () => void
} {
  const [ledger, setLedger] = useState<CombatTurnLedger | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!sessionId || !characterId || !round) {
      // Reset is intentional — the picker rail must clear immediately
      // when the active PC changes mid-render so we don't flash stale
      // chips from the previous PC's ledger.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLedger(null)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/combat-turn?character_id=${characterId}&round=${round}`,
        )
        if (!res.ok) return
        const data = (await res.json()) as CombatTurnLedger
        if (!cancelled) setLedger(data)
      } catch {
        // silent — polling will retry
      }
    }
    load()
    const interval = setInterval(load, 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [sessionId, characterId, round, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  return { ledger, refresh }
}

// ---------------------------------------------------------------------------
// Hook — fetch the active PC's full sheet
// ---------------------------------------------------------------------------

/**
 * Loads the full Cluster A sheet (weapons, spells, features, slots) for
 * the active PC. Re-fetches whenever the active character changes; we
 * also re-fetch on a slow poll so spell-slot decrements / feature-use
 * decrements show up without waiting for a manual refresh.
 *
 * Returns null while loading and on error.
 */
export function useActiveCharacterSheet(
  characterId: string | null,
): PickerSheet | null {
  const [sheet, setSheet] = useState<PickerSheet | null>(null)

  useEffect(() => {
    if (!characterId) {
      // Reset is intentional — same reasoning as the ledger hook above:
      // when the active PC changes we don't want the picker to flash
      // the previous PC's weapons/spells before the new fetch resolves.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSheet(null)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/players/${characterId}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setSheet({
          id: data.id,
          character_name: data.character_name,
          weapons: data.weapons ?? [],
          spells_known: data.spells_known ?? [],
          class_features: data.class_features ?? [],
          feature_uses: data.feature_uses ?? {},
          spell_slots: data.spell_slots ?? {},
        })
      } catch {
        // silent — will retry on next interval
      }
    }
    load()
    const interval = setInterval(load, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [characterId])

  return sheet
}
