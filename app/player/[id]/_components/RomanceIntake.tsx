'use client'

// ---------------------------------------------------------------------------
// RomanceIntake — three-step "matchmaking quiz" card flow (PIV-07).
//
// Shown on the player phone when:
//   - the session has Date Night Mode enabled, AND
//   - the character_romance row is missing or incomplete.
//
// Three steps:
//   1. Turn-ons picker (deterministic shuffle of 20 cards, pick 3)
//   2. Pet Peeves auto-roll (the watch-it-happen moment)
//   3. First Impressions roll (3 sequential client-side d20s)
//
// Privacy: every POST to /api/characters/[id]/{turn-ons,pet-peeves,
// first-impression} carries `actor: characterId` for the owner check.
// We do NOT pass the partner's id. We never display the AP number —
// the API doesn't return it; the summary is a band-flavoured one-liner.
//
// See docs/design/dm-pivot/screens.md §3 (matchmaking quiz card pattern)
// and copy.md §6a (microcopy library) for the canonical UX spec.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'

// ---------------------------------------------------------------------------
// Types — minimal client mirrors of the API responses. Kept narrow on purpose
// (the privacy gate enforces shape; we don't want to retype the full server
// model here).
// ---------------------------------------------------------------------------

interface TurnOnCard {
  roll: number
  name: string
  effect_text: string
  dice: string
}

interface PetPeeveCard {
  roll: number
  name: string
  effect_text: string
  dice: string
}

interface ApBand {
  label: string
  behaviour: string
}

interface RomanceTablesPublic {
  // We only fetch the turn_ons table for Step 1; the pet peeve and impression
  // copy is returned by their respective POSTs.
  turn_ons: TurnOnCard[]
}

