'use client'

import { useState, useEffect, useRef, useCallback, KeyboardEvent, Suspense } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import Map, { type SceneData } from './components/Map'
import type { MapToken } from '@/lib/movement/validate-move'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppScreen = 'creation' | 'lobby' | 'narration'

interface SessionInfo {
  session_id: string
  join_token: string
  player_count: number
  name: string
  scenario_id?: string | null
  date_night_mode?: boolean
  current_rating?: string
}

interface PlayerSlot {
  id?: string
  slot: number
  character_name: string | null
}

interface ActionRequired {
  type: 'roll' | 'choice' | 'confirm'
  player?: string
  description: string
}

interface CombatantEntry {
  name: string
  initiative: number
  hp: number
  max_hp: number
  is_player: boolean
  conditions?: string[]
}

interface CombatState {
  active: boolean
  round?: number
  initiative?: CombatantEntry[]
}

interface DMResponse {
  narration: string
  actions_required?: ActionRequired[]
  state_changes?: unknown[]
  dm_rolls?: unknown[]
  combat_state?: CombatState
  scene_suggestions?: string[]
}

interface LogEntry {
  player_input: string
  narration: string
  error?: string
  isHistory?: boolean
  created_at?: string
}

interface PartyMember {
  id: string
  character_name: string
  class: string
  hp: number
  max_hp: number
  conditions: string[]
  drinks_consumed: number
  tolerance_threshold: number
  slot: number
  position: string | null
}

// ---------------------------------------------------------------------------
// Intoxication helpers
// ---------------------------------------------------------------------------

type IntoxLevel = 'Buzzed' | 'Drunk' | 'Hammered' | null

function getIntoxLevel(drinks: number, threshold: number): IntoxLevel {
  if (drinks >= threshold * 3) return 'Hammered'
  if (drinks >= threshold * 2) return 'Drunk'
  if (drinks >= threshold) return 'Buzzed'
  return null
}

const INTOX_ICON: Record<NonNullable<IntoxLevel>, string> = {
  Buzzed: '🍺',
  Drunk: '🍻',
  Hammered: '💀',
}

// ---------------------------------------------------------------------------
// HP bar color helper
// ---------------------------------------------------------------------------

function hpColor(hp: number, maxHp: number): string {
  const pct = maxHp > 0 ? hp / maxHp : 0
  if (pct > 0.5) return 'bg-green-500'
  if (pct > 0.25) return 'bg-yellow-400'
  return 'bg-red-500'
}

// ---------------------------------------------------------------------------
// Party Sidebar
// ---------------------------------------------------------------------------

interface SceneNPC {
  name: string
  description: string
  location: string
}

