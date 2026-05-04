'use client'

// ---------------------------------------------------------------------------
// SavesSection — POL-23c §B.
//
// Collapsible "Saving Throws" card. Folded by default to keep the screen
// compact. Reads `characters.saving_throws` + the class proficiency list.
// Filled dot = proficient; hollow dot = not proficient.
// ---------------------------------------------------------------------------

import { useState } from 'react'

const SAVE_LABELS: { key: string; label: string }[] = [
  { key: 'str', label: 'Strength' },
  { key: 'dex', label: 'Dexterity' },
  { key: 'con', label: 'Constitution' },
  { key: 'int', label: 'Intelligence' },
  { key: 'wis', label: 'Wisdom' },
  { key: 'cha', label: 'Charisma' },
]

interface Props {
  savingThrows: Record<string, number>
  proficientSaves: string[]
  /** Initial expanded state. Defaults to false (folded). */
  defaultOpen?: boolean
}

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

export default function SavesSection({
  savingThrows,
  proficientSaves,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Saving Throws
        </span>
        <span className="text-gray-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2">
          {SAVE_LABELS.map(({ key, label }) => {
            const isProficient = proficientSaves.includes(key)
            const value = savingThrows[key] ?? 0
            return (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      isProficient
                        ? 'bg-purple-400'
                        : 'bg-gray-700 border border-gray-600'
                    }`}
                    aria-label={isProficient ? 'Proficient' : 'Not proficient'}
                  />
                  <span
                    className={`text-sm ${
                      isProficient ? 'text-purple-300' : 'text-gray-300'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                <span
                  className={`text-sm font-mono font-semibold ${
                    isProficient ? 'text-purple-300' : 'text-gray-400'
                  }`}
                >
                  {fmtSigned(value)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
