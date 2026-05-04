'use client'

// ---------------------------------------------------------------------------
// SkillsSection — POL-23c §B.
//
// Collapsible "Skills" card. Folded by default. Renders all 18 5e skills
// with their final modifier. Proficiency dot pattern matches saves.
// Tap a skill row → small inline popover showing the math breakdown.
//
// Expertise (double proficiency) renders as a doubled dot. Today no class
// in the system grants expertise, but the double-dot path is wired so when
// rogues get expertise it lights up automatically.
// ---------------------------------------------------------------------------

import { useState } from 'react'

const SKILL_ABILITY_MAP: Record<string, string> = {
  Acrobatics: 'dex',
  'Animal Handling': 'wis',
  Arcana: 'int',
  Athletics: 'str',
  Deception: 'cha',
  History: 'int',
  Insight: 'wis',
  Intimidation: 'cha',
  Investigation: 'int',
  Medicine: 'wis',
  Nature: 'int',
  Perception: 'wis',
  Performance: 'cha',
  Persuasion: 'cha',
  Religion: 'int',
  'Sleight of Hand': 'dex',
  Stealth: 'dex',
  Survival: 'wis',
}

interface Props {
  skills: Record<string, number>
  /** Skill names where the character is proficient (single proficiency). */
  proficientSkills: string[]
  /** Skill names where the character has expertise (double proficiency). */
  expertSkills?: string[]
  /** Stat block, used to compute the math breakdown for the popover. */
  stats: Record<string, number>
  /** Proficiency bonus, used for the math breakdown. */
  profBonus: number
  defaultOpen?: boolean
}

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

export default function SkillsSection({
  skills,
  proficientSkills,
  expertSkills = [],
  stats,
  profBonus,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [openSkill, setOpenSkill] = useState<string | null>(null)

  const proficientSet = new Set(proficientSkills)
  const expertSet = new Set(expertSkills)

  const sortedSkills = Object.entries(skills).sort(([a], [b]) => a.localeCompare(b))

  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Skills
        </span>
        <span className="text-gray-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-1.5">
          {sortedSkills.map(([skill, value]) => {
            const isExpert = expertSet.has(skill)
            const isProficient = isExpert || proficientSet.has(skill)
            const ability = SKILL_ABILITY_MAP[skill] ?? 'dex'
            const score = stats[ability] ?? 10
            const mod = abilityMod(score)
            const profPart = isExpert ? profBonus * 2 : isProficient ? profBonus : 0
            const isOpen = openSkill === skill
            return (
              <div key={skill}>
                <button
                  onClick={() => setOpenSkill(isOpen ? null : skill)}
                  className="w-full flex items-center justify-between py-1 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpert ? (
                      <span className="flex flex-shrink-0">
                        <span className="w-3 h-3 rounded-full bg-purple-400" />
                        <span className="w-3 h-3 rounded-full bg-purple-400 -ml-1.5 border border-gray-900" />
                      </span>
                    ) : (
                      <span
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${
                          isProficient
                            ? 'bg-purple-400'
                            : 'bg-gray-700 border border-gray-600'
                        }`}
                      />
                    )}
                    <span
                      className={`text-sm ${
                        isProficient ? 'text-purple-300 font-medium' : 'text-gray-300'
                      } truncate`}
                    >
                      {skill}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-gray-600 flex-shrink-0">
                      ({ability})
                    </span>
                  </div>
                  <span
                    className={`text-sm font-mono font-semibold ${
                      isProficient ? 'text-purple-300' : 'text-gray-400'
                    }`}
                  >
                    {fmtSigned(value)}
                  </span>
                </button>
                {isOpen && (
                  <p className="text-[11px] text-gray-500 leading-relaxed pl-5 pb-1">
                    {fmtSigned(mod)} {ability.toUpperCase()} mod
                    {profPart > 0 ? ` ${fmtSigned(profPart)} ${isExpert ? 'expertise' : 'proficiency'}` : ''}
                    {' = '}
                    {fmtSigned(value)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
