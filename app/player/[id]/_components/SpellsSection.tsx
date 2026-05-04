'use client'

// ---------------------------------------------------------------------------
// SpellsSection — POL-23c §D.
//
// Three sub-sections in one card-stack:
//   1. Spellcasting summary header — DC / attack bonus / casting ability.
//   2. Spell slot dot pips per level (filled = available, hollow = used).
//      When a slot is spent (slot count drops on Realtime delta), the
//      rightmost filled pip animates filled → empty over ~600ms.
//   3. Spell list grouped by level (cantrips first). Each row collapses by
//      default; tap to expand the full description.
//
// Renders nothing when `spells_known` is empty. Parent handles the
// "non-caster" case by not passing the data here.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'

export interface SpellEntry {
  id: string
  name: string
  level: number
  school?: string
  casting_time: string
  range: string
  components: string[]
  duration: string
  description: string
  save_ability?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'
  concentration?: boolean
  ritual?: boolean
}

interface Props {
  spellsKnown: SpellEntry[]
  /** Map of level → remaining slots. Cantrips (level 0) are not in this map. */
  spellSlots: Record<string, number>
  /** Map of level → max slots, derived from class/level by parent. */
  spellSlotsMax: Record<string, number>
  spellSaveDc: number | null
  spellAttackBonus: number | null
  spellcastingAbility: 'INT' | 'WIS' | 'CHA' | null
}

const ABILITY_LABEL: Record<string, string> = {
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
}

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function levelLabel(level: number): string {
  if (level === 0) return 'Cantrips'
  return `Level ${level}`
}

// ---------------------------------------------------------------------------
// SlotPipRow — animates the rightmost filled pip → empty when count drops.
// Tracks the previous count in a ref; if `remaining` decreased since last
// render, applies a `slot-spent` class on the pip whose index is between
// the new remaining and the old remaining (exclusive on the new side).
// CSS keyframe lives at the bottom of this file (inline <style>).
// ---------------------------------------------------------------------------

interface PipRowProps {
  level: number
  remaining: number
  max: number
}

