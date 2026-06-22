'use client'

import { useState } from 'react'
import { BLACKTHORN_INTRO } from '@/lib/adventures/blackthorn/intro-content'

interface BlackthornIntroProps {
  onComplete: () => void
}

const TOTAL_STEPS = 3

export default function BlackthornIntro({ onComplete }: BlackthornIntroProps) {
  const [step, setStep] = useState(1)

  const next = () => {
    if (step < TOTAL_STEPS) setStep(step + 1)
    else onComplete()
  }
  const back = () => {
    if (step > 1) setStep(step - 1)
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-start px-4 py-8 bg-gray-950 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.18),_transparent_55%),_radial-gradient(ellipse_at_bottom,_rgba(168,85,247,0.08),_transparent_60%)]">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        {/* Step indicator */}
        <div className="flex items-center justify-between text-white/40 text-xs font-medium tracking-wide uppercase">
          <span>Step {step} of {TOTAL_STEPS}</span>
          {step > 1 && (
            <button
              onClick={back}
              className="text-white/50 hover:text-white/80 transition-colors"
            >
              ← Back
            </button>
          )}
        </div>

        {/* Reader card */}
        <article className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-8 sm:px-10 sm:py-10 flex flex-col gap-8">
          {step === 1 && <WelcomeAndRating />}
          {step === 2 && <GenderAndStory />}
          {step === 3 && <NarrativeOpening />}
        </article>

        {/* CTA */}
        <button
          onClick={next}
          className="self-center px-10 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-lg rounded-xl transition-colors shadow-xl shadow-purple-500/40 ring-1 ring-purple-400/30 min-h-[44px]"
        >
          {step < TOTAL_STEPS ? 'Continue' : 'Begin Adventure'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-step content blocks
// ---------------------------------------------------------------------------

function WelcomeAndRating() {
  const { welcome, rating } = BLACKTHORN_INTRO
  return (
    <>
      <Section title={welcome.title} body={welcome.body} />
      <Divider />
      <section className="flex flex-col gap-4">
        <SectionTitle>{rating.title}</SectionTitle>
        <Paragraphs body={rating.intro} />
        <ul className="flex flex-col gap-2 text-gray-200 text-base">
          {rating.tiers.map((t) => (
            <li key={t.tier} className="flex gap-3 leading-relaxed">
              <span className="text-purple-300 font-semibold min-w-[3.5rem]">{t.tier}</span>
              <span>{t.desc}</span>
            </li>
          ))}
        </ul>
        <Paragraphs body={rating.outro} />
      </section>
    </>
  )
}

function GenderAndStory() {
  const { genderOrientation, storyOverRules } = BLACKTHORN_INTRO
  return (
    <>
      <Section title={genderOrientation.title} body={genderOrientation.body} />
      <Divider />
      <Section title={storyOverRules.title} body={storyOverRules.body} />
    </>
  )
}

function NarrativeOpening() {
  const { narrative } = BLACKTHORN_INTRO
  return <Section title={narrative.title} body={narrative.body} />
}

// ---------------------------------------------------------------------------
// Reader primitives
// ---------------------------------------------------------------------------

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>{title}</SectionTitle>
      <Paragraphs body={body} />
    </section>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-white text-3xl sm:text-4xl leading-tight [font-family:var(--font-medieval-sharp)]"
      style={{ textShadow: '0 2px 12px rgba(168, 85, 247, 0.35)' }}
    >
      {children}
    </h2>
  )
}

function Divider() {
  return <hr className="border-white/10" />
}

/**
 * Render a body string as paragraphs. Splits on blank lines. Supports
 * inline `**bold**` and `*italic*` markdown — no nesting, no links.
 */
function Paragraphs({ body }: { body: string }) {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <div className="flex flex-col gap-4 text-gray-200 text-base sm:text-lg leading-relaxed">
      {paragraphs.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(p) }} />
      ))}
    </div>
  )
}

function renderInline(text: string): string {
  // Escape HTML first to avoid injection from content.
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Then apply **bold** and *italic*. Bold first so the italic regex can't
  // chew on the inner asterisks.
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="text-purple-200">$1</em>')
}
