'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CLASSES, RACES, ABILITY_SCORES, CLASS_STAT_DEFAULTS } from '@/lib/data/character-options'
import { QUIZ_QUESTIONS, scoreQuiz } from '@/lib/data/personality-quiz'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'class' | 'race' | 'stats' | 'quiz' | 'name' | 'done'

interface QuizAnswers {
  [questionId: number]: string[]  // trait tags from the selected answer
}

// ---------------------------------------------------------------------------
// Stat Assignment UI
// ---------------------------------------------------------------------------
// Tap-to-assign approach: tap a value from the pool, then tap a stat slot to
// place it. Works perfectly on mobile with no drag-and-drop complexity.

const STAT_LABELS: Record<string, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
}

const STAT_FULL_LABELS: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}

function modStr(score: number): string {
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

interface StatAssignmentProps {
  assignments: Record<string, number>
  onChange: (assignments: Record<string, number>) => void
}

function StatAdjuster({ assignments, onChange }: StatAssignmentProps) {
  function swapUp(stat: string) {
    const current = assignments[stat]
    const candidates = Object.entries(assignments)
      .filter(([s, v]) => s !== stat && v > current)
      .sort(([, a], [, b]) => a - b)
    if (candidates.length === 0) return
    const [targetStat, targetVal] = candidates[0]
    onChange({ ...assignments, [stat]: targetVal, [targetStat]: current })
  }

  function swapDown(stat: string) {
    const current = assignments[stat]
    const candidates = Object.entries(assignments)
      .filter(([s, v]) => s !== stat && v < current)
      .sort(([, a], [, b]) => b - a)
    if (candidates.length === 0) return
    const [targetStat, targetVal] = candidates[0]
    onChange({ ...assignments, [stat]: targetVal, [targetStat]: current })
  }

  return (
    <div className="space-y-2">
      {ABILITY_SCORES.map((stat) => {
        const value = assignments[stat] ?? 10
        const canUp = Object.values(assignments).some(v => v > value)
        const canDown = Object.values(assignments).some(v => v < value)

        return (
          <div key={stat} className="flex items-center bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
            <div className="flex-1">
              <span className="text-sm font-bold text-amber-500 uppercase tracking-wider">{STAT_LABELS[stat]}</span>
              <span className="text-xs text-gray-500 ml-2">{STAT_FULL_LABELS[stat]}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => swapDown(stat)}
                disabled={!canDown}
                className="w-9 h-9 rounded-full bg-gray-700 text-white font-bold text-xl disabled:opacity-25 hover:bg-gray-600 active:scale-95 transition-all flex items-center justify-center"
              >
                −
              </button>
              <div className="text-center w-12">
                <div className="text-2xl font-bold text-amber-400 tabular-nums">{value}</div>
                <div className="text-xs text-gray-400">{modStr(value)}</div>
              </div>
              <button
                onClick={() => swapUp(stat)}
                disabled={!canUp}
                className="w-9 h-9 rounded-full bg-gray-700 text-white font-bold text-xl disabled:opacity-25 hover:bg-gray-600 active:scale-95 transition-all flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main character creation component (inner, uses useSearchParams)
// ---------------------------------------------------------------------------

function CharacterCreateInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id') ?? ''
  const slotParam = searchParams.get('slot') ?? '1'
  const slot = parseInt(slotParam, 10) || 1

  const [step, setStep] = useState<Step>('class')
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [selectedRace, setSelectedRace] = useState<string>('')
  const [statAssignments, setStatAssignments] = useState<Record<string, number>>({})
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswers>({})
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [playerName, setPlayerName] = useState('')
  const [characterName, setCharacterName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [createdCharacter, setCreatedCharacter] = useState<{ name: string; cls: string } | null>(null)

  const totalQuestions = QUIZ_QUESTIONS.length

  // Derived: can proceed from stats step
  const allStatsAssigned = ABILITY_SCORES.every((s) => statAssignments[s] !== undefined)

  // Derived: quiz complete
  const quizComplete = Object.keys(quizAnswers).length === totalQuestions

  // Derive personality traits from quiz answers
  function getPersonalityTraits(): string[] {
    if (!quizComplete) return []
    const answerTraitArrays = QUIZ_QUESTIONS.map((q) => quizAnswers[q.id] ?? [])
    return scoreQuiz(answerTraitArrays)
  }

  async function handleSubmit() {
    if (!playerName.trim() || !characterName.trim()) return
    setSubmitting(true)
    setSubmitError('')

    const traits = getPersonalityTraits()

    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: playerName.trim(),
          characterName: characterName.trim(),
          classId: selectedClass,
          raceId: selectedRace,
          statAssignments,
          personalityTraits: traits,
          sessionId,
          slot,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setSubmitError(err.error ?? 'Something went wrong')
        setSubmitting(false)
        return
      }

      const cls = CLASSES.find((c) => c.id === selectedClass)?.name ?? selectedClass
      setCreatedCharacter({ name: characterName.trim(), cls })
      setStep('done')
    } catch {
      setSubmitError('Network error — please try again')
      setSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Progress indicator
  // ---------------------------------------------------------------------------
  const stepOrder: Step[] = ['class', 'race', 'stats', 'quiz', 'name']
  const currentStepIndex = stepOrder.indexOf(step)
  const progressPct = step === 'done' ? 100 : Math.round(((currentStepIndex) / stepOrder.length) * 100)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (step === 'done' && createdCharacter) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">⚔️</div>
        <h1 className="text-3xl font-bold text-amber-400 mb-2">You&apos;re in!</h1>
        <p className="text-xl text-white mb-1">{createdCharacter.name}</p>
        <p className="text-lg text-gray-400 mb-8">Level 1 {createdCharacter.cls}</p>
        <p className="text-gray-300 text-sm max-w-xs">
          Your character has been created. Return to the main screen to begin your adventure.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <h1 className="text-center text-amber-400 font-bold text-lg tracking-wide">
          Create Your Character
        </h1>
        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span className={step === 'class' ? 'text-amber-400' : ''}>Class</span>
          <span className={step === 'race' ? 'text-amber-400' : ''}>Race</span>
          <span className={step === 'stats' ? 'text-amber-400' : ''}>Stats</span>
          <span className={step === 'quiz' ? 'text-amber-400' : ''}>Quiz</span>
          <span className={step === 'name' ? 'text-amber-400' : ''}>Name</span>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">

        {/* ── STEP 1: Class ── */}
        {step === 'class' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center mb-4">Choose Your Class</h2>
            {CLASSES.map((cls) => (
              <button
                key={cls.id}
                onClick={() => { setSelectedClass(cls.id) }}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  selectedClass === cls.id
                    ? 'border-amber-400 bg-gray-800'
                    : 'border-gray-700 bg-gray-900 hover:border-gray-500'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-lg text-white">{cls.name}</div>
                    <div className="text-amber-400 text-sm italic mb-1">{cls.tagline}</div>
                    <div className="text-gray-400 text-sm">{cls.description}</div>
                  </div>
                  {selectedClass === cls.id && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center mt-1">
                      <span className="text-gray-900 text-xs font-bold">✓</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── STEP 2: Race ── */}
        {step === 'race' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center mb-4">Choose Your Race</h2>
            {RACES.map((race) => {
              const bonuses = Object.entries(race.abilityBonuses)
                .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
                .join(', ')
              return (
                <button
                  key={race.id}
                  onClick={() => setSelectedRace(race.id)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                    selectedRace === race.id
                      ? 'border-amber-400 bg-gray-800'
                      : 'border-gray-700 bg-gray-900 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-lg text-white">{race.name}</div>
                      <div className="text-amber-400 text-sm mb-1">{bonuses}</div>
                      <div className="text-gray-400 text-sm">{race.description}</div>
                    </div>
                    {selectedRace === race.id && (
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center mt-1">
                        <span className="text-gray-900 text-xs font-bold">✓</span>
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* ── STEP 3: Stats ── */}
        {step === 'stats' && (
          <div>
            <h2 className="text-xl font-bold text-center mb-2">Adjust Your Stats</h2>
            <p className="text-center text-gray-400 text-sm mb-2">
              Pre-set for your class. Use +/− to swap values between stats.
            </p>
            <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 mb-5 space-y-1.5 text-xs text-gray-400">
              <p><span className="text-amber-500 font-semibold">How it works:</span> The six values (16, 14, 13, 12, 10, 8) are fixed — pressing + or − swaps your stat with the next higher or lower value in that set, it doesn&apos;t add or subtract points freely.</p>
              <p><span className="text-amber-500 font-semibold">Odd numbers:</span> 13 and 12 give the same +1 modifier. If an odd score feels wasteful, swap it somewhere it matters less.</p>
            </div>
            <StatAdjuster assignments={statAssignments} onChange={setStatAssignments} />
          </div>
        )}

        {/* ── STEP 4: Quiz ── */}
        {step === 'quiz' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Personality Quiz</h2>
              <span className="text-sm text-gray-400">
                {currentQuestion + 1} / {totalQuestions}
              </span>
            </div>

            {/* Quiz progress bar */}
            <div className="h-1 bg-gray-800 rounded-full mb-6 overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${((currentQuestion) / totalQuestions) * 100}%` }}
              />
            </div>

            <div className="space-y-3">
              <p className="text-base font-medium text-white mb-4">
                {QUIZ_QUESTIONS[currentQuestion].question}
              </p>
              {QUIZ_QUESTIONS[currentQuestion].answers.map((answer, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuizAnswers((prev) => ({
                      ...prev,
                      [QUIZ_QUESTIONS[currentQuestion].id]: answer.traits,
                    }))
                    if (currentQuestion < totalQuestions - 1) {
                      setCurrentQuestion((n) => n + 1)
                    }
                    // If last question, answers are complete — user proceeds via button
                  }}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all text-sm ${
                    quizAnswers[QUIZ_QUESTIONS[currentQuestion].id] === answer.traits
                      ? 'border-amber-400 bg-gray-800 text-white'
                      : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {answer.text}
                </button>
              ))}
            </div>

            {/* Navigate previous questions */}
            {currentQuestion > 0 && (
              <button
                onClick={() => setCurrentQuestion((n) => n - 1)}
                className="mt-6 text-sm text-gray-500 hover:text-gray-300 underline"
              >
                ← Previous question
              </button>
            )}
          </div>
        )}

        {/* ── STEP 5: Name + Submit ── */}
        {step === 'name' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-center">Name Your Character</h2>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Your Name (Player)</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Character Name</label>
              <input
                type="text"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="e.g. Thorin Ironfist"
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Summary */}
            <div className="bg-gray-900 rounded-2xl p-4 space-y-2 border border-gray-700">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Character Summary</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Class</span>
                <span className="text-amber-400 font-medium">
                  {CLASSES.find((c) => c.id === selectedClass)?.name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Race</span>
                <span className="text-amber-400 font-medium">
                  {RACES.find((r) => r.id === selectedRace)?.name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Personality</span>
                <span className="text-amber-400 font-medium">
                  {getPersonalityTraits().join(', ') || '—'}
                </span>
              </div>
            </div>

            {submitError && (
              <p className="text-red-400 text-sm text-center">{submitError}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!playerName.trim() || !characterName.trim() || submitting}
              className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-900 font-bold text-lg rounded-2xl transition-all"
            >
              {submitting ? 'Creating...' : 'Create Character'}
            </button>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      {step !== 'done' && (
        <div className="sticky bottom-0 bg-gray-950 border-t border-gray-800 px-4 py-4">
          {step === 'class' && (
            <button
              onClick={() => setStep('race')}
              disabled={!selectedClass}
              className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-900 font-bold text-lg rounded-2xl transition-all"
            >
              Next: Race →
            </button>
          )}
          {step === 'race' && (
            <div className="flex gap-3">
              <button
                onClick={() => setStep('class')}
                className="flex-1 py-4 bg-gray-800 text-gray-300 font-bold text-lg rounded-2xl"
              >
                ← Back
              </button>
              <button
                onClick={() => {
                  const defaults = CLASS_STAT_DEFAULTS[selectedClass]
                  if (defaults) setStatAssignments(defaults)
                  setStep('stats')
                }}
                disabled={!selectedRace}
                className="flex-[2] py-4 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-900 font-bold text-lg rounded-2xl transition-all"
              >
                Next: Stats →
              </button>
            </div>
          )}
          {step === 'stats' && (
            <div className="flex gap-3">
              <button
                onClick={() => setStep('race')}
                className="flex-1 py-4 bg-gray-800 text-gray-300 font-bold text-lg rounded-2xl"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep('quiz')}
                disabled={!allStatsAssigned}
                className="flex-[2] py-4 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-900 font-bold text-lg rounded-2xl transition-all"
              >
                Next: Quiz →
              </button>
            </div>
          )}
          {step === 'quiz' && (
            <div className="flex gap-3">
              <button
                onClick={() => { setStep('stats') }}
                className="flex-1 py-4 bg-gray-800 text-gray-300 font-bold text-lg rounded-2xl"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep('name')}
                disabled={!quizComplete}
                className="flex-[2] py-4 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-gray-900 font-bold text-lg rounded-2xl transition-all"
              >
                Next: Name →
              </button>
            </div>
          )}
          {step === 'name' && (
            <button
              onClick={() => setStep('quiz')}
              className="w-full py-3 bg-gray-800 text-gray-300 font-bold rounded-2xl"
            >
              ← Back
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page export — wrapped in Suspense for useSearchParams
// ---------------------------------------------------------------------------

export default function CharacterCreatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    }>
      <CharacterCreateInner />
    </Suspense>
  )
}
