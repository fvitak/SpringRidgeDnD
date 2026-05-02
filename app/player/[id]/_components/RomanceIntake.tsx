'use client'

// ---------------------------------------------------------------------------
// RomanceIntake — three-step "matchmaking quiz" card flow (PIV-07).
//
// Shown on the player phone when:
//   - the session has Date Night Mode enabled, AND
//   - the character_romance row is missing or incomplete.
//
// Three steps:
//   1. Turn-ons picker (deterministic shuffle of 20 cards, pick 3 via
//      a horizontal carousel + visible picked pile + "That's me" button)
//   2. Pet Peeves player-rolled d6 input — server fresh-shuffles the
//      eligible pool per roll, two rolls total, deck reshuffles between
//      so the same d6 number rarely yields the same peeve
//   3. First Impressions player-rolled d20 input — server resolves with
//      per-roll bucket randomization (outcome-to-bucket mapping randomized
//      per preconception; bucket sizes 6/7/7 stay fixed)
//
// Privacy: every POST to /api/characters/[id]/{turn-ons,pet-peeves,
// first-impression} carries `actor: characterId` for the owner check.
// We do NOT pass the partner's id. We never display the AP number —
// the API doesn't return it; the summary is a band-flavoured one-liner.
//
// See docs/design/dm-pivot/screens.md §3 (matchmaking quiz card pattern)
// and copy.md §6a (microcopy library) for the canonical UX spec.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

// ---------------------------------------------------------------------------
// Step 1: Turn-ons picker
// ---------------------------------------------------------------------------

interface Step1Props {
  characterId: string
  turnOns: TurnOnCard[]
  onComplete: () => void
}

