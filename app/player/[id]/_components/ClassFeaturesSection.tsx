'use client'

// ---------------------------------------------------------------------------
// ClassFeaturesSection — POL-23c §E.
//
// Lists each class feature with a use-counter visualization for limited-use
// features (filled dots = remaining uses). Passive / unlimited features show
// no dot — just the description.
//
// Bound to `characters.class_features` for the static feature list, and
// `characters.feature_uses` for the per-feature current_uses count. Returns
// null when the class_features array is empty (matches the brief: WSC PCs
// with no features just don't render the section).
// ---------------------------------------------------------------------------

import { useState } from 'react'

export type FeatureRecharge = 'short_rest' | 'long_rest' | 'turn' | 'unlimited'

export interface ClassFeatureEntry {
  id: string
  name: string
  description: string
  uses_per?: FeatureRecharge
  max_uses?: number
}

export interface FeatureUseEntry {
  current_uses: number
  last_reset: 'short_rest' | 'long_rest' | 'never'
}

interface Props {
  classFeatures: ClassFeatureEntry[]
  featureUses: Record<string, FeatureUseEntry>
}

const RECHARGE_LABEL: Record<FeatureRecharge, string> = {
  short_rest: 'short rest',
  long_rest: 'long rest',
  turn: 'per turn',
  unlimited: 'passive',
}

export default function ClassFeaturesSection({
  classFeatures,
  featureUses,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (!classFeatures || classFeatures.length === 0) return null

  return (
    <section className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
        Class Features
      </p>
      <div className="space-y-1.5">
        {classFeatures.map((feature) => {
          const isOpen = openId === feature.id
          const max = feature.max_uses
          const hasLimitedUses = typeof max === 'number' && max > 0
          const current = hasLimitedUses
            ? Math.min(max, Math.max(0, featureUses[feature.id]?.current_uses ?? max))
            : 0
          const rechargeNote = feature.uses_per
            ? RECHARGE_LABEL[feature.uses_per]
            : null

          return (
            <div
              key={feature.id}
              className="rounded-xl bg-gray-800 border border-gray-700"
            >
              <button
                onClick={() => setOpenId(isOpen ? null : feature.id)}
                className="w-full px-3 py-2.5 text-left"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-purple-200 truncate">
                    {feature.name}
                  </span>
                  <span className="text-gray-600 text-xs flex-shrink-0">
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {hasLimitedUses ? (
                    <>
                      <div className="flex gap-1">
                        {Array.from({ length: max }).map((_, i) => (
                          <span
                            key={i}
                            className={`w-2.5 h-2.5 rounded-full inline-block ${
                              i < current
                                ? 'bg-purple-400'
                                : 'bg-gray-700 border border-gray-600'
                            }`}
                            aria-label={i < current ? 'Available use' : 'Spent use'}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-gray-500">
                        {current}/{max}
                        {rechargeNote ? ` · ${rechargeNote}` : ''}
                      </span>
                    </>
                  ) : (
                    rechargeNote && (
                      <span className="text-[11px] text-gray-500 italic">
                        {rechargeNote}
                      </span>
                    )
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 border-t border-gray-700 pt-2">
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
