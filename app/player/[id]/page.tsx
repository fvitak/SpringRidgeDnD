'use client'

// ---------------------------------------------------------------------------
// Mobile character sheet — /player/[id]
//
// ENVIRONMENT VARIABLE REQUIRED:
//   NEXT_PUBLIC_SUPABASE_ANON_KEY — your Supabase project's public anon key.
//   Add it to .env.local AND to Vercel environment variables.
//   Find it in: Supabase Dashboard → Project Settings → API → anon (public).
//   It is safe to expose this key client-side; RLS policies control data access.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InventoryItem {
  name: string
  quantity: number
}

interface Character {
  id: string
  character_name: string
  player_name: string
  class: string
  race: string
  level: number
  xp: number
  hp: number
  max_hp: number
  ac: number
  stats: Record<string, number>
  saving_throws: Record<string, number>
  skills: Record<string, number>
  inventory: InventoryItem[]
  spell_slots: Record<string, number>
  conditions: string[]
  drinks_consumed: number
  personality_traits: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ABILITY_LABELS: { key: string; label: string }[] = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
]

const SAVING_THROW_LABELS: { key: string; label: string }[] = [
  { key: 'str', label: 'Strength' },
  { key: 'dex', label: 'Dexterity' },
  { key: 'con', label: 'Constitution' },
  { key: 'int', label: 'Intelligence' },
  { key: 'wis', label: 'Wisdom' },
  { key: 'cha', label: 'Charisma' },
]

// Which saving throws are proficient per class (matching compute-character.ts)
const CLASS_SAVING_THROWS: Record<string, string[]> = {
  fighter: ['str', 'con'],
  cleric: ['wis', 'cha'],
  rogue: ['dex', 'int'],
  wizard: ['int', 'wis'],
}

const SPELLCASTER_CLASSES = ['wizard', 'cleric']

