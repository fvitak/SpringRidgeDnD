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
  const [streamingText, setStreamingText] = useState('')
  const [currentInput, setCurrentInput] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

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

  // Auto-scroll to bottom whenever log or streaming text changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log, streamingText])

  async function handleSubmit() {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    setInput('')
    setIsStreaming(true)
    setStreamingText('')
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
            setStreamingText((prev) => prev + parsed.token)
          } else if (parsed.done && parsed.response) {
            const narration = parsed.response.narration
            setLog((prev) => [
              ...prev,
              { player_input: trimmed, narration },
            ])
            setStreamingText('')
            setIsStreaming(false)
            setCurrentInput('')
          } else if (parsed.error) {
            setLog((prev) => [
              ...prev,
              { player_input: trimmed, narration: '', error: parsed.error },
            ])
            setStreamingText('')
            setIsStreaming(false)
            setCurrentInput('')
          }
        }
      }

      // If stream ended without a done event, finalize with whatever we streamed
      setIsStreaming((stillStreaming) => {
        if (stillStreaming) {
          setLog((prev) => [
            ...prev,
            { player_input: trimmed, narration: '' },
          ])
          setStreamingText('')
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
      setStreamingText('')
      setIsStreaming(false)
      setCurrentInput('')
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-serif overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 bg-gray-900 border-b border-gray-800 shadow-md">
        <h1 className="text-lg font-semibold tracking-wide text-amber-400">
          The Wild Sheep Chase &mdash; DM Screen
        </h1>
      </header>

      {/* Narration log */}
      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {loadingHistory && (
          <p className="text-gray-500 text-sm italic">Loading session history...</p>
        )}

        {!loadingHistory && log.length === 0 && !isStreaming && (
          <p className="text-gray-600 text-sm italic">
            The adventure awaits. What do you do?
          </p>
        )}

        {log.map((entry, i) => (
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
              </p>
            )}
          </div>
        ))}

        {/* Streaming entry */}
        {isStreaming && (
          <div className="space-y-2">
            <p className="text-gray-400 text-sm">
              <span className="mr-2 text-gray-600">&gt;</span>
              {currentInput}
            </p>
            {streamingText ? (
              <p className="text-gray-100 leading-relaxed whitespace-pre-wrap">
                {streamingText}
                <span className="inline-block w-2 h-4 bg-amber-400 ml-1 animate-pulse align-middle" />
              </p>
            ) : (
              <div className="flex items-center gap-1 text-amber-500 text-sm italic">
                <span>The DM is thinking</span>
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Fixed bottom input bar */}
      <footer className="flex-shrink-0 px-6 py-4 bg-gray-900 border-t border-gray-800">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="What do you do?"
            className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-600 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSubmit}
            disabled={isStreaming || input.trim() === ''}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  )
}