function TurnOnsStep({ characterId, turnOns, onComplete }: Step1Props) {
  // Deterministic shuffle — must NOT change across refreshes (same seed). The
  // hashString(characterId) seed and shuffleDeterministic() output are
  // load-bearing; do not replace.
  const shuffled = useMemo(
    () => shuffleDeterministic(turnOns, hashString(characterId)),
    [turnOns, characterId],
  )

  // Carousel index (0..shuffled.length-1). Unlike the previous one-way stack,
  // the player can navigate freely back and forth.
  const [cardIndex, setCardIndex] = useState(0)
  const [picked, setPicked] = useState<number[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = shuffled.length
  const card = shuffled[cardIndex]
  const isPicked = card ? picked.includes(card.roll) : false
  const canPickMore = picked.length < 3

  // Touch gesture handling — tracks the start coords of a single touch and
  // computes a horizontal swipe on touch end. Threshold is 40px so vertical
  // scrolling on the page doesn't trigger nav.
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)

  const goNext = useCallback(() => {
    setCardIndex((i) => Math.min(i + 1, total - 1))
  }, [total])

  const goPrev = useCallback(() => {
    setCardIndex((i) => Math.max(i - 1, 0))
  }, [])

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    if (!t) return
    touchStartXRef.current = t.clientX
    touchStartYRef.current = t.clientY
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const startX = touchStartXRef.current
    const startY = touchStartYRef.current
    touchStartXRef.current = null
    touchStartYRef.current = null
    if (startX == null || startY == null) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - startX
    const dy = t.clientY - startY
    // Only treat as a swipe if the gesture is mostly horizontal — keeps
    // page-level scrolling natural.
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) goNext()
    else goPrev()
  }

  // Keyboard arrows — desktop / iPad-with-keyboard fallback.
  useEffect(() => {
    if (showConfirm) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, showConfirm])

  function togglePickCurrent() {
    if (!card) return
    if (picked.includes(card.roll)) {
      // Un-pick (frees a slot, re-disables confirm if we drop below 3).
      setPicked((prev) => prev.filter((r) => r !== card.roll))
      return
    }
    if (picked.length >= 3) return
    setPicked((prev) => [...prev, card.roll])
  }

  // Tap a chip in the pile -> jump the carousel to that card. We considered
  // direct-removal-on-chip-tap, but jumping reveals the full effect text and
  // gives the player a chance to confirm via "Remove" — fewer accidental
  // un-picks on a phone where chips are small.
  function jumpToRoll(roll: number) {
    const idx = shuffled.findIndex((c) => c.roll === roll)
    if (idx >= 0) setCardIndex(idx)
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
            onClick={() => setShowConfirm(false)}
            disabled={submitting}
            className="w-full py-3 text-sm text-gray-400 hover:text-gray-200 underline disabled:opacity-40"
          >
            Back to picking
          </button>
          <button
            onClick={handleStartOver}
            disabled={submitting}
            className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 underline disabled:opacity-40"
          >
            Start over
          </button>
        </div>
      </div>
    )
  }

  // ---------- Carousel ----------
  const pickedCards = picked
    .map((r) => shuffled.find((c) => c.roll === r))
    .filter((c): c is TurnOnCard => !!c)
  const remaining = 3 - picked.length
  const hint =
    remaining === 3
      ? 'Pick three.'
      : remaining === 2
      ? 'Pick two more.'
      : remaining === 1
      ? 'Pick one more.'
      : 'Looking good.'

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 1 of 3</p>
        <h2 className="text-2xl font-bold text-pink-200">
          Pick three turn-ons{' '}
          <span className="text-gray-500 font-normal">({picked.length}/3)</span>
        </h2>
        <p className="text-sm text-gray-400">
          Swipe or use the arrows. Tap a card to add or remove it.
        </p>
      </header>

      {/* Position indicator: card N of 20 + a slim progress bar. */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Card <span className="text-pink-300 font-semibold">{cardIndex + 1}</span> of {total}
        </span>
        <span className="italic">{hint}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-gray-800 overflow-hidden">
        <div
          className="h-full bg-pink-500 transition-all"
          style={{ width: `${((cardIndex + 1) / total) * 100}%` }}
        />
      </div>

      {/* Carousel row — current card centered, prev/next arrow buttons on
          either side. Touch swipe on the card itself. */}
      <div className="flex items-stretch gap-2">
        <button
          onClick={goPrev}
          disabled={cardIndex === 0}
          aria-label="Previous turn-on"
          className="shrink-0 w-10 rounded-2xl bg-gray-900 border border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-pink-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-2xl"
        >
          ‹
        </button>

        {card && (
          <div
            key={card.roll}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className={`flex-1 rounded-3xl border-2 p-6 min-h-[280px] flex flex-col justify-between shadow-lg transition-all duration-200 select-none ${
              isPicked
                ? 'bg-gradient-to-b from-pink-950/60 to-gray-950 border-pink-500'
                : 'bg-gradient-to-b from-gray-900 to-gray-950 border-pink-900/50'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="text-2xl font-bold text-pink-200 leading-snug">
                  &ldquo;{card.name}&rdquo;
                </p>
                {isPicked && (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest bg-pink-500 text-white px-2 py-1 rounded-full">
                    Picked
                  </span>
                )}
              </div>
              <p className="text-base text-gray-300 mt-4 leading-relaxed">{card.effect_text}</p>
              <p className="text-xs text-gray-500 mt-3 italic">Adds {card.dice} when this fires.</p>
            </div>
          </div>
        )}

        <button
          onClick={goNext}
          disabled={cardIndex >= total - 1}
          aria-label="Next turn-on"
          className="shrink-0 w-10 rounded-2xl bg-gray-900 border border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-pink-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-2xl"
        >
          ›
        </button>
      </div>

      {/* Primary action — That's me / Remove for the current card. */}
      <button
        onClick={togglePickCurrent}
        disabled={!isPicked && !canPickMore}
        className={`w-full py-4 font-bold text-base rounded-2xl transition-colors min-h-[52px] ${
          isPicked
            ? 'bg-gray-800 hover:bg-gray-700 border border-pink-700 text-pink-200'
            : 'bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white'
        }`}
      >
        {isPicked
          ? 'Remove'
          : canPickMore
          ? "That's me"
          : 'List is full — remove one to swap'}
      </button>

      {/* Picked pile — sticky strip at the bottom of the flow showing chosen
          turn-ons in pick order. Trophy shelf, not waste bin. Tap a chip to
          jump the carousel to that card; the player then taps "Remove" on
          the card itself to un-pick. */}
      <div className="rounded-2xl bg-gray-900/70 border border-pink-900/40 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <p className="font-semibold uppercase tracking-widest text-pink-400">
            Your picks{' '}
            <span className="text-gray-500 normal-case font-normal">
              ({picked.length} of 3)
            </span>
          </p>
          {picked.length > 0 && (
            <button
              onClick={handleStartOver}
              className="text-gray-500 hover:text-gray-300 underline"
            >
              Clear
            </button>
          )}
        </div>
        {pickedCards.length === 0 ? (
          <p className="text-xs text-gray-600 italic px-1 py-2">
            Nothing picked yet. Browse the deck and tap the ones that fit.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pickedCards.map((c, i) => {
              const isCurrent = card && c.roll === card.roll
              return (
                <button
                  key={c.roll}
                  onClick={() => jumpToRoll(c.roll)}
                  className={`px-3 py-2 rounded-full text-xs font-semibold border transition-colors ${
                    isCurrent
                      ? 'bg-pink-500 border-pink-400 text-white'
                      : 'bg-pink-900/40 border-pink-800 text-pink-200 hover:bg-pink-800/60'
                  }`}
                  aria-label={`Jump to ${c.name}`}
                >
                  <span className="mr-1 opacity-60">{i + 1}.</span>
                  {c.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirm — disabled until 3 picked, with a soft hint underneath. */}
      <div className="space-y-1">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={picked.length !== 3}
          className="w-full py-4 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base rounded-2xl transition-colors min-h-[52px]"
        >
          {picked.length === 3 ? 'Looks good →' : `Pick ${remaining} more`}
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
  // The player rolls a physical d6 twice — once per peeve. After each
  // submission the server fresh-shuffles the eligible pool and returns
  // the picked peeve. Reshuffling between rolls is the whole point: the
  // same d6 number on the second roll yields a different peeve.
  const TOTAL_ROLLS = 2
  const [rollIdx, setRollIdx] = useState(0) // 0 or 1; equals "current roll number - 1"
  const [d6Input, setD6Input] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [revealed, setRevealed] = useState<PetPeeveCard[]>([])
  const [showReveal, setShowReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const d6Value = Number(d6Input)
  const d6Valid = Number.isInteger(d6Value) && d6Value >= 1 && d6Value <= 6

  async function handleSubmitD6() {
    if (!d6Valid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/characters/${characterId}/pet-peeves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: characterId, d6: d6Value }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`)
        setSubmitting(false)
        return
      }
      const picked: PetPeeveCard | undefined = data.pet_peeve
      if (!picked) {
        setError('Server did not return a pet peeve.')
        setSubmitting(false)
        return
      }
      setRevealed((prev) => [...prev, picked])
      setShowReveal(true)
      setSubmitting(false)
      setD6Input('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  function handleNextAfterReveal() {
    setShowReveal(false)
    if (rollIdx + 1 >= TOTAL_ROLLS) {
      onComplete()
      return
    }
    setRollIdx((i) => i + 1)
  }

  // Reveal screen — shown after each successful d6 submission.
  if (showReveal) {
    const last = revealed[revealed.length - 1]
    if (!last) {
      // Defensive — should not happen.
      return null
    }
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 2 of 3</p>
          <h2 className="text-2xl font-bold text-pink-200">
            Pet peeve {revealed.length} of {TOTAL_ROLLS}
          </h2>
        </header>

        <div className="rounded-3xl bg-gradient-to-b from-pink-950/40 to-gray-950 border-2 border-pink-900/60 p-6 space-y-3 transition-all duration-500">
          <p className="text-2xl font-bold text-pink-200 leading-snug">
            &ldquo;{last.name}&rdquo;
          </p>
          <p className="text-base text-gray-300 leading-relaxed">{last.effect_text}</p>
          <p className="text-xs text-gray-500 italic">Subtracts {last.dice} when this fires.</p>
        </div>

        {/* Show the previous reveal too, if we're on roll 2, so the player
            sees their full pile so far. */}
        {revealed.length > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Earlier pick</p>
            {revealed.slice(0, -1).map((p) => (
              <div key={p.roll} className="rounded-xl bg-gray-900 border border-gray-800 p-3">
                <p className="text-sm font-bold text-pink-200">{p.name}</p>
                <p className="text-xs text-gray-400 mt-1">{p.effect_text}</p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleNextAfterReveal}
          className="w-full py-4 bg-pink-600 hover:bg-pink-500 text-white font-bold text-base rounded-2xl transition-colors min-h-[52px]"
        >
          {revealed.length >= TOTAL_ROLLS ? 'Continue' : 'Roll the second d6'}
        </button>
      </div>
    )
  }

  // Prompt screen — d6 numeric keypad input.
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-400">Step 2 of 3</p>
        <h2 className="text-2xl font-bold text-pink-200">
          Roll a d6 <span className="text-gray-500 font-normal">({rollIdx + 1}/{TOTAL_ROLLS})</span>
        </h2>
        <p className="text-sm text-gray-400">
          Roll a physical d6 (1–6) and enter the number. The deck reshuffles each roll, so
          the same number can mean different things.
        </p>
      </header>

      <div className="rounded-3xl bg-gradient-to-b from-gray-900 to-gray-950 border-2 border-pink-900/30 p-6 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Your d6
        </p>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={d6Input}
          onChange={(e) => {
            // Strip non-digits and clamp to 1 char.
            const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 1)
            setD6Input(raw)
          }}
          placeholder="?"
          autoFocus
          className="w-full text-center text-6xl font-bold bg-gray-950 border-2 border-pink-900/60 rounded-2xl py-6 text-pink-200 placeholder-gray-700 focus:outline-none focus:border-pink-500"
        />
        <p className="text-xs text-gray-600 italic">
          Private — angle your screen if your partner is nearby.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-xl p-3">
          {error}
        </p>
      )}

      <button
        onClick={handleSubmitD6}
        disabled={!d6Valid || submitting}
        className="w-full py-4 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base rounded-2xl transition-colors min-h-[52px]"
      >
        {submitting ? 'Shuffling…' : d6Valid ? 'Reveal' : 'Enter 1–6'}
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
  const [d20Input, setD20Input] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultBand, setResultBand] = useState<ApBand | null>(null)
  const [components, setComponents] = useState<ImpressionComponent[]>([])
  const [showSummary, setShowSummary] = useState(false)

  const TOTAL_ROLLS = 3
  const currentRollIdx = rolls.length

  const d20Value = Number(d20Input)
  const d20Valid = Number.isInteger(d20Value) && d20Value >= 1 && d20Value <= 20

  function handleSubmitD20() {
    if (!d20Valid || rolls.length >= TOTAL_ROLLS) return
    setRolls((prev) => [...prev, d20Value])
    setD20Input('')
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
        <div className="rounded-3xl bg-gradient-to-b from-gray-900 to-gray-950 border-2 border-pink-900/30 p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Roll a d20 — preconception {currentRollIdx + 1} of {TOTAL_ROLLS}
          </p>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={d20Input}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
              setD20Input(raw)
            }}
            placeholder="?"
            autoFocus
            className="w-full text-center text-6xl font-bold bg-gray-950 border-2 border-pink-900/60 rounded-2xl py-6 text-pink-200 placeholder-gray-700 focus:outline-none focus:border-pink-500"
          />
          <button
            onClick={handleSubmitD20}
            disabled={!d20Valid}
            className="w-full py-4 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base rounded-2xl transition-colors min-h-[52px]"
          >
            {d20Valid ? 'Lock in' : 'Enter 1–20'}
          </button>
        </div>
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