function SlotPipRow({ level, remaining, max }: PipRowProps) {
  const prev = useRef<number>(remaining)
  const [animatingIndex, setAnimatingIndex] = useState<number | null>(null)

  useEffect(() => {
    if (remaining < prev.current && remaining >= 0) {
      // The pip that was at `prev.current - 1` (rightmost filled) just got spent.
      setAnimatingIndex(prev.current - 1)
      const t = window.setTimeout(() => setAnimatingIndex(null), 650)
      prev.current = remaining
      return () => window.clearTimeout(t)
    }
    prev.current = remaining
  }, [remaining])

  const pips: { filled: boolean; animating: boolean }[] = []
  for (let i = 0; i < max; i++) {
    const filled = i < remaining
    const animating = i === animatingIndex
    pips.push({ filled, animating })
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-300 w-16 flex-shrink-0">Level {level}</span>
      <div className="flex gap-1.5">
        {pips.map((pip, i) => (
          <span
            key={i}
            aria-label={pip.filled ? 'Available slot' : 'Spent slot'}
            className={[
              'w-5 h-5 rounded-full inline-block border transition-colors',
              pip.filled
                ? 'bg-violet-500 border-violet-400'
                : 'bg-gray-800 border-gray-600',
              pip.animating ? 'slot-spent-pulse' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
      </div>
      <span className="text-xs text-gray-500 ml-auto">
        {remaining}/{max}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single spell row — collapsed by default; tap to expand description.
// ---------------------------------------------------------------------------

function SpellRow({ spell }: { spell: SpellEntry }) {
  const [open, setOpen] = useState(false)

  // Compact one-line summary for the collapsed view.
  const meta: string[] = []
  if (spell.save_ability) meta.push(`${spell.save_ability} save`)
  if (spell.concentration) meta.push('concentration')
  if (spell.ritual) meta.push('ritual')

  return (
    <div className="rounded-xl bg-gray-800 border border-gray-700">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 text-left"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-violet-200 truncate">
            {spell.name}
          </span>
          <span className="text-gray-600 text-xs flex-shrink-0">
            {open ? '▲' : '▼'}
          </span>
        </div>
        {meta.length > 0 && (
          <p className="text-[11px] text-gray-500 italic mt-0.5">{meta.join(' · ')}</p>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-gray-700 pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <SpellMeta label="Casting" value={spell.casting_time} />
            <SpellMeta label="Range" value={spell.range} />
            <SpellMeta label="Duration" value={spell.duration} />
            <SpellMeta
              label="Components"
              value={spell.components.join(', ')}
            />
            {spell.school && <SpellMeta label="School" value={spell.school} />}
          </div>
          <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
            {spell.description}
          </p>
        </div>
      )}
    </div>
  )
}

function SpellMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-gray-500 uppercase tracking-wider text-[9px]">
        {label}
      </span>
      <span className="text-gray-300">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export default function SpellsSection(props: Props) {
  const {
    spellsKnown,
    spellSlots,
    spellSlotsMax,
    spellSaveDc,
    spellAttackBonus,
    spellcastingAbility,
  } = props

  if (!spellsKnown || spellsKnown.length === 0) return null

  // Group spells by level. Cantrips first, then ascending level.
  const byLevel = new Map<number, SpellEntry[]>()
  for (const spell of spellsKnown) {
    const arr = byLevel.get(spell.level) ?? []
    arr.push(spell)
    byLevel.set(spell.level, arr)
  }
  const levelKeys = Array.from(byLevel.keys()).sort((a, b) => a - b)

  // Sort within each level alphabetically for stable scanning.
  for (const arr of byLevel.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name))
  }

  // Slot pip rows — every spell level the character has a max for.
  const slotLevels = Object.keys(spellSlotsMax)
    .map((k) => Number(k))
    .filter((n) => spellSlotsMax[String(n)] > 0)
    .sort((a, b) => a - b)

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-violet-400">
        Spells
      </h2>

      {/* Inline keyframe — keeps the slot-spent pulse self-contained.
          Match the romance chip animation: fade colour + brief scale. */}
      <style>{`
        @keyframes slotSpentPulse {
          0%   { background-color: rgb(139 92 246); transform: scale(1); }
          40%  { background-color: rgb(244 114 182); transform: scale(1.25); }
          100% { background-color: rgb(31 41 55); transform: scale(1); }
        }
        .slot-spent-pulse {
          animation: slotSpentPulse 600ms ease-out forwards;
        }
      `}</style>

      {/* 1. Spellcasting summary header */}
      <div className="bg-gray-900 rounded-2xl p-3 border border-violet-900/60">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400 mb-1">
          Spellcasting
        </p>
        <div className="flex items-baseline gap-3 flex-wrap text-sm">
          {spellSaveDc !== null && (
            <span>
              <span className="text-gray-500 text-xs">DC </span>
              <span className="font-bold text-violet-200">{spellSaveDc}</span>
            </span>
          )}
          {spellAttackBonus !== null && (
            <span>
              <span className="text-gray-500 text-xs">Attack </span>
              <span className="font-bold text-violet-200 font-mono">
                {fmtSigned(spellAttackBonus)}
              </span>
            </span>
          )}
          {spellcastingAbility && (
            <span className="text-gray-400">
              {ABILITY_LABEL[spellcastingAbility] ?? spellcastingAbility}
            </span>
          )}
        </div>
      </div>

      {/* 2. Spell slot dot pips per level */}
      {slotLevels.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Spell Slots
          </p>
          {slotLevels.map((level) => {
            const max = spellSlotsMax[String(level)] ?? 0
            const remaining = Math.min(max, Math.max(0, spellSlots[String(level)] ?? 0))
            return (
              <SlotPipRow
                key={level}
                level={level}
                remaining={remaining}
                max={max}
              />
            )
          })}
        </div>
      )}

      {/* 3. Spell list grouped by level */}
      <div className="space-y-3">
        {levelKeys.map((lvl) => (
          <div
            key={lvl}
            className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">
              {levelLabel(lvl)}
            </p>
            <div className="space-y-1.5">
              {byLevel.get(lvl)!.map((spell) => (
                <SpellRow key={spell.id} spell={spell} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
