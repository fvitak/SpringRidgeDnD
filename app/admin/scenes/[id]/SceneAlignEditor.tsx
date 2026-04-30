'use client'

import { useRef, useState } from 'react'

interface SceneRow {
  id: string
  name: string
  image_path: string
  grid_cols: number
  grid_rows: number
  cell_px: number | null
  cell_w_px: number | null
  origin_x_px: number | null
  origin_y_px: number | null
}

interface Props {
  scene: SceneRow
}

interface Geometry {
  grid_cols: number
  grid_rows: number
  cell_h_px: number
  cell_w_px: number
  origin_x_px: number
  origin_y_px: number
}

function Field({
  label, value, min, max, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
      <label style={{ width: 110, fontSize: '0.85rem', color: '#111' }}>{label}</label>
      <button
        onClick={() => onChange(value - 1)}
        style={{ width: 26, height: 26, border: '1px solid #aaa', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, color: '#111' }}
      >−</button>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, maxWidth: 200 }}
      />
      <button
        onClick={() => onChange(value + 1)}
        style={{ width: 26, height: 26, border: '1px solid #aaa', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, color: '#111' }}
      >+</button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 64, padding: '0.2rem 0.4rem', fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid #ccc', borderRadius: 4, color: '#111' }}
      />
    </div>
  )
}

export default function SceneAlignEditor({ scene }: Props) {
  const cellH = scene.cell_px ?? 40
  const [geo, setGeo] = useState<Geometry>({
    grid_cols:   scene.grid_cols,
    grid_rows:   scene.grid_rows,
    cell_h_px:   cellH,
    cell_w_px:   scene.cell_w_px ?? cellH,
    origin_x_px: scene.origin_x_px ?? 0,
    origin_y_px: scene.origin_y_px ?? 0,
  })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)

  function set(key: keyof Geometry, value: number) {
    setGeo((prev) => ({ ...prev, [key]: value }))
  }

  function onImageLoad() {
    const el = imgRef.current
    if (el) setImgSize({ w: el.naturalWidth, h: el.naturalHeight })
  }

  const svgW = imgSize?.w ?? 800
  const svgH = imgSize?.h ?? 600
  const { grid_cols, grid_rows, cell_h_px, cell_w_px, origin_x_px, origin_y_px } = geo

  const vLines: number[] = []
  for (let i = 0; i <= grid_cols; i++) vLines.push(origin_x_px + i * cell_w_px)
  const hLines: number[] = []
  for (let i = 0; i <= grid_rows; i++) hLines.push(origin_y_px + i * cell_h_px)

  const maxDisplayW = Math.min(svgW, 1200)
  const scale = maxDisplayW / svgW

  async function handleSave() {
    setSaveState('saving')
    setSaveError(null)
    try {
      // cell_w_px requires migration 20260430000001 — omit until it's been run
      const payload: Record<string, number> = {
        grid_cols:   geo.grid_cols,
        grid_rows:   geo.grid_rows,
        cell_px:     geo.cell_h_px,
        origin_x_px: geo.origin_x_px,
        origin_y_px: geo.origin_y_px,
      }
      if (scene.cell_w_px !== null) payload.cell_w_px = geo.cell_w_px
      const res = await fetch(`/api/admin/scenes/${scene.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error ?? `HTTP ${res.status}`)
        setSaveState('error')
      } else {
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2500)
      }
    } catch (e) {
      setSaveError(String(e))
      setSaveState('error')
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1.25rem', padding: '1rem', background: '#f0f0f0', borderRadius: 8, maxWidth: 560 }}>
        <Field label="grid_cols"   value={geo.grid_cols}   min={1}    max={80}  onChange={(v) => set('grid_cols', v)} />
        <Field label="grid_rows"   value={geo.grid_rows}   min={1}    max={80}  onChange={(v) => set('grid_rows', v)} />
        <Field label="cell_h_px"   value={geo.cell_h_px}   min={8}    max={200} onChange={(v) => set('cell_h_px', v)} />
        <Field label="cell_w_px"   value={geo.cell_w_px}   min={8}    max={200} onChange={(v) => set('cell_w_px', v)} />
        {scene.cell_w_px === null && (
          <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '-0.25rem', marginBottom: '0.5rem', paddingLeft: 110 }}>
            Run migration 20260430000001 to save cell_w_px
          </p>
        )}
        <Field label="origin_x_px" value={geo.origin_x_px} min={-200} max={500} onChange={(v) => set('origin_x_px', v)} />
        <Field label="origin_y_px" value={geo.origin_y_px} min={-200} max={500} onChange={(v) => set('origin_y_px', v)} />

        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={handleSave}
            disabled={saveState === 'saving'}
            style={{
              padding: '0.4rem 1.2rem',
              background: saveState === 'saved' ? '#16a34a' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontFamily: 'monospace',
              cursor: saveState === 'saving' ? 'wait' : 'pointer',
            }}
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save'}
          </button>
          {saveState === 'error' && (
            <span style={{ color: '#dc2626', fontSize: '0.85rem' }}>{saveError}</span>
          )}
        </div>
      </div>

      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={scene.image_path}
          alt={scene.name}
          onLoad={onImageLoad}
          style={{ display: 'block', width: maxDisplayW, height: 'auto' }}
        />
        {imgSize && (
          <svg
            width={maxDisplayW}
            height={svgH * scale}
            viewBox={`0 0 ${svgW} ${svgH}`}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            {vLines.map((x, i) => (
              <line key={`v${i}`} x1={x} y1={0} x2={x} y2={svgH} stroke="rgba(255,0,0,0.5)" strokeWidth={1} />
            ))}
            {hLines.map((y, i) => (
              <line key={`h${i}`} x1={0} y1={y} x2={svgW} y2={y} stroke="rgba(255,0,0,0.5)" strokeWidth={1} />
            ))}
            <circle cx={origin_x_px} cy={origin_y_px} r={5} fill="rgba(255,0,0,0.8)" />
          </svg>
        )}
      </div>
    </div>
  )
}