function PartySidebar({
  sessionId,
  onInsertName,
  combatState,
  onShowQR,
}: {
  sessionId: string
  onInsertName: (name: string) => void
  combatState: CombatState | null
  onShowQR: (member: PartyMember) => void
}) {
  const [party, setParty] = useState<PartyMember[]>([])
  const [npcs, setNpcs] = useState<SceneNPC[]>([])

  const fetchParty = useCallback(async () => {
    try {
      const [partyRes, sceneRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/party`),
        fetch(`/api/sessions/${sessionId}/scene`),
      ])
      if (partyRes.ok) setParty(await partyRes.json())
      if (sceneRes.ok) {
        const s = await sceneRes.json()
        setNpcs(s.npcs ?? [])
      }
    } catch {
      // silent — polling
    }
  }, [sessionId])

  useEffect(() => {
    fetchParty()
    const interval = setInterval(fetchParty, 5000)
    return () => clearInterval(interval)
  }, [fetchParty])

  return (
    <aside className="hidden md:flex w-56 flex-shrink-0 flex-col gap-3 bg-gray-900 border-l border-gray-800 px-3 py-4 overflow-y-auto">
      {/* Initiative tracker — shown above party during active combat */}
      {combatState?.active && (combatState.initiative?.length ?? 0) > 0 && (
        <InitiativeTracker combatState={combatState} />
      )}

      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 px-1">
        Party
      </h2>

      {party.length === 0 && (
        <p className="text-gray-600 text-xs italic px-1">No characters yet</p>
      )}

      {party.map((member) => {
        const intox = getIntoxLevel(member.drinks_consumed, member.tolerance_threshold)
        const hpPct = member.max_hp > 0 ? (member.hp / member.max_hp) * 100 : 0

        return (
          <div
            key={member.slot}
            className="bg-gray-800 rounded-xl p-3 space-y-2 border border-gray-700 cursor-pointer hover:border-purple-600 transition-colors group"
            onClick={() => onShowQR(member)}
            title="Click to show player QR code"
          >
            {/* Name + intox */}
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-semibold text-gray-100 truncate leading-tight group-hover:text-purple-400 transition-colors">
                {member.character_name}
              </span>
              {intox && (
                <span
                  className="text-sm leading-none flex-shrink-0"
                  title={intox}
                  aria-label={intox}
                >
                  {INTOX_ICON[intox]}
                </span>
              )}
            </div>

            {/* Class */}
            <p className="text-xs text-gray-400 capitalize">{member.class}</p>

            {/* Location */}
            {member.position && (
              <p className="text-xs text-gray-500 italic leading-tight">{member.position}</p>
            )}

            {/* HP bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">HP</span>
                <span className="text-xs text-gray-400">
                  {member.hp}/{member.max_hp}
                </span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${hpColor(member.hp, member.max_hp)}`}
                  style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }}
                />
              </div>
            </div>

            {/* Condition badges */}
            {member.conditions && member.conditions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {member.conditions.map((cond) => (
                  <span
                    key={cond}
                    className="text-xs bg-purple-900/60 text-purple-300 border border-purple-700 rounded px-1.5 py-0.5"
                  >
                    {cond}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {/* NPCs in scene — hidden during active combat */}
      {!combatState?.active && npcs.length > 0 && (
        <>
          <div className="border-t border-gray-800 pt-3 mt-1">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 px-1 mb-2">
              In the Scene
            </h2>
            {npcs.map((npc) => (
              <button
                key={npc.name}
                onClick={() => onInsertName(npc.name)}
                className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-800 transition-colors group mb-1"
                title={`Insert "${npc.name}" at cursor`}
              >
                <span className="text-sm font-medium text-gray-200 group-hover:text-purple-400 transition-colors block leading-tight">
                  {npc.name}
                </span>
                {npc.description && (
                  <span className="text-xs text-gray-500 block leading-tight">{npc.description}</span>
                )}
                {npc.location && (
                  <span className="text-xs text-gray-600 block leading-tight italic">{npc.location}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Session Creation Modal
// ---------------------------------------------------------------------------

// Static catalogue used by the picker — keep in sync with lib/scenarios/registry.ts.
const SCENARIO_OPTIONS = [
  { id: 'wild-sheep-chase', name: 'The Wild Sheep Chase',           minPlayers: 2, maxPlayers: 4, supportsDateNight: false },
  { id: 'blackthorn-clan',  name: 'Rescue of the Blackthorn Clan',  minPlayers: 2, maxPlayers: 2, supportsDateNight: true  },
  { id: 'random-encounter', name: 'Random Encounter (Combat Test)', minPlayers: 2, maxPlayers: 4, supportsDateNight: false },
] as const

function SessionCreationModal({ onCreated }: { onCreated: (info: SessionInfo) => void }) {
  const [scenarioId, setScenarioId] = useState<string>('wild-sheep-chase')
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(4)
  const [dateNightMode, setDateNightMode] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scenario = SCENARIO_OPTIONS.find((s) => s.id === scenarioId) ?? SCENARIO_OPTIONS[0]

  // Whenever the scenario changes, snap player count into the supported range.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => {
    if (playerCount > scenario.maxPlayers) setPlayerCount(scenario.maxPlayers as 2 | 3 | 4)
    else if (playerCount < scenario.minPlayers) setPlayerCount(scenario.minPlayers as 2 | 3 | 4)
    if (!scenario.supportsDateNight) setDateNightMode(false)
  }, [scenarioId])

  async function handleBeginAdventure() {
    setIsCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: scenarioId,
          name: scenario.name,
          player_count: playerCount,
          date_night_mode: dateNightMode,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create session')
      }
      const data = await res.json()
      onCreated({
        session_id: data.session_id,
        join_token: data.join_token,
        player_count: playerCount,
        name: scenario.name,
        scenario_id: scenarioId,
        date_night_mode: dateNightMode,
        current_rating: 'PG',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setIsCreating(false)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-end pb-12 px-4">
      {/* Background artwork */}
      <Image
        src="/grail-bg.png"
        alt=""
        fill
        priority
        className="object-cover object-center -z-10"
      />
      {/* Ambient darkening overlay */}
      <div className="fixed inset-0 bg-black/20 -z-[5]" />

      {/* Frosted card — anchored to bottom */}
      <div className="w-full max-w-sm bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-5">

        {/* Adventure selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-white text-sm font-medium">Adventure</label>
          <select
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {SCENARIO_OPTIONS.map((s) => (
              <option key={s.id} className="bg-gray-900" value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Player count — locked to a fixed value when the scenario requires it */}
        <div className="flex flex-col gap-1.5">
          <label className="text-white text-sm font-medium">
            Number of Players
            {scenario.minPlayers === scenario.maxPlayers && (
              <span className="text-white/50 text-xs ml-2 font-normal">(fixed at {scenario.minPlayers})</span>
            )}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {([2, 3, 4] as const).map((n) => {
              const allowed = n >= scenario.minPlayers && n <= scenario.maxPlayers
              return (
                <button
                  key={n}
                  onClick={() => allowed && setPlayerCount(n)}
                  disabled={!allowed}
                  className={`rounded-xl border-2 py-3 text-2xl font-bold min-h-[44px] transition-all ${
                    !allowed
                      ? 'border-white/10 bg-white/5 text-white/20 cursor-not-allowed'
                      : playerCount === n
                      ? 'border-purple-500 bg-purple-500/20 text-purple-300 shadow-lg shadow-purple-500/20'
                      : 'border-white/20 bg-white/10 text-white/60 hover:border-white/40 hover:text-white'
                  }`}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>

        {/* Date Night mode toggle — only shown when the scenario supports it */}
        {scenario.supportsDateNight && (
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dateNightMode}
              onChange={(e) => setDateNightMode(e.target.checked)}
              className="w-5 h-5 rounded border-white/30 bg-white/10 accent-pink-500"
            />
            <span className="flex-1">
              <span className="text-white text-sm font-medium block">Date Night Mode</span>
              <span className="text-white/60 text-xs">
                Each player picks a content rating on their phone. The DM honours the most conservative.
              </span>
            </span>
          </label>
        )}

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        {/* Begin button */}
        <button
          onClick={handleBeginAdventure}
          disabled={isCreating}
          className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-colors shadow-lg min-h-[44px]"
        >
          {isCreating ? 'Creating adventure...' : 'Begin Adventure'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// QR Code image (canvas rendered via qrcode library)
// ---------------------------------------------------------------------------

function QRCodeImage({ url, size = 160 }: { url: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    }).catch(console.error)
  }, [url, size])

  return <canvas ref={canvasRef} className="rounded-lg" />
}

// ---------------------------------------------------------------------------
// QR Player Re-join Modal
// ---------------------------------------------------------------------------

function QRPlayerModal({
  member,
  onClose,
}: {
  member: PartyMember
  onClose: () => void
}) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    setUrl(`${window.location.origin}/player/${member.id}`)
  }, [member.id])

  // Close on Escape
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-gray-900 font-bold text-lg">{member.character_name}</p>
        <p className="text-gray-500 text-sm -mt-2">Scan to rejoin</p>
        {url ? (
          <QRCodeImage url={url} size={220} />
        ) : (
          <div className="w-[220px] h-[220px] rounded-lg bg-gray-100 animate-pulse" />
        )}
        <p className="text-gray-400 text-xs text-center break-all">{url}</p>
        {/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url) && (
          <p className="text-amber-400 text-xs text-center px-2 leading-relaxed">
            Your phone can&apos;t reach <code>localhost</code>. Open this app on your laptop at its LAN IP (e.g. <code>http://192.168.x.x:3000</code>) and try the QR again.
          </p>
        )}
        <button
          onClick={onClose}
          className="mt-1 px-6 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// QR Lobby Screen
// ---------------------------------------------------------------------------

function LobbyScreen({
  session,
  onStartAdventure,
}: {
  session: SessionInfo
  onStartAdventure: () => void
}) {
  const [players, setPlayers] = useState<PlayerSlot[]>([])
  const [host, setHost] = useState('')

  // Resolve host once on mount (client-only)
  useEffect(() => {
    setHost(window.location.host)
  }, [])

  // Poll for joined players every 3 seconds
  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/sessions/${session.session_id}/players`)
        if (!res.ok) return
        const data: Array<{ id: string; slot: number; character_name: string }> = await res.json()
        if (!cancelled) setPlayers(data as PlayerSlot[])
      } catch {
        // silent — polling
      }
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session.session_id])

  const slots = Array.from({ length: session.player_count }, (_, i) => i + 1)
  const joinedSlots = new Set(players.map((p) => p.slot))
  const joinedCount = players.length

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-serif overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-4 bg-gray-900 border-b border-gray-800 text-center">
        <h1 className="text-2xl font-bold text-purple-400 tracking-wide">{session.name}</h1>
        <p className="text-gray-400 text-sm mt-1">
          Click <span className="text-purple-400 font-medium">Create Character</span> for each player, then start the adventure
        </p>
      </header>

      {/* QR grid */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div
          className={`grid gap-6 w-full max-w-3xl ${
            session.player_count === 2
              ? 'grid-cols-2'
              : session.player_count === 3
              ? 'grid-cols-3'
              : 'grid-cols-2 md:grid-cols-4'
          }`}
        >
          {slots.map((slot) => {
            const joined = joinedSlots.has(slot)
            const playerName = players.find((p) => p.slot === slot)?.character_name
            const qrUrl = host
              ? `https://${host}/join/${session.join_token}?slot=${slot}`
              : ''

            return (
              <div
                key={slot}
                className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-colors ${
                  joined
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700 bg-gray-900'
                }`}
              >
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">
                  Player {slot}
                </p>

                {(() => {
                  // For joined slots that already have a character id, the QR
                  // points directly at the mobile sheet — no character creator
                  // step needed (Blackthorn pre-builds Wynn + Tarric).
                  const playerRow = players.find((p) => p.slot === slot)
                  const sheetUrl = host && playerRow?.id
                    ? `https://${host}/player/${playerRow.id}`
                    : ''
                  const targetUrl = joined ? sheetUrl : qrUrl
                  return targetUrl ? (
                    <QRCodeImage url={targetUrl} size={140} />
                  ) : (
                    <div className="w-[140px] h-[140px] rounded-lg bg-gray-800 animate-pulse" />
                  )
                })()}

                <div className="text-center w-full">
                  {joined ? (
                    <div className="space-y-1">
                      <p className="text-purple-400 font-semibold text-sm">
                        {playerName ?? 'Joined'}
                      </p>
                      {(() => {
                        const playerRow = players.find((p) => p.slot === slot)
                        return playerRow?.id ? (
                          <a
                            href={`/player/${playerRow.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block text-xs text-gray-400 hover:text-purple-300 underline"
                          >
                            Open sheet
                          </a>
                        ) : null
                      })()}
                    </div>
                  ) : (
                    <a
                      href={`/character-create?session_id=${session.session_id}&slot=${slot}&count=${session.player_count}`}
                      className="inline-block w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm rounded-lg transition-colors text-center"
                    >
                      Create Character
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 px-6 py-5 bg-gray-900 border-t border-gray-800 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {joinedCount} / {session.player_count} players joined
        </p>
        <button
          onClick={onStartAdventure}
          disabled={joinedCount === 0}
          className="px-8 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-lg"
        >
          Start Adventure
        </button>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Initiative Tracker
// ---------------------------------------------------------------------------

function InitiativeTracker({ combatState }: { combatState: CombatState }) {
  const combatants = combatState.initiative ?? []

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-red-400">
          ⚔ Combat
        </h2>
        {combatState.round !== undefined && (
          <span className="text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-700 rounded px-1.5 py-0.5">
            Round {combatState.round}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {combatants.map((c, idx) => {
          const hpPct = c.max_hp > 0 ? (c.hp / c.max_hp) * 100 : 0
          const isActive = idx === 0
          return (
            <div
              key={`${c.name}-${idx}`}
              className={`rounded-lg p-2 border transition-colors ${
                isActive
                  ? 'bg-purple-500/10 border-purple-600'
                  : 'bg-gray-800 border-gray-700'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs" title={c.is_player ? 'Player' : 'NPC'}>
                  {c.is_player ? '🛡' : '⚔'}
                </span>
                <span
                  className={`text-xs font-semibold truncate flex-1 ${
                    isActive ? 'text-purple-300' : 'text-gray-200'
                  }`}
                >
                  {c.name}
                </span>
                <span className="text-xs text-gray-500 flex-shrink-0">
                  {c.initiative}
                </span>
              </div>

              {/* HP bar */}
              <div>
                <div className="flex justify-between mb-0.5">
                  <span className="text-xs text-gray-500">HP</span>
                  <span className="text-xs text-gray-400">
                    {c.hp}/{c.max_hp}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${hpColor(c.hp, c.max_hp)}`}
                    style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }}
                  />
                </div>
              </div>

              {/* Conditions */}
              {c.conditions && c.conditions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {c.conditions.map((cond) => (
                    <span
                      key={cond}
                      className="text-xs bg-purple-900/60 text-purple-300 border border-purple-700 rounded px-1 py-0.5 leading-none"
                    >
                      {cond}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Action Prompt Modal (roll / confirm / choice)
// ---------------------------------------------------------------------------

function RollPromptModal({
  action,
  onSubmitText,
  onDismiss,
}: {
  action: ActionRequired
  onSubmitText: (text: string) => void
  onDismiss: () => void
}) {
  const [rollValue, setRollValue] = useState('')
  const [freeText, setFreeText] = useState('')

  const numVal = Number(rollValue)
  const isRollValid = rollValue.trim() !== '' && Number.isInteger(numVal) && numVal >= 1 && numVal <= 30

  function submitRoll() {
    if (!isRollValid) return
    onSubmitText(`[${action.player ?? 'Party'}] rolled ${numVal} — ${action.description}`)
  }

  function submitText(text: string) {
    if (!text.trim()) return
    const prefix = action.player ? `[${action.player}]: ` : ''
    onSubmitText(`${prefix}${text.trim()}`)
  }

  if (action.type === 'roll') {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 border border-purple-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
          <div className="text-center">
            <p className="text-3xl mb-1">🎲</p>
            <h2 className="text-xl font-bold text-purple-400 tracking-wide uppercase">Roll Check!</h2>
          </div>
          {action.player && <p className="text-center text-sm font-semibold text-gray-300">{action.player}</p>}
          <p className="text-gray-200 text-sm text-center leading-relaxed">{action.description}</p>
          <input
            autoFocus
            type="number"
            min={1}
            max={30}
            value={rollValue}
            onChange={(e) => setRollValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRoll(); if (e.key === 'Escape') onDismiss() }}
            placeholder="1–30"
            className="w-full bg-gray-800 text-gray-100 placeholder-gray-600 border border-gray-700 rounded-lg px-4 py-3 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button onClick={submitRoll} disabled={!isRollValid} className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-colors shadow-lg">
            Submit Roll
          </button>
          <div className="text-center">
            <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline">Dismiss</button>
          </div>
        </div>
      </div>
    )
  }

  const isConfirm = action.type === 'confirm'
  const borderColor = isConfirm ? 'border-blue-700' : 'border-purple-700'
  const titleColor = isConfirm ? 'text-blue-400' : 'text-purple-400'
  const btnColor = isConfirm ? 'bg-blue-700 hover:bg-blue-600' : 'bg-purple-700 hover:bg-purple-600'
  const focusRing = isConfirm ? 'focus:ring-blue-500' : 'focus:ring-purple-500'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className={`bg-gray-900 border ${borderColor} rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4`}>
        <div className="text-center">
          <p className="text-3xl mb-1">{isConfirm ? '❓' : '⚡'}</p>
          <h2 className={`text-xl font-bold ${titleColor} tracking-wide uppercase`}>
            {isConfirm ? 'Clarification' : 'Decision'}
          </h2>
        </div>
        {action.player && <p className="text-center text-sm font-semibold text-gray-300">{action.player}</p>}
        <p className="text-gray-200 text-sm text-center leading-relaxed">{action.description}</p>
        <input
          autoFocus
          type="text"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitText(freeText); if (e.key === 'Escape') onDismiss() }}
          placeholder={isConfirm ? 'Type your response...' : 'Your choice...'}
          className={`w-full bg-gray-800 text-gray-100 placeholder-gray-600 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 ${focusRing} focus:border-transparent`}
        />
        <button
          onClick={() => submitText(freeText)}
          disabled={!freeText.trim()}
          className={`w-full py-3 ${btnColor} disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-colors`}
        >
          {isConfirm ? 'Confirm' : 'Submit'}
        </button>
        <div className="text-center">
          <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline">Dismiss</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Session History Drawer (PER-03)
// ---------------------------------------------------------------------------

function HistoryDrawer({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  const entries = log.filter((e) => e.isHistory || e.created_at)

  function formatTime(iso?: string) {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" onClick={onClose}>
      <div
        className="bg-gray-900 border-l border-gray-700 w-full max-w-md h-full flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-sm font-bold text-purple-400 uppercase tracking-widest">Session Log</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {entries.length === 0 && (
            <p className="text-gray-600 text-sm italic">No history yet.</p>
          )}
          {entries.map((entry, i) => (
            <div key={i} className="space-y-1.5 border-b border-gray-800 pb-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500 truncate">
                  <span className="text-gray-600 mr-1">&gt;</span>
                  {entry.player_input}
                </p>
                {entry.created_at && (
                  <span className="text-xs text-gray-700 flex-shrink-0">{formatTime(entry.created_at)}</span>
                )}
              </div>
              {entry.error ? (
                <p className="text-red-500 text-xs italic">{entry.error}</p>
              ) : (
                <p className="text-gray-300 text-sm leading-relaxed line-clamp-6">
                  {entry.narration}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Turn Queue Strip
// ---------------------------------------------------------------------------

function TurnQueueStrip({
  queue,
  currentIdx,
  committed,
  party,
}: {
  queue: string[]
  currentIdx: number
  committed: Record<string, string>
  party: PartyMember[]
}) {
  return (
    <div className="flex-shrink-0 px-6 py-2 bg-gray-900/80 border-t border-gray-800 flex items-center gap-3 overflow-x-auto">
      <span className="text-xs text-gray-600 uppercase tracking-widest flex-shrink-0">Turn</span>
      {queue.map((name, idx) => {
        const member = party.find((m) => m.character_name === name)
        const isActive = idx === currentIdx
        const isDone = name in committed
        return (
          <div
            key={name}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border flex-shrink-0 transition-colors ${
              isDone
                ? 'bg-green-900/30 border-green-700/60 text-green-400'
                : isActive
                ? 'bg-purple-500/15 border-purple-500 text-purple-300 font-semibold'
                : 'bg-gray-800 border-gray-700 text-gray-500'
            }`}
          >
            {isDone && <span>✓</span>}
            <span>{name}</span>
            {member && (
              <span className="opacity-50 capitalize ml-0.5">{member.class}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Narration / Guide Screen
// ---------------------------------------------------------------------------

// Convert a "[DM]: ..." kick line into a clean scenario header. We deliberately
// hide the spoiler-laden direction text from the players; the AI still receives
// the full kick because it lives in the event log's player_input.
function renderDmKickHeader(input: string): string {
  const body = input.replace(/^\[DM\]:\s*/, '').trim()
  // Try to extract "Scenario N" + a perspective phrase, ignore the rest.
  const scenarioMatch = body.match(/Scenario\s+\w+/i)
  const perspectiveMatch = body.match(/from\s+([A-Z][\w']+)(?:'s)?\s+(?:vantage|perspective|POV)/i)
  if (scenarioMatch && perspectiveMatch) {
    return `${scenarioMatch[0]} — from ${perspectiveMatch[1]}'s perspective`
  }
  if (scenarioMatch) return scenarioMatch[0]
  return 'The Adventure Begins'
}

function NarrationScreen({ session }: { session: SessionInfo }) {
  const [log, setLog] = useState<LogEntry[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [currentInput, setCurrentInput] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [party, setParty] = useState<PartyMember[]>([])
  const [combatState, setCombatState] = useState<CombatState | null>(null)
  const [restartKey, setRestartKey] = useState(0)
  const [qrMember, setQrMember] = useState<PartyMember | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  // Map state — scene + tokens — refreshed every 4s and on move commit.
  const [mapScene, setMapScene] = useState<SceneData | null>(null)
  const [mapTokens, setMapTokens] = useState<MapToken[]>([])
  // Turn queue state
  const [turnQueue, setTurnQueue] = useState<string[]>([])
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0)
  const [committedActions, setCommittedActions] = useState<Record<string, string>>({})
  const [pendingPlayerActions, setPendingPlayerActions] = useState<Record<string, ActionRequired>>({})
  const [sceneSuggestions, setSceneSuggestions] = useState<string[]>([])
  const [nudgeText, setNudgeText] = useState<string | null>(null)
  const [isAskingDM, setIsAskingDM] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevIsTypingRef = useRef(false)
  // Ref for typewriter so the keydown handler can skip it
  const typewriterRef = useRef<{
    interval: ReturnType<typeof setInterval> | null
    fullText: string
    pendingActions: ActionRequired[]
  }>({ interval: null, fullText: '', pendingActions: [] })

  const sessionId = session.session_id

  function handleInsertName(name: string) {
    const input = inputRef.current
    if (!input) return
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const newValue = input.value.slice(0, start) + name + input.value.slice(end)
    setInput(newValue)
    setTimeout(() => {
      input.setSelectionRange(start + name.length, start + name.length)
      input.focus()
    }, 0)
  }

  // Fetch active scene + tokens for the host map.
  const fetchMap = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/map`)
      if (!res.ok) return
      const data: { scene: SceneData | null; tokens: MapToken[] } = await res.json()
      setMapScene(data.scene)
      setMapTokens(Array.isArray(data.tokens) ? data.tokens : [])
    } catch {
      // silent — polling
    }
  }, [sessionId])

  useEffect(() => {
    fetchMap()
    const interval = setInterval(fetchMap, 4000)
    return () => clearInterval(interval)
  }, [fetchMap])

  // Fetch party data (for sidebar + character buttons)
  const fetchParty = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/party`)
      if (!res.ok) return
      const data: PartyMember[] = await res.json()
      setParty(data)
    } catch {
      // silent — polling
    }
  }, [sessionId])

  useEffect(() => {
    fetchParty()
    const interval = setInterval(fetchParty, 5000)
    return () => clearInterval(interval)
  }, [fetchParty])

  // Load history + restore game state on mount (PER-01/PER-02)
  useEffect(() => {
    async function loadHistory() {
      try {
        const [logRes, stateRes] = await Promise.all([
          fetch(`/api/event-log?session_id=${encodeURIComponent(sessionId)}`),
          fetch(`/api/sessions/${sessionId}/state`),
        ])

        if (logRes.ok) {
          const data: Array<{ player_input: string; ai_response: unknown; created_at: string }> =
            await logRes.json()

          const entries: LogEntry[] = data.map((row) => {
            const response = row.ai_response as DMResponse | null
            return {
              player_input: row.player_input,
              narration: response?.narration ?? JSON.stringify(row.ai_response),
              isHistory: true,
              created_at: row.created_at,
            }
          })
          setLog(entries)
        }

        // Restore combat state from DB (PER-02)
        if (stateRes.ok) {
          const gameState = await stateRes.json()
          if (gameState?.combat_state) {
            const cs = gameState.combat_state as CombatState
            setCombatState(cs.active ? cs : null)
          }
        }
      } catch (err) {
        console.error('Failed to load history:', err)
      } finally {
        setLoadingHistory(false)
      }
    }

    loadHistory()
  }, [sessionId])

  // Auto-fire the scenario's opening kick on first turn.
  // Keep these strings in sync with lib/scenarios/registry.ts.
  useEffect(() => {
    if (loadingHistory) return
    if (log.length > 0 || isStreaming || isTyping) return
    const kicks: Record<string, string> = {
      'wild-sheep-chase':
        '[DM]: Begin the adventure. Set the scene at The Wooly Flagon tavern in Millhaven.',
      'blackthorn-clan':
        "[DM]: Open Scenario 1 — from Tarric's perspective.",
      'random-encounter':
        '[DM]: Combat test mode. Invent a party of 4 adventurers — give them names and classes (Fighter, Rogue, Cleric, Wizard). They are ambushed on a forest road by 3 bandits and a bandit captain. Roll initiative for all enemies. Request initiative rolls from each player character. Begin combat.',
    }
    let kick: string | undefined = session.scenario_id ? kicks[session.scenario_id] : undefined
    if (!kick) {
      if (session.name === 'The Wild Sheep Chase') kick = kicks['wild-sheep-chase']
      else if (session.name.startsWith('Random Encounter')) kick = kicks['random-encounter']
      else if (session.name.includes('Blackthorn')) kick = kicks['blackthorn-clan']
    }
    if (kick) handleSubmit(kick)
  }, [loadingHistory, restartKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom whenever log changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  // UX-03: Typewriter skip on Space/Enter while typing
  useEffect(() => {
    if (!isTyping) return

    function handleSkip(e: globalThis.KeyboardEvent) {
      if (e.key !== ' ' && e.key !== 'Enter') return
      // Only skip if not focused on the input field
      if (document.activeElement === inputRef.current) return
      e.preventDefault()

      const { interval, fullText } = typewriterRef.current
      if (interval !== null) {
        clearInterval(interval)
        typewriterRef.current.interval = null
      }
      // Instantly complete the narration
      setLog((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last && !last.error) {
          updated[updated.length - 1] = { ...last, narration: fullText }
        }
        return updated
      })
      setIsTyping(false)
    }

    document.addEventListener('keydown', handleSkip)
    return () => document.removeEventListener('keydown', handleSkip)
  }, [isTyping])

  function startTypewriter(narration: string) {
    if (!narration) {
      setIsTyping(false)
      return
    }

    typewriterRef.current.fullText = narration
    let index = 0
    setIsTyping(true)

    const interval = setInterval(() => {
      index += 1
      setLog((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last) {
          updated[updated.length - 1] = {
            ...last,
            narration: narration.slice(0, index),
          }
        }
        return updated
      })
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

      if (index >= narration.length) {
        clearInterval(interval)
        typewriterRef.current.interval = null
        setIsTyping(false)
      }
    }, 20)

    typewriterRef.current.interval = interval
  }

  async function handleSubmit(overrideText?: string) {
    const trimmed = (overrideText ?? input).trim()
    if (!trimmed || isStreaming || isTyping) return

    const effectiveInput = trimmed

    setInput('')
    setIsStreaming(true)
    setCurrentInput(effectiveInput)

    try {
      const response = await fetch('/api/dm-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_input: effectiveInput,
          session_id: sessionId,
          game_state: null,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue

          const jsonStr = line.slice('data: '.length)
          let parsed: { token?: string; done?: boolean; response?: DMResponse; error?: string }

          try {
            parsed = JSON.parse(jsonStr)
          } catch {
            continue
          }

          if (parsed.token !== undefined) {
            // Silently discard tokens — show only the thinking indicator while streaming
          } else if (parsed.done && parsed.response) {
            const narration = parsed.response.narration
            setLog((prev) => [
              ...prev,
              { player_input: effectiveInput, narration: '' },
            ])
            setIsStreaming(false)
            setCurrentInput('')
            // Extract and set combat state
            if (parsed.response.combat_state !== undefined) {
              setCombatState(
                parsed.response.combat_state.active ? parsed.response.combat_state : null
              )
            }
            // Store all actions and suggestions for turn queue init after typewriter
            typewriterRef.current.pendingActions = parsed.response.actions_required ?? []
            setSceneSuggestions(parsed.response.scene_suggestions ?? [])
            startTypewriter(narration)
          } else if (parsed.error) {
            setLog((prev) => [
              ...prev,
              { player_input: effectiveInput, narration: '', error: parsed.error },
            ])
            setIsStreaming(false)
            setCurrentInput('')
          }
        }
      }

      // If stream ended without a done event, finalize with an empty narration
      setIsStreaming((stillStreaming) => {
        if (stillStreaming) {
          setLog((prev) => [
            ...prev,
            { player_input: effectiveInput, narration: '' },
          ])
          setCurrentInput('')
          return false
        }
        return stillStreaming
      })
    } catch (err) {
      console.error('Streaming error:', err)
      setLog((prev) => [
        ...prev,
        {
          player_input: effectiveInput,
          narration: '',
          error: 'Connection error. Please try again.',
        },
      ])
      setIsStreaming(false)
      setCurrentInput('')
    }
  }

  const handleRestart = useCallback(() => {
    setLog([])
    setCombatState(null)
    setTurnQueue([])
    setCurrentTurnIdx(0)
    setCommittedActions({})
    setPendingPlayerActions({})
    setSceneSuggestions([])
    setNudgeText(null)
    setRestartKey(k => k + 1)
  }, [])

  // Initialize turn queue when typewriter finishes
  useEffect(() => {
    const justFinished = prevIsTypingRef.current && !isTyping
    prevIsTypingRef.current = isTyping
    if (!justFinished || isStreaming || party.length === 0) return

    const pendingActions = typewriterRef.current.pendingActions
    const targeted = pendingActions.filter((a) => a.player).map((a) => a.player as string)
    const queue =
      targeted.length > 0
        ? party.filter((m) => targeted.includes(m.character_name)).map((m) => m.character_name)
        : [...party].sort(() => Math.random() - 0.5).map((m) => m.character_name)

    const actionMap: Record<string, ActionRequired> = {}
    pendingActions.forEach((a) => { if (a.player) actionMap[a.player] = a })

    setTurnQueue(queue)
    setCurrentTurnIdx(0)
    setCommittedActions({})
    setPendingPlayerActions(actionMap)
    setNudgeText(null)
    typewriterRef.current.pendingActions = []
  }, [isTyping, isStreaming, party]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePlayerSubmit() {
    if (!input.trim() || isStreaming || isTyping) return

    const currentPlayer = turnQueue[currentTurnIdx]

    // No active turn queue — direct submit
    if (!currentPlayer || turnQueue.length === 0) {
      handleSubmit()
      return
    }

    const pendingAction = pendingPlayerActions[currentPlayer]
    const trimmed = input.trim()
    const rollNum = Number(trimmed)
    const isRollPending = pendingAction?.type === 'roll'
    const isNumeric = trimmed !== '' && Number.isInteger(rollNum) && rollNum >= 1

    // During a roll prompt, non-numeric input is a question — send as aside without consuming the turn.
    if (isRollPending && !isNumeric) {
      setInput('')
      handleAskDM(trimmed)
      return
    }

    const effectiveInput = isRollPending && isNumeric
      ? `[${currentPlayer}] rolled ${rollNum} — ${pendingAction.description}`
      : `[${currentPlayer}]: ${trimmed}`
    const newCommitted = { ...committedActions, [currentPlayer]: effectiveInput }
    setInput('')
    setNudgeText(null)
    setCommittedActions(newCommitted)

    const allDone = turnQueue.every((p) => p in newCommitted)
    if (allDone) {
      const combined = turnQueue.map((p) => newCommitted[p]).join('\n')
      setTurnQueue([])
      setCurrentTurnIdx(0)
      setCommittedActions({})
      setPendingPlayerActions({})
      setSceneSuggestions([])
      handleSubmit(combined)
    } else {
      setCurrentTurnIdx((prev) => prev + 1)
    }
  }

  async function handleAskDM(questionText?: string) {
    const currentPlayer = turnQueue[currentTurnIdx]
    if (!currentPlayer || isStreaming || isTyping || isAskingDM) return
    setIsAskingDM(true)
    setNudgeText(null)

    const prompt = questionText
      ? `[${currentPlayer}] asks the Guide: ${questionText}`
      : `[${currentPlayer}] aside: Just a nudge — one sentence, narrator voice. What might ${currentPlayer} notice or want to consider right now? Don't decide for them.`

    try {
      const res = await fetch('/api/dm-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_input: prompt,
          session_id: sessionId,
        }),
      })
      if (!res.ok || !res.body) throw new Error()

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const p = JSON.parse(line.slice('data: '.length))
            if (p.done && p.response?.narration) setNudgeText(p.response.narration)
          } catch { /* */ }
        }
      }
    } catch { /* silent */ }
    setIsAskingDM(false)
  }

  const isBusy = isStreaming || isTyping

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-serif overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 bg-gray-900 border-b border-gray-800 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-wide text-purple-400">
            {session.name} &mdash; Guide Screen
          </h1>
          {session.name === 'Random Encounter' && (
            <button
              onClick={handleRestart}
              className="text-xs text-gray-400 hover:text-gray-200 border border-gray-600 rounded px-2 py-0.5"
            >
              ↺ Restart
            </button>
          )}
        </div>
        <button
          onClick={() => setShowHistory(true)}
          className="text-xs text-gray-400 hover:text-purple-400 border border-gray-700 hover:border-purple-700 rounded px-2.5 py-1 transition-colors"
          title="View session history"
        >
          📜 History
        </button>
      </header>

      {/* Main content: narration and map each take half the remaining width.
           Sidebar stays on the far right. Input bar lives in the footer. */}
      <div className="flex flex-1 overflow-hidden">
        {/* Narration column — equal share of remaining width with map. */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6 min-h-0">
          {loadingHistory && (
            <p className="text-gray-500 text-sm italic">Loading session history...</p>
          )}

          {!loadingHistory && log.length === 0 && !isBusy && (
            <p className="text-gray-600 text-sm italic">
              The adventure awaits. What do you do?
            </p>
          )}

          {log.map((entry, i) => {
            const isLastEntry = i === log.length - 1
            const showCursor = isTyping && isLastEntry && !entry.error
            // System tags are never surfaced verbatim. [Movement] and
            // [RATING_CHANGE] are noise for players; [DM] kicks are author
            // metadata that gives the scenario away.
            const pi = entry.player_input ?? ''
            if (pi.startsWith('[Movement]') || pi.startsWith('[RATING_CHANGE]')) {
              return null
            }
            const isDmKick = pi.startsWith('[DM]:')
            const displayInput = isDmKick
              ? renderDmKickHeader(pi)
              : pi
            return (
              <div key={i} className="space-y-2">
                {isDmKick ? (
                  <p className="text-purple-300 text-xs uppercase tracking-widest font-semibold">{displayInput}</p>
                ) : (
                  <p className="text-gray-400 text-sm">
                    <span className="mr-2 text-gray-600">&gt;</span>
                    {displayInput}
                  </p>
                )}
                {entry.error ? (
                  <p className="text-red-400 text-sm italic">{entry.error}</p>
                ) : (
                  // UX-03: text-lg for better group readability
                  <p className="text-gray-100 text-lg leading-relaxed whitespace-pre-wrap">
                    {entry.narration}
                    {showCursor && (
                      <span className="inline-block w-2 h-5 bg-purple-400 ml-1 animate-pulse align-middle" />
                    )}
                  </p>
                )}
              </div>
            )
          })}

          {isStreaming && (
            <div className="space-y-2">
              <p className="text-gray-400 text-sm">
                <span className="mr-2 text-gray-600">&gt;</span>
                {currentInput}
              </p>
              <div className="flex items-center gap-1 text-purple-500 text-sm italic">
                <span>The Guide is thinking...</span>
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </main>
        </div>

        {/* Map column — sits between narration and the party sidebar. */}
        {mapScene && (
          <div className="flex-1 flex items-center justify-center bg-gray-950 border-l border-gray-800 p-2 min-w-0">
            <Map
              sessionId={sessionId}
              scene={mapScene}
              tokens={mapTokens}
              activeTokenId={(() => {
                const top = combatState?.initiative?.[0]
                if (!top) return null
                const tok = mapTokens.find((t) => t.name === top.name)
                return tok?.id ?? null
              })()}
              onMoveCommitted={fetchMap}
            />
          </div>
        )}

        {/* UX-01: Party status sidebar — hidden on mobile */}
        <PartySidebar sessionId={sessionId} onInsertName={handleInsertName} combatState={combatState} onShowQR={setQrMember} />
      </div>

      {/* Session history drawer (PER-03) */}
      {showHistory && (
        <HistoryDrawer log={log} onClose={() => setShowHistory(false)} />
      )}

      {/* QR re-join modal */}
      {qrMember && (
        <QRPlayerModal member={qrMember} onClose={() => setQrMember(null)} />
      )}

      {/* Turn queue strip */}
      {turnQueue.length > 0 && (
        <TurnQueueStrip
          queue={turnQueue}
          currentIdx={currentTurnIdx}
          committed={committedActions}
          party={party}
        />
      )}

      {/* Input bar */}
      <footer className="flex-shrink-0 px-6 py-4 bg-gray-900 border-t border-gray-800">
        {(() => {
          const activeMember = party.find((m) => m.character_name === turnQueue[currentTurnIdx])
          const activePlayerName = activeMember?.character_name ?? null
          const activePlayerClass = activeMember?.class ?? null
          const placeholder = isBusy
            ? 'The Guide is speaking...'
            : activePlayerName
            ? `What does ${activePlayerName} do...`
            : 'What do you do?'

          const activePendingAction = activePlayerName ? pendingPlayerActions[activePlayerName] : null

          return (
            <div className="max-w-4xl mx-auto space-y-3">
              {/* Active player header */}
              {activePlayerName && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-purple-300">{activePlayerName}</span>
                    {activePlayerClass && (
                      <span className="text-xs text-gray-500 capitalize">{activePlayerClass}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleAskDM()}
                    disabled={isBusy || isAskingDM}
                    className="text-xs text-gray-500 hover:text-purple-400 transition-colors disabled:opacity-40"
                  >
                    {isAskingDM ? 'asking...' : 'Ask the DM →'}
                  </button>
                </div>
              )}

              {/* Pending action banner */}
              {activePendingAction && !isBusy && (
                <div className="flex items-start gap-3 px-3 py-2.5 bg-gray-800/80 border border-purple-700/50 rounded-lg">
                  <span className="text-lg leading-none mt-0.5">
                    {activePendingAction.type === 'roll' ? '🎲' : activePendingAction.type === 'confirm' ? '❓' : '⚡'}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide">
                      {activePendingAction.type === 'roll' ? 'Roll 1d20' : activePendingAction.type === 'confirm' ? 'Clarification needed' : 'Decision needed'}
                    </p>
                    <p className="text-sm text-gray-200 mt-0.5">{activePendingAction.description}</p>
                  </div>
                </div>
              )}

              {/* DM nudge response */}
              {nudgeText && (
                <p className="text-sm text-gray-400 italic leading-relaxed border-l-2 border-purple-700/50 pl-3">
                  {nudgeText}
                </p>
              )}

              {/* Suggestion chips — hidden when a roll is pending */}
              {sceneSuggestions.length > 0 && !isBusy && !activePendingAction && (
                <div className="flex flex-wrap gap-2">
                  {sceneSuggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(s); inputRef.current?.focus() }}
                      className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded-full transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Input row */}
              <div className="flex gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePlayerSubmit() }}
                  placeholder={
                    isBusy ? 'The Guide is speaking...'
                    : activePendingAction?.type === 'roll' ? 'Enter roll result, or ask the Guide a question...'
                    : placeholder
                  }
                  disabled={isBusy}
                  className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-600 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
                />
                <button
                  onClick={handlePlayerSubmit}
                  disabled={isBusy || !input.trim()}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </div>
          )
        })()}
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root page — orchestrates screens
// ---------------------------------------------------------------------------

function DMScreenInner() {
  const searchParams = useSearchParams()
  const [screen, setScreen] = useState<AppScreen>('creation')
  const [session, setSession] = useState<SessionInfo | null>(null)

  // If ?session_id= is present (e.g. coming back from character-create),
  // fetch the session and jump straight to the lobby.
  useEffect(() => {
    const id = searchParams.get('session_id')
    if (!id) return

    fetch(`/api/sessions/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        setSession(data as SessionInfo)
        setScreen('lobby')
        // Clean the URL without reloading so the address bar doesn't stay cluttered
        window.history.replaceState({}, '', '/')
      })
      .catch(() => { /* fall through to creation screen */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSessionCreated(info: SessionInfo) {
    setSession(info)
    setScreen('lobby')
  }

  function handleStartAdventure() {
    setScreen('narration')
  }

  if (screen === 'creation' || !session) {
    return <SessionCreationModal onCreated={handleSessionCreated} />
  }

  if (screen === 'lobby') {
    return <LobbyScreen session={session} onStartAdventure={handleStartAdventure} />
  }

  return <NarrationScreen session={session} />
}

export default function DMScreen() {
  return (
    <Suspense fallback={null}>
      <DMScreenInner />
    </Suspense>
  )
}
