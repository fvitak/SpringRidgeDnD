'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
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

interface DMResponse {
  narration: string
  actions_required?: unknown
  state_changes?: unknown
  dm_rolls?: unknown
  combat_state?: unknown
}

interface LogEntry {
  player_input: string
  narration: string
  error?: string
  isHistory?: boolean
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
          <label className="block text-sm font-medium text-gray-300">Adventure Name</label>
          <input
            type="text"
            value={adventureName}
            onChange={(e) => setAdventureName(e.target.value)}
            className="w-full bg-gray-800 text-gray-100 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
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

                <div className="text-center">
                  {joined ? (
                    <p className="text-amber-400 font-semibold text-sm">
                      {playerName ?? 'Joined'}
                    </p>
                  ) : (
                    <p className="text-gray-500 text-sm italic">Waiting...</p>
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
// Narration / DM Screen
// ---------------------------------------------------------------------------

function NarrationScreen({ session }: { session: SessionInfo }) {
  const [log, setLog] = useState<LogEntry[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [currentInput, setCurrentInput] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const sessionId = session.session_id

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

  // Auto-scroll to bottom whenever log changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  function startTypewriter(narration: string) {
    if (!narration) {
      setIsTyping(false)
      return
    }

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
        setIsTyping(false)
      }
    }, 20)
  }

  async function handleSubmit() {
    const trimmed = input.trim()
    if (!trimmed || isStreaming || isTyping) return

    setInput('')
    setIsStreaming(true)
    setCurrentInput(trimmed)

    try {
      const response = await fetch('/api/dm-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_input: trimmed,
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
              { player_input: trimmed, narration: '' },
            ])
            setIsStreaming(false)
            setCurrentInput('')
            startTypewriter(narration)
          } else if (parsed.error) {
            setLog((prev) => [
              ...prev,
              { player_input: trimmed, narration: '', error: parsed.error },
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
            { player_input: trimmed, narration: '' },
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
          player_input: trimmed,
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

      {/* Narration log */}
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
                <p className="text-gray-100 leading-relaxed whitespace-pre-wrap">
                  {entry.narration}
                  {showCursor && (
                    <span className="inline-block w-2 h-4 bg-amber-400 ml-1 animate-pulse align-middle" />
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

      {/* Fixed bottom input bar */}
      <footer className="flex-shrink-0 px-6 py-4 bg-gray-900 border-t border-gray-800">
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
            onClick={handleSubmit}
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
