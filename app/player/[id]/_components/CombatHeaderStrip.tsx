'use client'

// ---------------------------------------------------------------------------
// CombatHeaderStrip — POL-23c §A.
//
// Single-row glanceable strip at the top of the mobile sheet showing
// AC / HP (current/max) / Speed / Initiative bonus / Proficiency bonus.
//
// Each cell is tap-to-expand for a tiny breakdown. There's no rich source
// for "10 base + 2 DEX + 1 from amulet" today (we don't track AC components
// individually); the expanded popover degrades gracefully to the raw value
// plus what's derivable (initiative = DEX mod, prof bonus from level).
//
// All numeric inputs are read straight off `characters` row + race row.
// No client-side derivation of anything that already lives on the row.
// ---------------------------------------------------------------------------

import { useState } from 'react'

interface Props {
  ac: number
  hp: number
  maxHp: number
  speed: number
  initiativeBonus: number
  profBonus: number
  /** Optional per-cell breakdown text. Falls back to "—" when not provided. */
  acBreakdown?: string | null
  speedNote?: string | null
}

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function hpToneClass(hp: number, max: number): string {
  if (max === 0) return 'text-gray-400'
  const pct = hp / max
  if (pct > 0.5) return 'text-green-300'
  if (pct > 0.25) return 'text-yellow-300'
  return 'text-red-400'
}

interface CellProps {
  label: string
  value: string
  tone?: string
  detail?: string | null
}

function StripCell({ label, value, tone, detail }: CellProps) {
  const [open, setOpen] = useState(false)
  const toneClass = tone ?? 'text-gray-100'
  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className="flex-1 min-w-0 flex flex-col items-center px-1.5 py-2 rounded-lg hover:bg-gray-800 transition-colors"
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <span className={`text-lg font-bold tabular-nums leading-tight ${toneClass}`}>
        {value}
      </span>
      {open && detail ? (
        <span className="text-[10px] text-gray-500 mt-1 leading-snug text-center">
          {detail}
        </span>
      ) : null}
    </button>
  )
}

export default function CombatHeaderStrip({
  ac,
  hp,
  maxHp,
  speed,
  initiativeBonus,
  profBonus,
  acBreakdown,
  speedNote,
}: Props) {
  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800 px-1 py-1">
      <div className="flex items-stretch divide-x divide-gray-800">
        <StripCell
          label="AC"
          value={String(ac)}
          tone="text-purple-300"
          detail={acBreakdown ?? null}
        />
        <StripCell
          label="HP"
          value={`${hp}/${maxHp}`}
          tone={hpToneClass(hp, maxHp)}
          detail={null}
        />
        <StripCell
          label="Speed"
          value={`${speed}ft`}
          tone="text-gray-200"
          detail={speedNote ?? null}
        />
        <StripCell
          label="Init"
          value={fmtSigned(initiativeBonus)}
          tone="text-gray-200"
          detail="DEX modifier"
        />
        <StripCell
          label="Prof"
          value={fmtSigned(profBonus)}
          tone="text-gray-200"
          detail="By level"
        />
      </div>
    </section>
  )
}
