'use client'

// ---------------------------------------------------------------------------
// WeaponsSection — POL-23c §C.
//
// Renders `characters.weapons` as one row per weapon. Tap-to-expand reveals
// the full property list, range, and weapon type.
//
// Display-only — there is no tap-to-attack action. Per the brief, that's
// POL-25 territory; this card stays informational. If `characters.weapons`
// is empty, the parent should not render this component.
// ---------------------------------------------------------------------------

import { useState } from 'react'

export interface WeaponEntry {
  id: string
  name: string
  type: 'melee' | 'ranged' | 'thrown'
  attack_bonus: number
  damage_dice: string
  damage_type: string
  properties: string[]
  reach_or_range: string
}

interface Props {
  weapons: WeaponEntry[]
}

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

export default function WeaponsSection({ weapons }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (!weapons || weapons.length === 0) return null

  return (
    <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
        Weapons
      </p>
      <div className="space-y-1.5">
        {weapons.map((w) => {
          const isOpen = openId === w.id
          // Truncated property summary for the collapsed row.
          const propSummary =
            w.properties && w.properties.length > 0
              ? w.properties.slice(0, 2).join(', ') +
                (w.properties.length > 2 ? '…' : '')
              : ''
          return (
            <div
              key={w.id}
              className="rounded-xl bg-gray-800 border border-gray-700"
            >
              <button
                onClick={() => setOpenId(isOpen ? null : w.id)}
                className="w-full px-3 py-2.5 text-left"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-100 truncate">
                    {w.name}
                  </span>
                  <span className="text-gray-600 text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-0.5">
                  <span className="font-mono text-purple-300">
                    {fmtSigned(w.attack_bonus)} to hit
                  </span>
                  <span className="font-mono">
                    {w.damage_dice}{' '}
                    <span className="text-gray-500">{w.damage_type}</span>
                  </span>
                  {propSummary && (
                    <span className="text-gray-500 italic">{propSummary}</span>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 border-t border-gray-700 pt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Type</span>
                    <span className="text-gray-300 capitalize">{w.type}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Reach / Range</span>
                    <span className="text-gray-300">{w.reach_or_range}</span>
                  </div>
                  {w.properties && w.properties.length > 0 && (
                    <div className="flex justify-between text-xs gap-2">
                      <span className="text-gray-500 flex-shrink-0">Properties</span>
                      <span className="text-gray-300 text-right">
                        {w.properties.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
