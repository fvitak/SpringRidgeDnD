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
import { xpForNextLevel, levelForXp, CLASS_FEATURES_BY_LEVEL, hasASI, SPELL_SLOTS_BY_LEVEL } from '@/lib/data/level-up-rules'
import { CLASSES } from '@/lib/data/character-options'
import RomanceIntake from './_components/RomanceIntake'
import RomanceSection from './_components/RomanceSection'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InventoryItem {
  name: string
  quantity: number
  weight?: number
  value?: string
  description?: string
  equipped?: boolean
}

interface Character {
  id: string
  session_id: string
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
  death_saves_successes: number
  death_saves_failures: number
  is_stable: boolean
  rating_preference?: string
}

interface SessionInfo {
  scenario_id?: string | null
  date_night_mode?: boolean
  current_rating?: string
  name?: string
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

// Maximum spell slots — derived from level-up rules table (supports levels 1-5)
function getMaxSpellSlots(classId: string, level: number): Record<string, number> {
  return SPELL_SLOTS_BY_LEVEL[classId]?.[level] ?? {}
}

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
// Combat Action Reference Panel (POL-02)
// ---------------------------------------------------------------------------

interface ActionEntry { name: string; cost: string; range: string; desc: string }

const UNIVERSAL_ACTIONS: ActionEntry[] = [
  { name: 'Attack',      cost: 'Action',        range: '5 ft (melee) / varies',  desc: 'Make one weapon attack against a target.' },
  { name: 'Dash',        cost: 'Action',        range: '—',                      desc: 'Double your movement speed this turn.' },
  { name: 'Disengage',   cost: 'Action',        range: '—',                      desc: 'Your movement doesn\'t provoke opportunity attacks this turn.' },
  { name: 'Dodge',       cost: 'Action',        range: '—',                      desc: 'Attacks against you have disadvantage; you have advantage on DEX saves.' },
  { name: 'Help',        cost: 'Action',        range: '5 ft',                   desc: 'Give an ally advantage on their next ability check or attack roll.' },
  { name: 'Hide',        cost: 'Action',        range: '—',                      desc: 'Roll Stealth (DEX). Success: you are hidden from enemies.' },
  { name: 'Ready',       cost: 'Action',        range: '—',                      desc: 'Set a trigger and a reaction to use when it occurs.' },
  { name: 'Use Object',  cost: 'Action',        range: '5 ft',                   desc: 'Interact with an object (pull lever, open chest, drink potion, etc.).' },
]

const CLASS_COMBAT_ACTIONS: Record<string, ActionEntry[]> = {
  fighter: [
    { name: 'Second Wind',   cost: 'Bonus Action',  range: 'Self',  desc: 'Regain 1d10 + Fighter level HP. Once per short or long rest.' },
    { name: 'Action Surge',  cost: '—',             range: 'Self',  desc: 'Gain one extra action on your turn. Once per rest (unlocks at level 2).' },
  ],
  cleric: [
    { name: 'Channel Divinity: Turn Undead', cost: 'Action', range: '30 ft', desc: 'Each undead that can see/hear you must make WIS save or be turned for 1 minute. (Level 2+)' },
    { name: 'Heal (Cure Wounds)', cost: 'Action', range: 'Touch', desc: 'Touch a creature; restore 1d8 + WIS modifier HP. Expends a spell slot.' },
    { name: 'Spiritual Weapon', cost: 'Bonus Action', range: '60 ft', desc: '2nd-level slot: Summon a spectral weapon. Bonus action each turn: attack for 1d8 + WIS mod force dmg. (Level 3+)' },
  ],
  rogue: [
    { name: 'Sneak Attack',    cost: 'Reaction / Part of Attack', range: 'Varies', desc: 'Deal extra 1d6 dmg when you hit with advantage OR an ally is adjacent to target. Once per turn.' },
    { name: 'Cunning Action',  cost: 'Bonus Action',              range: '—',      desc: 'Dash, Disengage, or Hide as a bonus action. (Level 2+)' },
    { name: 'Uncanny Dodge',   cost: 'Reaction',                  range: 'Self',   desc: 'Halve the damage from one attack you can see. (Level 5+)' },
  ],
  wizard: [
    { name: 'Cast a Spell',    cost: 'Action (varies)',  range: 'Varies', desc: 'Expend a spell slot to cast a prepared spell. Check your spell slots above.' },
    { name: 'Arcane Recovery', cost: 'Short Rest',       range: 'Self',   desc: 'Recover spell slots totalling ½ your wizard level (rounded up). Once per long rest.' },
  ],
}

const SPELLCASTER_SPELL_HINTS: Record<string, string[]> = {
  wizard: [
    'Magic Missile — 1st slot, 120 ft, auto-hit, 3 darts each 1d4+1 force.',
    'Thunderwave — 1st slot, 15 ft cube self, CON save DC or 2d8 thunder + push 10 ft.',
    'Misty Step — 2nd slot, Bonus Action, teleport 30 ft to visible space. (Level 3+)',
    'Fireball — 3rd slot, 150 ft, 20 ft radius, DEX save DC or 8d6 fire. (Level 5+)',
  ],
  cleric: [
    'Cure Wounds — 1st slot, Touch, restore 1d8 + WIS mod HP.',
    'Bless — 1st slot, Conc., 3 creatures within 30 ft add 1d4 to attacks & saves.',
    'Healing Word — 1st slot, Bonus Action, 60 ft, restore 1d4 + WIS mod HP.',
    'Spiritual Weapon — 2nd slot, Bonus Action summon, 60 ft, 1d8+WIS force each turn. (Level 3+)',
    'Spirit Guardians — 3rd slot, Conc., 15 ft radius, 3d8 radiant/necrotic per entry. (Level 5+)',
  ],
}

function ActionReferencePanel({ character, onClose }: { character: Character; onClose: () => void }) {
  const classActions = CLASS_COMBAT_ACTIONS[character.class] ?? []
  const spellHints = SPELLCASTER_SPELL_HINTS[character.class] ?? []
  const isSpellcaster = ['wizard', 'cleric'].includes(character.class)
  const [tab, setTab] = useState<'actions' | 'spells'>('actions')

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border-t-2 border-red-700 rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-red-400 uppercase tracking-widest">⚔ Combat Reference</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>

        {isSpellcaster && (
          <div className="flex gap-2">
            {(['actions', 'spells'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors capitalize ${
                  tab === t ? 'bg-red-900 border-red-600 text-red-200' : 'bg-gray-800 border-gray-700 text-gray-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {(!isSpellcaster || tab === 'actions') && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Class</p>
            {classActions.map((a) => (
              <div key={a.name} className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-bold text-purple-300">{a.name}</span>
                  <div className="text-right text-xs text-gray-500">
                    <div>{a.cost}</div>
                    {a.range !== '—' && <div>{a.range}</div>}
                  </div>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{a.desc}</p>
              </div>
            ))}
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mt-3 pt-1">Standard</p>
            {UNIVERSAL_ACTIONS.map((a) => (
              <div key={a.name} className="bg-gray-800/50 rounded-xl p-3 border border-gray-800">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-semibold text-gray-300">{a.name}</span>
                  <span className="text-xs text-gray-600">{a.cost}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        )}

        {isSpellcaster && tab === 'spells' && (
          <div className="space-y-2">
            {/* Remaining spell slots */}
            <div className="bg-gray-800 rounded-xl p-3 border border-violet-800">
              <p className="text-xs font-semibold text-violet-400 mb-1">Remaining Slots</p>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(character.spell_slots).map(([lvl, count]) => (
                  <span key={lvl} className={`text-sm font-bold ${Number(count) > 0 ? 'text-violet-300' : 'text-gray-600 line-through'}`}>
                    {count}× Lvl {lvl}
                  </span>
                ))}
              </div>
            </div>
            {spellHints.map((hint, i) => (
              <div key={i} className="bg-gray-800/50 rounded-xl p-3 border border-gray-800">
                <p className="text-xs text-gray-300 leading-relaxed">{hint}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Level-Up Modal
// ---------------------------------------------------------------------------

function LevelUpModal({
  character,
  onComplete,
  onDismiss,
}: {
  character: Character
  onComplete: () => void
  onDismiss: () => void
}) {
  const newLevel = character.level + 1
  const cls = CLASSES.find((c) => c.id === character.class)
  const hitDie = cls?.hitDie ?? 8
  const conMod = Math.floor(((character.stats.con ?? 10) - 10) / 2)
  const features = CLASS_FEATURES_BY_LEVEL[character.class]?.[newLevel] ?? []
  const newSpellSlots = SPELL_SLOTS_BY_LEVEL[character.class]?.[newLevel]
  const isASILevel = hasASI(character.class, newLevel)

  const [hpMode, setHpMode] = useState<'roll' | 'average'>('average')
  const [rolledHp, setRolledHp] = useState<number | null>(null)
  const [hpInput, setHpInput] = useState('')
  const [asiMode, setAsiMode] = useState<'one' | 'two'>('one')
  const [asiStat1, setAsiStat1] = useState('str')
  const [asiStat2, setAsiStat2] = useState('dex')
  const [submitting, setSubmitting] = useState(false)

  const average = Math.floor(hitDie / 2) + 1
  const hpGainBase = hpMode === 'average' ? average : (rolledHp ?? 0)
  const hpGain = Math.max(1, hpGainBase + conMod)

  const canSubmit = hpMode === 'average' || (rolledHp !== null && rolledHp >= 1)

  async function handleConfirm() {
    if (!canSubmit) return
    setSubmitting(true)
    const asiChoices = isASILevel
      ? asiMode === 'one'
        ? [{ stat: asiStat1, amount: 2 }]
        : [{ stat: asiStat1, amount: 1 }, { stat: asiStat2, amount: 1 }]
      : []

    await fetch(`/api/players/${character.id}/levelup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hpGain, asiChoices }),
    })
    setSubmitting(false)
    onComplete()
  }

  const STAT_LABELS: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }
  const stats = ['str', 'dex', 'con', 'int', 'wis', 'cha']

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border-2 border-purple-500 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5 my-4">
        <div className="text-center">
          <p className="text-4xl mb-1">⬆</p>
          <h2 className="text-2xl font-bold text-purple-400">Level {newLevel}!</h2>
          <p className="text-gray-400 text-sm mt-1 capitalize">{character.class}</p>
        </div>

        {/* New features */}
        {features.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">New Features</p>
            {features.map((f) => (
              <div key={f.name} className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                <p className="text-sm font-bold text-purple-300">{f.name}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* New spell slots */}
        {newSpellSlots && (
          <div className="bg-gray-800 rounded-xl p-3 border border-violet-800">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-2">Spell Slots</p>
            <div className="flex gap-3 flex-wrap">
              {Object.entries(newSpellSlots).map(([lvl, count]) => (
                <span key={lvl} className="text-xs text-violet-300">
                  {count}× Level {lvl}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* HP gain */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Hit Points</p>
          <div className="flex gap-2">
            <button
              onClick={() => setHpMode('average')}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                hpMode === 'average' ? 'bg-purple-700 border-purple-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'
              }`}
            >
              Average ({average})
            </button>
            <button
              onClick={() => setHpMode('roll')}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                hpMode === 'roll' ? 'bg-purple-700 border-purple-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'
              }`}
            >
              Roll d{hitDie}
            </button>
          </div>
          {hpMode === 'roll' && (
            <input
              type="number"
              min={1}
              max={hitDie}
              placeholder={`1–${hitDie}`}
              value={hpInput}
              onChange={(e) => { setHpInput(e.target.value); setRolledHp(Number(e.target.value)) }}
              className="w-full bg-gray-800 text-gray-100 placeholder-gray-600 border border-gray-700 rounded-lg px-4 py-2 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          )}
          <p className="text-xs text-gray-500 text-center">
            +{hpGain} HP {conMod !== 0 ? `(${hpMode === 'average' ? average : (rolledHp ?? '?')} ${conMod >= 0 ? '+' : ''}${conMod} CON)` : ''}
          </p>
        </div>

        {/* ASI */}
        {isASILevel && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Ability Score Improvement</p>
            <div className="flex gap-2">
              <button
                onClick={() => setAsiMode('one')}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  asiMode === 'one' ? 'bg-purple-700 border-purple-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'
                }`}
              >
                +2 to one
              </button>
              <button
                onClick={() => setAsiMode('two')}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  asiMode === 'two' ? 'bg-purple-700 border-purple-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'
                }`}
              >
                +1 to two
              </button>
            </div>
            <select
              value={asiStat1}
              onChange={(e) => setAsiStat1(e.target.value)}
              className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            >
              {stats.map((s) => (
                <option key={s} value={s}>{STAT_LABELS[s]} ({character.stats[s]})</option>
              ))}
            </select>
            {asiMode === 'two' && (
              <select
                value={asiStat2}
                onChange={(e) => setAsiStat2(e.target.value)}
                className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                {stats.filter((s) => s !== asiStat1).map((s) => (
                  <option key={s} value={s}>{STAT_LABELS[s]} ({character.stats[s]})</option>
                ))}
              </select>
            )}
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={!canSubmit || submitting}
          className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base rounded-2xl transition-colors"
        >
          {submitting ? 'Applying...' : `Confirm Level ${newLevel}`}
        </button>

        <div className="text-center">
          <button onClick={onDismiss} className="text-xs text-gray-600 hover:text-gray-400 underline">
            Remind me later
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inventory Panel Component
// ---------------------------------------------------------------------------

function InventoryPanel({ inventory, characterId }: { inventory: InventoryItem[]; characterId: string }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [localInventory, setLocalInventory] = useState<InventoryItem[]>(inventory)

  // Keep in sync with live updates from Realtime
  useEffect(() => {
    setLocalInventory(inventory)
  }, [inventory])

  const totalWeight = localInventory.reduce((sum, item) => {
    return sum + (item.weight ?? 0) * item.quantity
  }, 0)

  async function toggleEquip(idx: number) {
    const updated = localInventory.map((item, i) =>
      i === idx ? { ...item, equipped: !item.equipped } : item
    )
    setLocalInventory(updated)

    // Persist via API
    await fetch(`/api/players/${characterId}/inventory`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventory: updated }),
    }).catch(() => {
      // Revert on failure
      setLocalInventory(localInventory)
    })
  }

  return (
    <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Inventory</p>
        {totalWeight > 0 && (
          <p className="text-xs text-gray-600">{totalWeight.toFixed(1)} lb</p>
        )}
      </div>

      {localInventory && localInventory.length > 0 ? (
        <div className="space-y-1.5">
          {localInventory.map((item, idx) => {
            const isOpen = expanded === idx
            return (
              <div key={idx} className={`rounded-xl border transition-colors ${item.equipped ? 'border-purple-700 bg-purple-900/10' : 'border-gray-700 bg-gray-800'}`}>
                {/* Row — tap to expand */}
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                  onClick={() => setExpanded(isOpen ? null : idx)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.equipped && (
                      <span className="text-purple-400 text-xs flex-shrink-0">E</span>
                    )}
                    <span className="text-sm text-gray-200 truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {item.quantity > 1 && (
                      <span className="text-xs font-mono text-gray-500">×{item.quantity}</span>
                    )}
                    <span className="text-gray-600 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-3 pb-3 border-t border-gray-700 pt-2 space-y-2">
                    {item.description && (
                      <p className="text-xs text-gray-400 leading-relaxed">{item.description}</p>
                    )}
                    <div className="flex gap-4 text-xs text-gray-500">
                      {item.weight !== undefined && (
                        <span>{item.weight} lb{item.quantity > 1 ? ` (×${item.quantity} = ${(item.weight * item.quantity).toFixed(1)} lb)` : ''}</span>
                      )}
                      {item.value && <span>{item.value}</span>}
                    </div>
                    <button
                      onClick={() => toggleEquip(idx)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        item.equipped
                          ? 'bg-purple-700 text-purple-100 hover:bg-purple-600'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {item.equipped ? 'Unequip' : 'Equip'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-600 italic">No items</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Rating dial component for the per-player content rating.
const RATING_OPTIONS = ['G', 'PG', 'PG-13', 'R', 'NC-17']

interface RatingDialProps {
  current: string
  sessionRating: string
  saving: boolean
  pending: string | null
  onChange: (r: string) => void
}

function RatingDial(props: RatingDialProps) {
  const { current, sessionRating, saving, pending, onChange } = props
  return (
    <section className="bg-gray-900 rounded-2xl p-4 border border-pink-900/60">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">
          Content Rating
        </p>
        <span className="text-xs text-gray-500">
          Session: <span className="text-pink-300 font-semibold">{sessionRating}</span>
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {RATING_OPTIONS.map(function renderOption(r) {
          const isMine = current === r
          const isPending = pending === r
          const baseClass = 'py-2 rounded-lg text-xs font-bold border-2 transition-all min-h-[44px]'
          const colorClass = isMine
            ? 'border-pink-500 bg-pink-500/20 text-pink-200'
            : 'border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-500 hover:text-gray-300'
          const opacityClass = isPending ? 'opacity-50' : ''
          return (
            <button
              key={r}
              onClick={() => onChange(r)}
              disabled={saving}
              className={baseClass + ' ' + colorClass + ' ' + opacityClass}
            >
              {r}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-gray-500 mt-3 leading-relaxed">
        Each player picks their comfort level. The DM honours the most conservative active
        setting. Slide it up or down anytime; the Narrator will notice.
      </p>
    </section>
  )
}

export default function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [character, setCharacter] = useState<Character | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [levelUpDismissed, setLevelUpDismissed] = useState(false)
  const [combatActive, setCombatActive] = useState(false)
  const [activeCombatantName, setActiveCombatantName] = useState<string | null>(null)
  const [showActionPanel, setShowActionPanel] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [savingRating, setSavingRating] = useState(false)
  const [pendingRating, setPendingRating] = useState<string | null>(null)

  // Romance intake gating (PIV-07).
  // intakeStatus: null while we don't yet know; { complete } drives the gate.
  // The intake flow is shown when:
  //   sessionInfo.date_night_mode === true && intakeStatus.complete === false
  // and is hidden otherwise (including for non-Date-Night sessions like WSC).
  const [intakeStatus, setIntakeStatus] = useState<{
    has_turn_ons: boolean
    has_pet_peeves: boolean
    has_first_impression: boolean
    complete: boolean
    romance_enabled: boolean
  } | null>(null)

  // Unwrap params (Next 15 async params)
  useEffect(() => {
    params.then(({ id }) => setCharacterId(id))
  }, [params])

  // Fetch initial data from server-side API route
  useEffect(() => {
    if (!characterId) return
    setLoading(true)
    let aborted = false
    async function load() {
      try {
        const res = await fetch(`/api/players/${characterId}`)
        if (!res.ok) {
          let body = ''
          try { body = await res.text() } catch { /* ignore */ }
          throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`)
        }
        const data = (await res.json()) as Character
        if (!aborted) {
          setCharacter(data)
          setLoading(false)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!aborted) {
          setError(msg)
          setLoading(false)
        }
      }
    }
    load()
    return () => { aborted = true }
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

  // Level-up detection — fires whenever character XP or level changes
  useEffect(() => {
    if (!character) return
    const nextXp = xpForNextLevel(character.level)
    const eligible = nextXp !== null && character.xp >= nextXp
    if (eligible && !levelUpDismissed) setShowLevelUp(true)
    else if (!eligible) setShowLevelUp(false)
  }, [character?.xp, character?.level, levelUpDismissed]) // eslint-disable-line react-hooks/exhaustive-deps

  // Combat state subscription via game_state Realtime (POL-02).
  // Also tracks the current "active combatant" so we can show a turn banner.
  useEffect(() => {
    if (!character?.session_id) return

    const supabase = getRealtimeClient()
    if (!supabase) return

    type CSLite = { active?: boolean; initiative?: Array<{ name: string }> }
    const applyCombat = (cs: CSLite | null) => {
      setCombatActive(cs?.active === true)
      const top = cs?.initiative?.[0]?.name ?? null
      setActiveCombatantName(top)
    }

    fetch(`/api/sessions/${character.session_id}/state`)
      .then(r => r.json())
      .then(state => applyCombat((state?.combat_state ?? null) as CSLite | null))
      .catch(() => {})

    const channel = supabase
      .channel('game-state-' + character.session_id)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state', filter: `session_id=eq.${character.session_id}` },
        (payload) => {
          const cs = (payload.new as Record<string, unknown>)?.combat_state as CSLite | null
          applyCombat(cs)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [character?.session_id])

  // Fetch session info (Date Night Mode / current rating); polls every 5s for partner-side changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!character?.session_id) return
    let cancelled = false
    const sid = character.session_id
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sid}`)
        if (!res.ok) return
        const data = (await res.json()) as SessionInfo
        if (!cancelled) setSessionInfo(data)
      } catch {
        // silent
      }
    }
    load()
    const t = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(t) }
  }, [character?.session_id])

  // Romance intake status fetch — only when Date Night Mode is active.
  // The status endpoint is privacy-gated to viewer === id; we always pass
  // the player's own character_id as both subject and viewer.
  useEffect(() => {
    if (!characterId) return
    if (!sessionInfo?.date_night_mode) {
      // Not Date Night → no intake gate; clear stale status.
      setIntakeStatus(null)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(
          `/api/characters/${characterId}/romance/status?viewer=${characterId}`,
        )
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setIntakeStatus({
          has_turn_ons: data.status?.has_turn_ons ?? false,
          has_pet_peeves: data.status?.has_pet_peeves ?? false,
          has_first_impression: data.status?.has_first_impression ?? false,
          complete: data.status?.complete ?? false,
          romance_enabled: Boolean(data.romance_enabled),
        })
      } catch {
        // silent — sheet still works without intake gate (treated as complete)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [characterId, sessionInfo?.date_night_mode])

  const isMyTurn = Boolean(
    combatActive && character && activeCombatantName && activeCombatantName === character.character_name,
  )

  async function handleRatingChange(newRating: string) {
    if (!character) return
    if (savingRating) return
    setSavingRating(true)
    setPendingRating(newRating)
    try {
      const res = await fetch(`/api/players/${character.id}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: newRating }),
      })
      const data = await res.json()
      if (data?.ok) {
        setCharacter((c) => (c ? { ...c, rating_preference: newRating } : c))
        setSessionInfo((s) => (s ? { ...s, current_rating: data.session_rating } : s))
      }
    } catch {
      // silent — keep prior preference visible
    } finally {
      setSavingRating(false)
      setPendingRating(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-purple-400 text-lg animate-pulse">Loading character...</p>
      </div>
    )
  }

  if (error || !character) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-gray-900 rounded-2xl p-6 border border-red-700 space-y-4">
          <h2 className="text-red-400 font-bold text-lg">Couldn&apos;t load this character.</h2>
          <p className="text-red-300 text-sm break-words">{error ?? 'Character not found.'}</p>
          <p className="text-gray-400 text-xs leading-relaxed">
            If your phone reached this URL but the API call failed, the most likely causes are:
          </p>
          <ul className="text-gray-400 text-xs space-y-1 list-disc list-inside">
            <li>Your laptop&apos;s dev server is bound to <code className="text-purple-300">localhost</code>, so your phone can&apos;t reach it. Open the app at your laptop&apos;s LAN IP (e.g. <code className="text-purple-300">http://192.168.x.x:3000</code>) and re-scan.</li>
            <li>The Supabase migrations haven&apos;t been run yet on the project this session is talking to.</li>
            <li>Your <code className="text-purple-300">.env.local</code> is missing the Supabase env vars on the server.</li>
          </ul>
          <p className="text-gray-500 text-xs break-all">
            URL: <code>{typeof window !== 'undefined' ? window.location.href : ''}</code>
          </p>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Romance intake gate (PIV-07).
  //
  // Show the intake flow when:
  //   - the session has Date Night Mode enabled, AND
  //   - the romance subsystem is enabled for this module (server-side check), AND
  //   - the character_romance row is missing or incomplete.
  //
  // For non-Date-Night sessions (e.g. Wild Sheep Chase), intakeStatus is null
  // and we fall through to the normal sheet — no romance UI appears.
  // ---------------------------------------------------------------------------
  if (
    sessionInfo?.date_night_mode &&
    intakeStatus &&
    intakeStatus.romance_enabled &&
    !intakeStatus.complete
  ) {
    return (
      <RomanceIntake
        characterId={character.id}
        initialStatus={{
          has_turn_ons: intakeStatus.has_turn_ons,
          has_pet_peeves: intakeStatus.has_pet_peeves,
          has_first_impression: intakeStatus.has_first_impression,
        }}
        onComplete={() => {
          // Re-fetch status; the intake component closes itself by flipping complete.
          setIntakeStatus((s) => (s ? { ...s, complete: true, has_turn_ons: true, has_pet_peeves: true, has_first_impression: true } : s))
        }}
      />
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

  // Spell slots: { "1": remainingSlots } — the AI decrements these via state_changes
  // when spells are cast. We compare against MAX_SPELL_SLOTS to show spent (empty) pips.
  const spellSlotEntries = Object.entries(character.spell_slots).sort(
    ([a], [b]) => Number(a) - Number(b)
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-12">
      {/* ------------------------------------------------------------------ */}
      {/* 1. Header bar                                                        */}
      {/* ------------------------------------------------------------------ */}
      <header className="bg-gray-900 border-b border-purple-900/50 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-purple-400 truncate leading-tight">
              {character.character_name}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {capitalize(character.race)} {capitalize(character.class)}
              {character.player_name ? ` · ${character.player_name}` : ''}
            </p>
          </div>
          <div className="flex-shrink-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-700 text-purple-100 font-bold text-sm border-2 border-purple-500">
              Lv{character.level}
            </span>
          </div>
        </div>
      </header>

      {/* Level-up modal */}
      {showLevelUp && (
        <LevelUpModal
          character={character}
          onComplete={() => { setShowLevelUp(false); setLevelUpDismissed(false) }}
          onDismiss={() => { setShowLevelUp(false); setLevelUpDismissed(true) }}
        />
      )}

      {/* Combat action panel (POL-02) */}
      {showActionPanel && (
        <ActionReferencePanel
          character={character}
          onClose={() => setShowActionPanel(false)}
        />
      )}

      <div className="px-4 space-y-5 mt-5">
        {/* Active-turn banner — shown when this character is at the top of initiative.
            Map lives on the host screen only, so we point the player there. */}
        {isMyTurn && (
          <div className="w-full py-4 px-4 bg-gradient-to-r from-yellow-700 to-amber-700 border-2 border-yellow-400 text-yellow-50 rounded-2xl text-center shadow-lg animate-pulse">
            <p className="text-xs font-semibold uppercase tracking-widest text-yellow-200">Your Turn</p>
            <p className="text-base font-bold mt-1">Move your token at the host screen.</p>
            <p className="text-xs mt-1 opacity-80">Then take an action below.</p>
          </div>
        )}

        {/* Level-up banner */}
        {!showLevelUp && xpForNextLevel(character.level) !== null && character.xp >= (xpForNextLevel(character.level) ?? Infinity) && (
          <button
            onClick={() => { setLevelUpDismissed(false); setShowLevelUp(true) }}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-2xl text-sm animate-pulse transition-colors"
          >
            ⬆ Level Up Available — Tap to Advance
          </button>
        )}

        {/* Combat action button (POL-02) */}
        {combatActive && (
          <button
            onClick={() => setShowActionPanel(true)}
            className="w-full py-3 bg-red-900 hover:bg-red-800 border border-red-700 text-red-200 font-bold rounded-2xl text-sm transition-colors"
          >
            ⚔ Combat Actions &amp; Spells
          </button>
        )}

        {/* Date Night — content rating dial. Only shown when the session has Date Night Mode enabled. */}
        {sessionInfo?.date_night_mode ? (
          <RatingDial
            current={character.rating_preference ?? 'PG'}
            sessionRating={sessionInfo.current_rating ?? 'PG'}
            saving={savingRating}
            pending={pendingRating}
            onChange={handleRatingChange}
          />
        ) : null}

        {/* Romance section (PIV-07) — only when Date Night Mode is on AND
            the intake flow has been completed. The privacy gate at the
            API layer is the source of truth for what's visible. */}
        {sessionInfo?.date_night_mode && intakeStatus?.complete && intakeStatus.romance_enabled ? (
          <RomanceSection
            characterId={character.id}
            sessionId={character.session_id}
          />
        ) : null}

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
        {/* 2b. Death saving throws (only when HP = 0 and not stable)          */}
        {/* ---------------------------------------------------------------- */}
        {character.hp === 0 && !character.is_stable && (
          <section className="bg-gray-900 rounded-2xl p-4 border-2 border-red-700">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-3">
              Death Saving Throws
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-20">Successes</span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm
                      ${i < character.death_saves_successes
                        ? 'bg-green-500 border-green-400 text-white'
                        : 'border-gray-600 text-transparent'}`}
                  >
                    ✓
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-20">Failures</span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm
                      ${i < character.death_saves_failures
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'border-gray-600 text-transparent'}`}
                  >
                    ✕
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-600 italic mt-3">
              Roll d20 at start of your turn. 10+ is a success.
            </p>
          </section>
        )}

        {/* Show STABLE badge when hp=0 but character is stable */}
        {character.hp === 0 && character.is_stable && (
          <section className="bg-gray-900 rounded-2xl p-4 border-2 border-green-700 flex items-center justify-center">
            <span className="text-base font-bold uppercase tracking-widest text-green-400 px-4 py-1 rounded-full bg-green-900/50 border border-green-600">
              Stable
            </span>
          </section>
        )}

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
                  <span className="text-xs font-bold text-purple-500 uppercase tracking-wider">
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
          <div className="flex flex-col items-center bg-gray-900 border-2 border-purple-600 rounded-2xl px-8 py-4">
            <span className="text-xs font-bold uppercase tracking-widest text-purple-500">
              Armor Class
            </span>
            <span className="text-5xl font-extrabold text-purple-300 mt-1">{character.ac}</span>
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
                        isProficient ? 'bg-purple-400' : 'bg-gray-700 border border-gray-600'
                      }`}
                    />
                    <span className={`text-sm ${isProficient ? 'text-purple-300' : 'text-gray-300'}`}>
                      {label}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-mono font-semibold ${
                      isProficient ? 'text-purple-300' : 'text-gray-400'
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
                        isProficient ? 'bg-purple-400' : 'bg-gray-700 border border-gray-600'
                      }`}
                    />
                    <span className={`text-sm ${isProficient ? 'text-purple-300 font-medium' : 'text-gray-300'}`}>
                      {skill}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-mono font-semibold ${
                      isProficient ? 'text-purple-300' : 'text-gray-400'
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
        <InventoryPanel inventory={character.inventory} characterId={character.id} />

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
                const remaining = Number(slots)
                const maxSlots = getMaxSpellSlots(character.class, character.level)[level] ?? remaining
                const spent = maxSlots - remaining
                return (
                  <div key={level} className="flex items-center gap-3">
                    <span className="text-sm text-gray-300 w-16 flex-shrink-0">
                      Level {level}
                    </span>
                    <div className="flex gap-1.5">
                      {Array.from({ length: remaining }).map((_, i) => (
                        <span
                          key={`filled-${i}`}
                          className="w-5 h-5 rounded-full bg-violet-500 border border-violet-400 inline-block"
                          title={`Slot ${i + 1} (available)`}
                        />
                      ))}
                      {Array.from({ length: spent }).map((_, i) => (
                        <span
                          key={`empty-${i}`}
                          className="w-5 h-5 rounded-full bg-gray-700 border border-gray-600 inline-block"
                          title={`Slot ${remaining + i + 1} (spent)`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500 ml-auto">{remaining}/{maxSlots}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* XP / level progress */}
        {(() => {
          const nextXp = xpForNextLevel(character.level)
          const prevXp = character.level > 1 ? (xpForNextLevel(character.level - 1) ?? 0) : 0
          const pct = nextXp ? Math.min(100, ((character.xp - prevXp) / (nextXp - prevXp)) * 100) : 100
          return (
            <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Experience</p>
                {nextXp && <p className="text-xs text-gray-600">{character.xp.toLocaleString()} / {nextXp.toLocaleString()}</p>}
              </div>
              <p className="text-lg font-bold text-gray-300 mb-2">
                {character.xp.toLocaleString()} <span className="text-gray-600 font-normal text-sm">XP</span>
                {!nextXp && <span className="text-purple-400 text-sm ml-2">Max Level</span>}
              </p>
              {nextXp && (
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              )}
            </section>
          )
        })()}
      </div>
    </div>
  )
}