function formatMod(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function signedNum(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function hpColorClass(hp: number, maxHp: number): string {
  if (maxHp === 0) return 'bg-gray-500'
  const pct = hp / maxHp
  if (pct > 0.5) return 'bg-green-500'
  if (pct > 0.25) return 'bg-yellow-400'
  return 'bg-red-500'
}

function hpTextColorClass(hp: number, maxHp: number): string {
  if (maxHp === 0) return 'text-gray-400'
  const pct = hp / maxHp
  if (pct > 0.5) return 'text-green-400'
  if (pct > 0.25) return 'text-yellow-300'
  return 'text-red-400'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---------------------------------------------------------------------------
// Supabase client (anon key — safe for client-side Realtime)
// ---------------------------------------------------------------------------

function getRealtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return null
  }
  return createClient(url, anonKey)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [character, setCharacter] = useState<Character | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Unwrap params (Next 15 async params)
  useEffect(() => {
    params.then(({ id }) => setCharacterId(id))
  }, [params])

  // Fetch initial data from server-side API route
  useEffect(() => {
    if (!characterId) return

    setLoading(true)
    fetch(`/api/players/${characterId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Character>
      })
      .then((data) => {
        setCharacter(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(`Failed to load character: ${msg}`)
        setLoading(false)
      })
  }, [characterId])

  // Realtime subscription — updates HP, conditions, inventory, etc. live
  useEffect(() => {
    if (!characterId) return

    const supabase = getRealtimeClient()
    if (!supabase) {
      console.warn(
        'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — live updates disabled. ' +
          'Add it to .env.local to enable Realtime.'
      )
      return
    }

    const channel = supabase
      .channel('character-' + characterId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `id=eq.${characterId}`,
        },
        (payload) => {
          setCharacter(payload.new as Character)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [characterId])

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-amber-400 text-lg animate-pulse">Loading character...</p>
      </div>
    )
  }

  if (error || !character) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <p className="text-red-400 text-center text-base">{error ?? 'Character not found.'}</p>
      </div>
    )
  }

  const hpPct = character.max_hp > 0 ? Math.max(0, (character.hp / character.max_hp) * 100) : 0
  const isSpellcaster = SPELLCASTER_CLASSES.includes(character.class)
  const proficientSaves = CLASS_SAVING_THROWS[character.class] ?? []

  // Sort skills alphabetically; proficient ones highlighted
  const sortedSkills = Object.entries(character.skills).sort(([a], [b]) => a.localeCompare(b))

  // Proficient skills: saving throw bonus > ability mod means proficiency was added
  // We re-derive proficiency by checking class skills stored in CLASS_SKILLS
  // (same logic as compute-character: proficient if class grants +2 on top of ability mod)
  const CLASS_SKILLS: Record<string, string[]> = {
    fighter: ['Athletics', 'Intimidation'],
    cleric: ['Medicine', 'Religion'],
    rogue: ['Acrobatics', 'Deception', 'Insight', 'Stealth'],
    wizard: ['Arcana', 'History'],
  }
  const proficientSkillSet = new Set(CLASS_SKILLS[character.class] ?? [])

  // Spell slots: { "1": totalSlots } — we don't track "used" vs "remaining" yet,
  // so we show them all as filled pips until the DM updates the value.
  const spellSlotEntries = Object.entries(character.spell_slots).sort(
    ([a], [b]) => Number(a) - Number(b)
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-12">
      {/* ------------------------------------------------------------------ */}
      {/* 1. Header bar                                                        */}
      {/* ------------------------------------------------------------------ */}
      <header className="bg-gray-900 border-b border-amber-900/50 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-amber-400 truncate leading-tight">
              {character.character_name}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {capitalize(character.race)} {capitalize(character.class)}
              {character.player_name ? ` · ${character.player_name}` : ''}
            </p>
          </div>
          <div className="flex-shrink-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-700 text-amber-100 font-bold text-sm border-2 border-amber-500">
              Lv{character.level}
            </span>
          </div>
        </div>
      </header>

      <div className="px-4 space-y-5 mt-5">
        {/* ---------------------------------------------------------------- */}
        {/* 2. HP section                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
            Hit Points
          </p>
          <p className={`text-5xl font-bold tabular-nums ${hpTextColorClass(character.hp, character.max_hp)}`}>
            {character.hp}
            <span className="text-2xl text-gray-500 font-normal"> / {character.max_hp}</span>
          </p>
          <div className="mt-3 h-3 rounded-full bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${hpColorClass(character.hp, character.max_hp)}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 3. Core stats row (3×2 grid)                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Ability Scores
          </p>
          <div className="grid grid-cols-3 gap-2">
            {ABILITY_LABELS.map(({ key, label }) => {
              const score = character.stats[key] ?? 10
              return (
                <div
                  key={key}
                  className="flex flex-col items-center bg-gray-800 rounded-xl py-3 px-1"
                >
                  <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                    {label}
                  </span>
                  <span className="text-2xl font-bold text-white mt-1">{score}</span>
                  <span className="text-sm text-gray-400">{formatMod(score)}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 4. AC badge                                                        */}
        {/* ---------------------------------------------------------------- */}
        <section className="flex justify-center">
          <div className="flex flex-col items-center bg-gray-900 border-2 border-amber-600 rounded-2xl px-8 py-4">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-500">
              Armor Class
            </span>
            <span className="text-5xl font-extrabold text-amber-300 mt-1">{character.ac}</span>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 5. Conditions                                                      */}
        {/* ---------------------------------------------------------------- */}
        {character.conditions && character.conditions.length > 0 && (
          <section className="bg-gray-900 rounded-2xl p-4 border border-red-900/60">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-2">
              Conditions
            </p>
            <div className="flex flex-wrap gap-2">
              {character.conditions.map((cond) => (
                <span
                  key={cond}
                  className="px-3 py-1 rounded-full bg-red-900/60 border border-red-700 text-red-200 text-sm font-medium"
                >
                  {cond}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* 6. Saving throws                                                   */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Saving Throws
          </p>
          <div className="space-y-2">
            {SAVING_THROW_LABELS.map(({ key, label }) => {
              const isProficient = proficientSaves.includes(key)
              const value = character.saving_throws[key] ?? 0
              return (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        isProficient ? 'bg-amber-400' : 'bg-gray-700 border border-gray-600'
                      }`}
                    />
                    <span className={`text-sm ${isProficient ? 'text-amber-300' : 'text-gray-300'}`}>
                      {label}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-mono font-semibold ${
                      isProficient ? 'text-amber-300' : 'text-gray-400'
                    }`}
                  >
                    {signedNum(value)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 7. Skills                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Skills
          </p>
          <div className="max-h-64 overflow-y-auto overscroll-contain space-y-2 pr-1">
            {sortedSkills.map(([skill, value]) => {
              const isProficient = proficientSkillSet.has(skill)
              return (
                <div key={skill} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        isProficient ? 'bg-amber-400' : 'bg-gray-700 border border-gray-600'
                      }`}
                    />
                    <span className={`text-sm ${isProficient ? 'text-amber-300 font-medium' : 'text-gray-300'}`}>
                      {skill}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-mono font-semibold ${
                      isProficient ? 'text-amber-300' : 'text-gray-400'
                    }`}
                  >
                    {signedNum(value)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 8. Inventory                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Inventory
          </p>
          {character.inventory && character.inventory.length > 0 ? (
            <div className="space-y-2">
              {character.inventory.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-gray-200">{item.name}</span>
                  {item.quantity > 1 && (
                    <span className="text-xs font-mono text-gray-500 bg-gray-800 rounded px-2 py-0.5">
                      ×{item.quantity}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600 italic">No items</p>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* 9. Spell slots (spellcasters only)                                 */}
        {/* ---------------------------------------------------------------- */}
        {isSpellcaster && spellSlotEntries.length > 0 && (
          <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
              Spell Slots
            </p>
            <div className="space-y-3">
              {spellSlotEntries.map(([level, slots]) => {
                const total = Number(slots)
                return (
                  <div key={level} className="flex items-center gap-3">
                    <span className="text-sm text-gray-300 w-16 flex-shrink-0">
                      Level {level}
                    </span>
                    <div className="flex gap-1.5">
                      {Array.from({ length: total }).map((_, i) => (
                        <span
                          key={i}
                          className="w-5 h-5 rounded-full bg-violet-500 border border-violet-400 inline-block"
                          title={`Slot ${i + 1}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500 ml-auto">{total}/{total}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* XP bar */}
        <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">
            Experience
          </p>
          <p className="text-lg font-bold text-gray-300">
            {character.xp.toLocaleString()} <span className="text-gray-600 font-normal text-sm">XP</span>
          </p>
        </section>
      </div>
    </div>
  )
}
