'use client'

/**
 * Host-screen tactical map. Renders a scene image + grid overlay + tokens.
 *
 * RESPONSIVE: cell size is computed from the container's measured size so the
 * map always fits both the available width and height. ResizeObserver keeps
 * it in sync when the surrounding layout changes.
 *
 * Click-to-move flow:
 *   1. Click a friendly token → "selected"; legal cells light green.
 *   2. Hover a cell → path preview drawn over the grid.
 *   3. Click a green cell → POST /api/sessions/:id/move; on success, animate.
 *   4. Server rejects → toast with the validator's reason.
 *
 * No phone version — per ADR 2026-04-28, map is host-only.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { validateMove, type MapToken } from '@/lib/movement/validate-move'
import type { WalkableMask } from '@/lib/movement/walkable'

export interface SceneData {
  id: string
  name: string
  image_path: string
  grid_cols: number
  grid_rows: number
  cell_px?: number
  walkable: WalkableMask
}

interface MapProps {
  sessionId: string
  scene: SceneData
  tokens: MapToken[]
  /** Token id of the active player (highlighted ring + clickable). */
  activeTokenId?: string | null
  /** Refresh callback when a move commits. Caller re-fetches game_state. */
  onMoveCommitted?: () => void
  /** When set, clicking any cell places this token there (bypasses movement validation). */
  placingTokenId?: string | null
  /** Called after a successful place. */
  onPlaceCommitted?: () => void
}

// Lower bound so a cramped layout still produces clickable cells.
const MIN_CELL = 20
// Upper bound so a giant monitor doesn't make tokens look comical.
const MAX_CELL = 56

