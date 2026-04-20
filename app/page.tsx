'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'

const SESSION_ID = process.env.NEXT_PUBLIC_SESSION_ID ?? 'default-session'

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

export default function DMScreen() {
  const [log, setLog] = useState<LogEntry[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [currentInput, setCurrentInput] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/event-log?session_id=${encodeURIComponent(SESSION_ID)}`)
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
  }, [])

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
          session_id: SESSION_ID,
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

  async function handleRestart() {
    if (!window.confirm('Start a new session? This will clear the current adventure.')) return
    try {
      await fetch('/api/restart', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: SESSION_ID }),
      })
    } catch (err) {
      console.error('Failed to restart session:', err)
    }
    setLog([])
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-serif overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 bg-gray-900 border-b border-gray-800 shadow-md flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-wide text-amber-400">
          The Wild Sheep Chase &mdash; DM Screen
        </h1>
        <button
          onClick={handleRestart}
          disabled={isBusy}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          New Session
        </button>
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
              {/* Player input */}
              <p className="text-gray-400 text-sm">
                <span className="mr-2 text-gray-600">&gt;</span>
                {entry.player_input}
              </p>
              {/* AI narration or error */}
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

        {/* Thinking indicator — shown while SSE tokens are streaming in */}
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
