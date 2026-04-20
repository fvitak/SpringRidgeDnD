'use client'

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import QRCode from 'qrcode'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppScreen = 'creation' | 'lobby' | 'narration'

interface SessionInfo {
  session_id: string
  join_token: string
  player_count: number
  name: string
}

interface PlayerSlot {
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
}

interface LogEntry {
  player_input: string
  narration: string
  error?: string
  isHistory?: boolean
}

interface PartyMember {
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
}: {
  sessionId: string
  onInsertName: (name: string) => void
  combatState: CombatState | null
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
            className="bg-gray-800 rounded-xl p-3 space-y-2 border border-gray-700"
          >
            {/* Name + intox */}
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-semibold text-gray-100 truncate leading-tight">
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
      {/* NPCs in scene */}
      {npcs.length > 0 && (
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
                <span className="text-sm font-medium text-gray-200 group-hover:text-amber-400 transition-colors block leading-tight">
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

function SessionCreationModal({ onCreated }: { onCreated: (info: SessionInfo) => void }) {
  const [adventureName, setAdventureName] = useState('The Wild Sheep Chase')
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(4)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleBeginAdventure() {
    setIsCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: adventureName, player_count: playerCount }),
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
        name: adventureName,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center p-6 z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg p-8 space-y-8">
        {/* Title */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold text-amber-400 font-serif tracking-wide">
            Spring Ridge
          </h1>
          <p className="text-gray-400 text-sm">AI Dungeon Master</p>
        </div>

        {/* Adventure name */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">Adventure</label>
          <select
            value={adventureName}
            onChange={(e) => setAdventureName(e.target.value)}
            className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          >
            <option value="The Wild Sheep Chase">The Wild Sheep Chase</option>
            <option value="Random Encounter">Random Encounter (Combat Test)</option>
          </select>
        </div>

        {/* Player count */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">Number of Players</label>
          <div className="grid grid-cols-3 gap-3">
            {([2, 3, 4] as const).map((n) => (
              <button
                key={n}
                onClick={() => setPlayerCount(n)}
                className={`rounded-xl border-2 py-5 text-2xl font-bold transition-all ${
                  playerCount === n
                    ? 'border-amber-500 bg-amber-500/10 text-amber-400 shadow-lg shadow-amber-500/20'
                    : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        {/* Begin button */}
        <button
          onClick={handleBeginAdventure}
          disabled={isCreating || !adventureName.trim()}
          className="w-full py-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl transition-colors shadow-lg"
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
        const data: Array<{ slot: number; character_name: string }> = await res.json()
        if (!cancelled) setPlayers(data)
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
        <h1 className="text-2xl font-bold text-amber-400 tracking-wide">{session.name}</h1>
        <p className="text-gray-400 text-sm mt-1">Players — scan to join</p>
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
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-gray-700 bg-gray-900'
                }`}
              >
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">
                  Player {slot}
                </p>

                {qrUrl ? (
                  <QRCodeImage url={qrUrl} size={140} />
                ) : (
                  <div className="w-[140px] h-[140px] rounded-lg bg-gray-800 animate-pulse" />
                )}

                <div className="text-center w-full">
                  {joined ? (
                    <p className="text-amber-400 font-semibold text-sm">
                      {playerName ?? 'Joined'}
                    </p>
                  ) : (
                    <>
                      <p className="text-gray-500 text-sm italic mb-2">Waiting...</p>
                      <a
                        href={`/character-create?session_id=${session.session_id}&slot=${slot}`}
                        className="inline-block w-full text-xs text-gray-400 hover:text-amber-400 border border-gray-700 hover:border-amber-600 rounded-lg px-2 py-1.5 transition-colors"
                      >
                        Create on this PC
                      </a>
                    </>
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
          className="px-8 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-lg"
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
          <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-700 rounded px-1.5 py-0.5">
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
                  ? 'bg-amber-500/10 border-amber-600'
                  : 'bg-gray-800 border-gray-700'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs" title={c.is_player ? 'Player' : 'NPC'}>
                  {c.is_player ? '🛡' : '⚔'}
                </span>
                <span
                  className={`text-xs font-semibold truncate flex-1 ${
                    isActive ? 'text-amber-300' : 'text-gray-200'
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
// Roll Prompt Modal
// ---------------------------------------------------------------------------

function RollPromptModal({
  action,
  onSubmit,
  onDismiss,
}: {
  action: ActionRequired
  onSubmit: (result: number) => void
  onDismiss: () => void
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const numVal = Number(value)
  const isValid = value.trim() !== '' && Number.isInteger(numVal) && numVal >= 1 && numVal <= 30

  function handleSubmitClick() {
    if (!isValid) return
    onSubmit(numVal)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && isValid) onSubmit(numVal)
    if (e.key === 'Escape') onDismiss()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-amber-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        {/* Header */}
        <div className="text-center">
          <p className="text-3xl mb-1">🎲</p>
          <h2 className="text-xl font-bold text-amber-400 tracking-wide uppercase">
            Roll Check!
          </h2>
        </div>

        {/* Player name */}
        {action.player && (
          <p className="text-center text-sm font-semibold text-gray-300">
            {action.player}
          </p>
        )}

        {/* Description */}
        <p className="text-gray-200 text-sm text-center leading-relaxed">
          {action.description}
        </p>

        {/* Number input */}
        <input
          ref={inputRef}
          type="number"
          min={1}
          max={30}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="1–30"
          className="w-full bg-gray-800 text-gray-100 placeholder-gray-600 border border-gray-700 rounded-lg px-4 py-3 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />

        {/* Submit button */}
        <button
          onClick={handleSubmitClick}
          disabled={!isValid}
          className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-colors shadow-lg"
        >
          Submit Roll
        </button>

        {/* Dismiss link */}
        <div className="text-center">
          <button
            onClick={onDismiss}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Narration / DM Screen
// ---------------------------------------------------------------------------

function NarrationScreen({ session }: { session: SessionInfo }) {
  const [log, setLog] = useState<LogEntry[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [currentInput, setCurrentInput] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [party, setParty] = useState<PartyMember[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)
  const [combatState, setCombatState] = useState<CombatState | null>(null)
  const [pendingRoll, setPendingRoll] = useState<ActionRequired | null>(null)
  const [rollInput, setRollInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Ref for typewriter so the keydown handler can skip it
  const typewriterRef = useRef<{
    interval: ReturnType<typeof setInterval> | null
    fullText: string
  }>({ interval: null, fullText: '' })

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

  // Load history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/event-log?session_id=${encodeURIComponent(sessionId)}`)
        if (!res.ok) throw new Error('Failed to fetch history')
        const data: Array<{ player_input: string; ai_response: unknown; created_at: string }> =
          await res.json()

        const entries: LogEntry[] = data.map((row) => {
          const response = row.ai_response as DMResponse | null
          return {
            player_input: row.player_input,
            narration: response?.narration ?? JSON.stringify(row.ai_response),
            isHistory: true,
          }
        })

        setLog(entries)
      } catch (err) {
        console.error('Failed to load history:', err)
      } finally {
        setLoadingHistory(false)
      }
    }

    loadHistory()
  }, [sessionId])

  // Auto-trigger combat for Random Encounter mode
  useEffect(() => {
    if (loadingHistory) return
    if (session.name !== 'Random Encounter') return
    if (log.length > 0 || isStreaming || isTyping) return
    handleSubmit('[DM]: Combat test mode. Invent a party of 4 adventurers — give them names and classes (Fighter, Rogue, Cleric, Wizard). They are ambushed on a forest road by 3 bandits and a bandit captain. Roll initiative for all enemies. Request initiative rolls from each player character. Begin combat.')
  }, [loadingHistory]) // eslint-disable-line react-hooks/exhaustive-deps

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

    // UX-02: Prepend selected character name if any
    const effectiveInput = selectedCharacter
      ? `[${selectedCharacter}]: ${trimmed}`
      : trimmed

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
            // Check for a roll action
            const rollAction = parsed.response.actions_required?.find((a) => a.type === 'roll')
            if (rollAction) setPendingRoll(rollAction)
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

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  const isBusy = isStreaming || isTyping

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-serif overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 bg-gray-900 border-b border-gray-800 shadow-md flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-wide text-amber-400">
          {session.name} &mdash; DM Screen
        </h1>
      </header>

      {/* Main content: narration + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Narration log — flex-1 fills remaining width */}
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
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
            return (
              <div key={i} className="space-y-2">
                <p className="text-gray-400 text-sm">
                  <span className="mr-2 text-gray-600">&gt;</span>
                  {entry.player_input}
                </p>
                {entry.error ? (
                  <p className="text-red-400 text-sm italic">{entry.error}</p>
                ) : (
                  // UX-03: text-lg for better group readability
                  <p className="text-gray-100 text-lg leading-relaxed whitespace-pre-wrap">
                    {entry.narration}
                    {showCursor && (
                      <span className="inline-block w-2 h-5 bg-amber-400 ml-1 animate-pulse align-middle" />
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
              <div className="flex items-center gap-1 text-amber-500 text-sm italic">
                <span>The DM is thinking</span>
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </main>

        {/* UX-01: Party status sidebar — hidden on mobile */}
        <PartySidebar sessionId={sessionId} onInsertName={handleInsertName} combatState={combatState} />
      </div>

      {/* Roll prompt modal */}
      {pendingRoll && (
        <RollPromptModal
          action={pendingRoll}
          onSubmit={(result) => {
            const formatted = `[${pendingRoll.player ?? 'Party'}] rolled ${result} — ${pendingRoll.description}`
            setPendingRoll(null)
            setRollInput('')
            handleSubmit(formatted)
          }}
          onDismiss={() => {
            setPendingRoll(null)
            setRollInput('')
          }}
        />
      )}

      {/* Fixed bottom input bar */}
      <footer className="flex-shrink-0 px-6 py-4 bg-gray-900 border-t border-gray-800">
        {/* UX-02: Character selector row */}
        {party.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 max-w-4xl mx-auto">
            {party.map((member) => (
              <button
                key={member.slot}
                onClick={() =>
                  setSelectedCharacter(
                    selectedCharacter === member.character_name ? null : member.character_name
                  )
                }
                className={`text-xs px-2 py-1 rounded transition-colors border ${
                  selectedCharacter === member.character_name
                    ? 'bg-amber-500 border-amber-400 text-gray-900 font-semibold'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {member.character_name}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3 max-w-4xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isBusy ? 'The DM is speaking...' : 'What do you do?'}
            className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-600 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          <button
            onClick={() => handleSubmit()}
            disabled={isBusy || input.trim() === ''}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root page — orchestrates screens
// ---------------------------------------------------------------------------

export default function DMScreen() {
  const [screen, setScreen] = useState<AppScreen>('creation')
  const [session, setSession] = useState<SessionInfo | null>(null)

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