export default function Map({
  sessionId,
  scene,
  tokens,
  activeTokenId,
  onMoveCommitted,
  placingTokenId,
  onPlaceCommitted,
}: MapProps) {
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)
  const [committing, setCommitting] = useState(false)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Responsive cell size — recomputed on container resize.
  const [cellSize, setCellSize] = useState<number>(38)

  // Measure the parent container and pick a cell size that fits both axes.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const recompute = () => {
      const parent = el.parentElement
      if (!parent) return
      const w = parent.clientWidth
      const h = parent.clientHeight
      if (w === 0 || h === 0) return
      // Subtract a small margin so we don't kiss the edges.
      const fitW = Math.floor((w - 16) / scene.grid_cols)
      const fitH = Math.floor((h - 16) / scene.grid_rows)
      const next = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.min(fitW, fitH)))
      setCellSize(next)
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    if (el.parentElement) ro.observe(el.parentElement)
    window.addEventListener('resize', recompute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recompute)
    }
  }, [scene.grid_cols, scene.grid_rows])

  // Reset selection when the active token changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setSelectedTokenId(null)
    setHoverCell(null)
  }, [activeTokenId])

  // Escape clears the selected chip — easy bail-out if you reconsider a move.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedTokenId(null)
        setHoverCell(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const width = scene.grid_cols * cellSize
  const height = scene.grid_rows * cellSize

  const selectedToken = useMemo(
    () => tokens.find((t) => t.id === selectedTokenId) ?? null,
    [selectedTokenId, tokens],
  )

  // Hover preview: validate the move and produce path/legal cells.
  const preview = useMemo(() => {
    if (!selectedToken || !hoverCell) return null
    const visibleTokens = tokens.filter((t) => (t as MapToken & { discovered?: boolean }).discovered !== false)
    return validateMove({
      mask: scene.walkable,
      tokens: visibleTokens,
      mover: { tokenId: selectedToken.id, speedSquares: 6, movementUsed: 0 },
      target: hoverCell,
    })
  }, [selectedToken, hoverCell, scene.walkable, tokens])

  // Pre-compute legal cells for the selected token (within speed budget).
  const legalCells = useMemo(() => {
    if (!selectedToken) return new Set<string>()
    const out = new Set<string>()
    const visibleTokens = tokens.filter((t) => (t as MapToken & { discovered?: boolean }).discovered !== false)
    for (let y = 0; y < scene.grid_rows; y++) {
      for (let x = 0; x < scene.grid_cols; x++) {
        if (x === selectedToken.x && y === selectedToken.y) continue
        const r = validateMove({
          mask: scene.walkable,
          tokens: visibleTokens,
          mover: { tokenId: selectedToken.id, speedSquares: 6, movementUsed: 0 },
          target: { x, y },
        })
        if (r.ok) out.add(`${x},${y}`)
      }
    }
    return out
  }, [selectedToken, scene.grid_cols, scene.grid_rows, scene.walkable, tokens])

  const handleCellClick = useCallback(
    async (x: number, y: number) => {
      // Placement mode: bypass movement validation, directly set position.
      if (placingTokenId) {
        if (committing) return
        setCommitting(true)
        try {
          await fetch(`/api/sessions/${sessionId}/tokens/${placingTokenId}/place`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x, y }),
          })
          setHoverCell(null)
          onPlaceCommitted?.()
        } catch {
          setErrorToast('Place request failed.')
          setTimeout(() => setErrorToast(null), 3500)
        } finally {
          setCommitting(false)
        }
        return
      }

      if (!selectedToken) return
      if (committing) return
      setCommitting(true)
      try {
        const res = await fetch(`/api/sessions/${sessionId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_id: selectedToken.id, target: { x, y } }),
        })
        const data = await res.json()
        if (!data.ok) {
          setErrorToast(data.explanation ?? 'Move rejected.')
          setTimeout(() => setErrorToast(null), 3500)
        } else {
          setSelectedTokenId(null)
          setHoverCell(null)
          onMoveCommitted?.()
        }
      } catch {
        setErrorToast('Move request failed.')
        setTimeout(() => setErrorToast(null), 3500)
      } finally {
        setCommitting(false)
      }
    },
    [placingTokenId, selectedToken, sessionId, committing, onMoveCommitted, onPlaceCommitted],
  )

  const handleTokenClick = useCallback(
    (tokenId: string) => {
      const t = tokens.find((tt) => tt.id === tokenId)
      if (!t) return
      if (activeTokenId && t.id !== activeTokenId) return
      if (t.is_friendly === false) return
      setSelectedTokenId((cur) => (cur === tokenId ? null : tokenId))
    },
    [tokens, activeTokenId],
  )

  return (
    <div ref={containerRef} className="relative inline-block bg-black/30 rounded-xl p-2 border border-gray-800">
      <div
        className="relative select-none rounded-lg overflow-hidden"
        style={{
          width,
          height,
          backgroundImage: `url(${scene.image_path})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
        }}
        onMouseLeave={() => setHoverCell(null)}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="absolute inset-0"
        >
          {Array.from({ length: scene.grid_cols + 1 }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={i * cellSize}
              y1={0}
              x2={i * cellSize}
              y2={height}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: scene.grid_rows + 1 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={i * cellSize}
              x2={width}
              y2={i * cellSize}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
          ))}

          {selectedToken &&
            Array.from(legalCells).map((k) => {
              const [x, y] = k.split(',').map(Number)
              return (
                <rect
                  key={`lc-${k}`}
                  x={x * cellSize}
                  y={y * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill="rgba(80,200,120,0.25)"
                  stroke="rgba(80,200,120,0.6)"
                  strokeWidth={1}
                  pointerEvents="none"
                />
              )
            })}

          {preview && preview.ok && (
            <>
              {preview.path.map((c, i) => (
                <rect
                  key={`p-${i}`}
                  x={c.x * cellSize}
                  y={c.y * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill={preview.provokes.length > 0 ? 'rgba(245,158,11,0.45)' : 'rgba(80,200,120,0.55)'}
                  pointerEvents="none"
                />
              ))}
            </>
          )}

          {preview && !preview.ok && hoverCell && (
            <rect
              x={hoverCell.x * cellSize}
              y={hoverCell.y * cellSize}
              width={cellSize}
              height={cellSize}
              fill="rgba(220,38,38,0.4)"
              stroke="rgba(220,38,38,0.85)"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          )}

          {/* Placement mode hover highlight */}
          {placingTokenId && hoverCell && (
            <rect
              x={hoverCell.x * cellSize}
              y={hoverCell.y * cellSize}
              width={cellSize}
              height={cellSize}
              fill="rgba(59,130,246,0.45)"
              stroke="rgba(59,130,246,0.9)"
              strokeWidth={2}
              pointerEvents="none"
            />
          )}

          {Array.from({ length: scene.grid_rows }).map((_, y) =>
            Array.from({ length: scene.grid_cols }).map((_, x) => (
              <rect
                key={`cell-${x}-${y}`}
                x={x * cellSize}
                y={y * cellSize}
                width={cellSize}
                height={cellSize}
                fill="transparent"
                style={{ cursor: placingTokenId ? 'crosshair' : selectedToken ? 'pointer' : 'default' }}
                onMouseEnter={() => {
                  if (placingTokenId) setHoverCell({ x, y })
                  else if (selectedToken) setHoverCell({ x, y })
                }}
                onClick={() => {
                  if (placingTokenId) handleCellClick(x, y)
                  else if (selectedToken) handleCellClick(x, y)
                }}
              />
            )),
          )}
        </svg>

        {tokens.filter((t) => (t as MapToken & { discovered?: boolean }).discovered !== false).map((t) => {
          const isSelected = t.id === selectedTokenId
          const isActive = t.id === activeTokenId
          const isFriendly = t.is_friendly !== false
          const tokenColor = (t as MapToken & { color?: string }).color ?? (isFriendly ? '#5B7FBF' : '#A23B3B')
          const initials = t.name
            .split(/\s+/)
            .map((p) => p[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase()
          // Scale the token text size with cell size so it stays legible.
          const fontSize = Math.max(9, Math.floor(cellSize * 0.32))
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTokenClick(t.id)}
              className={`absolute rounded-full flex items-center justify-center text-white font-bold border-2 transition-all ${isFriendly ? 'cursor-pointer' : 'cursor-default'} ${isSelected ? 'ring-4 ring-purple-400/80 scale-110' : ''} ${isActive && !isSelected ? 'ring-2 ring-yellow-300 animate-pulse' : ''} ${t.id === placingTokenId ? 'ring-4 ring-blue-400 animate-pulse' : ''}`}
              style={{
                left: t.x * cellSize + 2,
                top: t.y * cellSize + 2,
                width: cellSize - 4,
                height: cellSize - 4,
                fontSize,
                background: tokenColor,
                borderColor: isFriendly ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)',
              }}
              title={`${t.name} — HP ${(t as MapToken & { hp?: number }).hp ?? '?'}/${(t as MapToken & { max_hp?: number }).max_hp ?? '?'}`}
            >
              {initials}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between mt-1 text-xs text-gray-400 px-1">
        <span>{scene.name}</span>
        {placingTokenId ? (
          <span className="text-blue-400">
            Click any cell to place {tokens.find((t) => t.id === placingTokenId)?.name ?? 'token'}
          </span>
        ) : selectedToken ? (
          preview && !preview.ok ? (
            <span className="text-red-400">{preview.explanation}</span>
          ) : preview && preview.ok ? (
            <span className="text-green-400">
              {preview.cost} squares
              {preview.provokes.length > 0 && ` — provokes from ${preview.provokes.map((p) => p.name).join(', ')}`}
            </span>
          ) : (
            <span>Click a green square to move {selectedToken.name}</span>
          )
        ) : (
          <span>Click your token to move.</span>
        )}
      </div>

      {errorToast && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg">
          {errorToast}
        </div>
      )}
    </div>
  )
}