// ---------------------------------------------------------------------------
// Deterministic shuffle — keeps the card order stable across refreshes.
// (Per UX: "use a deterministic seed per character so refresh doesn't
// reshuffle and confuse the player".)
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  // Tiny djb2 — sufficient for "stable but un-guessable shuffle order".
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6D2B79F5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleDeterministic<T>(arr: T[], seed: number): T[] {
  const out = arr.slice()
  const rand = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function rollD20(): number {
  // Crypto-safe (uses the same primitive the server uses for its own rolls).
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  // Rejection sampling for unbiased 1-20.
  const max = Math.floor(0x100000000 / 20) * 20
  let v = buf[0]
  while (v >= max) {
    crypto.getRandomValues(buf)
    v = buf[0]
  }
  return (v % 20) + 1
}

// ---------------------------------------------------------------------------
// Step 1: Turn-ons picker
// ---------------------------------------------------------------------------

interface Step1Props {
  characterId: string
  turnOns: TurnOnCard[]
  onComplete: () => void
}

function TurnOnsStep({ characterId, turnOns, onComplete }: Step1Props) {
  const shuffled = useMemo(
    () => shuffleDeterministic(turnOns, hashString(characterId)),
    [turnOns, characterId],
  )
  const [cardIndex, setCardIndex] = useState(0)
  const [picked, setPicked] = useState<number[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const card = shuffled[cardIndex]
  const allCardsExhausted = cardIndex >= shuffled.length

  // Auto-show confirm once 3 are picked.
  useEffect(() => {
    if (picked.length === 3) setShowConfirm(true)
  }, [picked])

  function handlePick() {
    if (!card) return
    if (picked.includes(card.roll)) {
      // Skip duplicates (shouldn't happen since we advance, but be safe).
      setCardIndex((i) => i + 1)
      return
    }
    const next = [...picked, card.roll]
    setPicked(next)
    setCardIndex((i) => i + 1)
  }

  function handleSkip() {
    setCardIndex((i) => i + 1)
  }

  function handleStartOver() {
    setPicked([])
    setCardIndex(0)
    setShowConfirm(false)
    setError(null)
  }

  async function handleConfirm() {
    if (picked.length !== 3) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/characters/${characterId}/turn-ons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: characterId, chosen_rolls: picked }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`)
        setSubmitting(false)
        return
      }
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  // ---------- Confirm screen ----------
  if (showConfirm) {
    const pickedCards = picked
      .map((r) => shuffled.find((c) => c.roll === r))
      .filter((c): c is TurnOnCard => !!c)
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 1 of 3</p>
          <h2 className="text-2xl font-bold text-pink-200">Lock these in?</h2>
          <p className="text-sm text-gray-400">Three turn-ons your character can&apos;t help but notice.</p>
        </header>

        <div className="space-y-3">
          {pickedCards.map((c) => (
            <div key={c.roll} className="rounded-2xl bg-gray-900 border border-pink-900/60 p-4">
              <p className="text-base font-bold text-pink-200">{c.name}</p>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">{c.effect_text}</p>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-xl p-3">
            {error}
          </p>
        )}

        <div className="space-y-2">
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full py-4 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base rounded-2xl transition-colors min-h-[52px]"
          >
            {submitting ? 'Locking in...' : 'Lock these in →'}
          </button>
          <button
            onClick={handleStartOver}
            disabled={submitting}
            className="w-full py-3 text-sm text-gray-500 hover:text-gray-300 underline disabled:opacity-40"
          >
            Start over
          </button>
        </div>
      </div>
    )
  }

  // ---------- Stack exhausted but fewer than 3 picked ----------
  if (allCardsExhausted && picked.length < 3) {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 1 of 3</p>
          <h2 className="text-2xl font-bold text-pink-200">Pick a few more</h2>
          <p className="text-sm text-gray-400">
            You&apos;ve only picked {picked.length}. Take another pass.
          </p>
        </header>
        <button
          onClick={handleStartOver}
          className="w-full py-4 bg-pink-700 hover:bg-pink-600 text-white font-bold rounded-2xl"
        >
          Start over
        </button>
      </div>
    )
  }

  // ---------- Card stack ----------
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 1 of 3</p>
        <h2 className="text-2xl font-bold text-pink-200">
          Pick three turn-ons <span className="text-gray-500 font-normal">({picked.length}/3)</span>
        </h2>
        <p className="text-sm text-gray-400">What does your character notice in someone?</p>
      </header>

      {/* Stack indicator */}
      <div className="flex justify-center gap-1.5">
        {shuffled.map((_, i) => (
          <span
            key={i}
            className={`block h-1.5 rounded-full transition-all ${
              i < cardIndex ? 'w-1.5 bg-gray-700' : i === cardIndex ? 'w-6 bg-pink-400' : 'w-1.5 bg-gray-800'
            }`}
          />
        ))}
      </div>

      {/* Card */}
      {card && (
        <div className="rounded-3xl bg-gradient-to-b from-gray-900 to-gray-950 border-2 border-pink-900/50 p-6 min-h-[280px] flex flex-col justify-between shadow-lg">
          <div>
            <p className="text-2xl font-bold text-pink-200 leading-snug">&ldquo;{card.name}&rdquo;</p>
            <p className="text-base text-gray-300 mt-4 leading-relaxed">{card.effect_text}</p>
            <p className="text-xs text-gray-500 mt-3 italic">Adds {card.dice} when this fires.</p>
          </div>
        </div>
      )}

      {/* Action buttons — minimum 44px tall per UX accessibility note */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleSkip}
          className="py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-semibold rounded-2xl transition-colors min-h-[52px]"
        >
          Pass
        </button>
        <button
          onClick={handlePick}
          disabled={picked.length >= 3}
          className="py-4 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white font-bold rounded-2xl transition-colors min-h-[52px]"
        >
          This me
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Pet Peeves auto-roll
// ---------------------------------------------------------------------------

interface Step2Props {
  characterId: string
  onComplete: () => void
}

function PetPeevesStep({ characterId, onComplete }: Step2Props) {
  const [phase, setPhase] = useState<'prompt' | 'rolling' | 'reveal'>('prompt')
  const [peeves, setPeeves] = useState<PetPeeveCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const [revealedCount, setRevealedCount] = useState(0)

  async function handleRoll() {
    setPhase('rolling')
    setError(null)
    try {
      const res = await fetch(`/api/characters/${characterId}/pet-peeves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: characterId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`)
        setPhase('prompt')
        return
      }
      setPeeves(data.pet_peeves ?? [])
      setPhase('reveal')
      // Stagger the reveal so cards flip in sequence.
      setTimeout(() => setRevealedCount(1), 600)
      setTimeout(() => setRevealedCount(2), 1400)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('prompt')
    }
  }

  if (phase === 'prompt') {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 2 of 3</p>
          <h2 className="text-2xl font-bold text-pink-200">Now roll for what bugs you</h2>
        </header>

        <div className="rounded-3xl bg-gradient-to-b from-gray-900 to-gray-950 border-2 border-pink-900/30 p-6">
          <p className="text-base text-gray-300 leading-relaxed">
            Two pet peeves, picked at random — you don&apos;t choose these. Your
            character will react when their partner triggers one.
          </p>
          <p className="text-xs text-gray-600 italic mt-3">
            Private — angle your screen if your partner is nearby.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-xl p-3">
            {error}
          </p>
        )}

        <button
          onClick={handleRoll}
          className="w-full py-4 bg-pink-600 hover:bg-pink-500 text-white font-bold text-base rounded-2xl transition-colors min-h-[52px]"
        >
          Roll
        </button>
      </div>
    )
  }

  if (phase === 'rolling') {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 2 of 3</p>
          <h2 className="text-2xl font-bold text-pink-200">Rolling…</h2>
        </header>
        <div className="rounded-3xl bg-gray-900 border-2 border-pink-900/40 p-10 flex justify-center gap-6">
          <span className="text-6xl animate-spin inline-block" style={{ animationDuration: '0.6s' }}>
            🎲
          </span>
          <span className="text-6xl animate-spin inline-block" style={{ animationDuration: '0.8s' }}>
            🎲
          </span>
        </div>
      </div>
    )
  }

  // Reveal
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 2 of 3</p>
        <h2 className="text-2xl font-bold text-pink-200">Your pet peeves</h2>
        <p className="text-sm text-gray-400">These will sting when your partner trips them.</p>
      </header>

      <div className="space-y-3">
        {peeves.map((p, idx) => (
          <div
            key={p.roll}
            className={`rounded-2xl border p-4 transition-all duration-500 ${
              idx < revealedCount
                ? 'bg-gray-900 border-pink-900/60 opacity-100 translate-y-0'
                : 'bg-gray-900/50 border-gray-800 opacity-0 translate-y-2'
            }`}
          >
            <p className="text-base font-bold text-pink-200">{p.name}</p>
            <p className="text-sm text-gray-400 mt-1 leading-relaxed">{p.effect_text}</p>
            <p className="text-xs text-gray-600 italic mt-2">Subtracts {p.dice} when this fires.</p>
          </div>
        ))}
      </div>

      <button
        onClick={onComplete}
        disabled={revealedCount < peeves.length}
        className="w-full py-4 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white font-bold text-base rounded-2xl transition-colors min-h-[52px]"
      >
        Continue
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: First Impressions
// ---------------------------------------------------------------------------

interface Step3Props {
  characterId: string
  onComplete: (band: ApBand | null) => void
}

interface ImpressionComponent {
  source: string
  delta: number
  detail: string
}

function FirstImpressionStep({ characterId, onComplete }: Step3Props) {
  const [rolls, setRolls] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultBand, setResultBand] = useState<ApBand | null>(null)
  const [components, setComponents] = useState<ImpressionComponent[]>([])
  const [showSummary, setShowSummary] = useState(false)

  const TOTAL_ROLLS = 3
  const currentRollIdx = rolls.length

  function handleRoll() {
    if (rolls.length >= TOTAL_ROLLS) return
    const r = rollD20()
    setRolls((prev) => [...prev, r])
  }

  async function handleSubmit() {
    if (rolls.length !== TOTAL_ROLLS) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/characters/${characterId}/first-impression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: characterId, rolls }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`)
        setSubmitting(false)
        return
      }
      // The API intentionally returns components + band only (no number).
      setComponents(data.components ?? [])
      setResultBand(data.current_ap_band ?? null)
      setShowSummary(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (showSummary) {
    // Band-flavoured one-liner. Per UX: "Do NOT show the AP number total".
    const bandFlavour: Record<string, string> = {
      exhausted: 'utterly worn out',
      cold: 'cold and superior',
      dismissive: 'unimpressed and snarky',
      distant: 'cool and aloof',
      polite: 'cautiously courteous',
      shy: 'shyly curious',
      flirtatious: 'cautiously curious',
      smitten: 'already a little starry-eyed',
      committed: 'completely smitten',
    }
    const flavour = resultBand ? bandFlavour[resultBand.label] ?? resultBand.label : 'figuring it out'

    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 3 of 3</p>
          <h2 className="text-2xl font-bold text-pink-200">First impressions</h2>
        </header>

        <div className="rounded-3xl bg-gradient-to-b from-pink-950/40 to-gray-950 border-2 border-pink-900/50 p-6 space-y-3">
          <p className="text-base text-gray-300 leading-relaxed">
            Your character starts out <span className="text-pink-200 font-bold">{flavour}</span>.
          </p>
          <p className="text-sm text-gray-500 italic">
            From here on, it&apos;s a feeling — not a number.
          </p>
        </div>

        {/* Per-preconception explainers (player-friendly) */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">What you noticed</p>
          {components
            .filter((c) => c.source.startsWith('preconception:'))
            .map((c, i) => (
              <div key={i} className="rounded-xl bg-gray-900 border border-gray-800 p-3">
                <p className="text-sm text-gray-300 leading-relaxed">{c.detail}</p>
                {c.delta !== 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {c.delta > 0 ? 'That landed well.' : 'That rubbed you wrong.'}
                  </p>
                )}
                {c.delta === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No strong feeling either way.</p>
                )}
              </div>
            ))}
        </div>

        <button
          onClick={() => onComplete(resultBand)}
          className="w-full py-4 bg-pink-600 hover:bg-pink-500 text-white font-bold text-base rounded-2xl transition-colors min-h-[52px]"
        >
          Continue to your sheet
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 3 of 3</p>
        <h2 className="text-2xl font-bold text-pink-200">
          Roll three impressions <span className="text-gray-500 font-normal">({rolls.length}/{TOTAL_ROLLS})</span>
        </h2>
        <p className="text-sm text-gray-400">
          What does your character think of their partner before they really know them?
        </p>
      </header>

      {/* Roll history */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: TOTAL_ROLLS }).map((_, i) => {
          const v = rolls[i]
          const isCurrent = i === currentRollIdx
          return (
            <div
              key={i}
              className={`aspect-square rounded-2xl border-2 flex items-center justify-center transition-all ${
                v !== undefined
                  ? 'bg-pink-900/30 border-pink-700 text-pink-200'
                  : isCurrent
                  ? 'bg-gray-900 border-pink-500 animate-pulse text-gray-600'
                  : 'bg-gray-900 border-gray-800 text-gray-700'
              }`}
            >
              <span className="text-3xl font-bold">{v ?? '?'}</span>
            </div>
          )
        })}
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-xl p-3">
          {error}
        </p>
      )}

      {rolls.length < TOTAL_ROLLS ? (
        <button
          onClick={handleRoll}
          className="w-full py-4 bg-pink-600 hover:bg-pink-500 text-white font-bold text-base rounded-2xl transition-colors min-h-[52px]"
        >
          Roll d20
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white font-bold text-base rounded-2xl transition-colors min-h-[52px]"
        >
          {submitting ? 'Working…' : 'See result'}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RomanceIntake — top-level orchestrator
// ---------------------------------------------------------------------------

interface RomanceIntakeProps {
  characterId: string
  initialStatus: {
    has_turn_ons: boolean
    has_pet_peeves: boolean
    has_first_impression: boolean
  }
  /** Called once all three steps are complete; the host page swaps to the sheet. */
  onComplete: () => void
}

export default function RomanceIntake({
  characterId,
  initialStatus,
  onComplete,
}: RomanceIntakeProps) {
  // Pick the next missing step. If all done, we shouldn't be mounted at all,
  // but defensive: bounce to onComplete.
  const initialStep = !initialStatus.has_turn_ons
    ? 1
    : !initialStatus.has_pet_peeves
    ? 2
    : !initialStatus.has_first_impression
    ? 3
    : 0
  const [step, setStep] = useState<0 | 1 | 2 | 3>(initialStep as 0 | 1 | 2 | 3)
  const [turnOns, setTurnOns] = useState<TurnOnCard[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (initialStep === 0) onComplete()
  }, [initialStep, onComplete])

  // Fetch the public turn-ons table for Step 1. We rely on the character's
  // own romance row endpoint — the turn_ons table itself isn't private.
  // (We piggy-back on the romance route by using viewer === id, then read
  // from a small bundled fetch.)
  useEffect(() => {
    if (step !== 1) return
    if (turnOns) return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(
          `/api/characters/${characterId}/romance/tables?viewer=${characterId}`,
        )
        if (!res.ok) {
          // Fall back: hit the romance GET (won't have turn_ons unless picked).
          // Surface a generic error in that case.
          setLoadError(`Couldn't load turn-on table (HTTP ${res.status}).`)
          return
        }
        const data = await res.json()
        if (!cancelled) setTurnOns(data.turn_ons ?? [])
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [step, characterId, turnOns])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-pink-900/40 px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-pink-300">Romance setup</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          A few quick picks before you meet your partner.
        </p>
      </header>

      <div className="px-4 py-6 max-w-md mx-auto">
        {step === 1 && (
          <>
            {!turnOns && !loadError && (
              <p className="text-sm text-gray-500 animate-pulse">Shuffling the deck…</p>
            )}
            {loadError && (
              <p className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-xl p-3">
                {loadError}
              </p>
            )}
            {turnOns && (
              <TurnOnsStep
                characterId={characterId}
                turnOns={turnOns}
                onComplete={() => setStep(2)}
              />
            )}
          </>
        )}
        {step === 2 && (
          <PetPeevesStep characterId={characterId} onComplete={() => setStep(3)} />
        )}
        {step === 3 && (
          <FirstImpressionStep
            characterId={characterId}
            onComplete={() => onComplete()}
          />
        )}
      </div>
    </div>
  )
}
