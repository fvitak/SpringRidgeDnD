'use client'

// ---------------------------------------------------------------------------
// RomanceSection — post-intake romance UI on the mobile sheet (PIV-07).
//
// Renders three cards on the player's phone:
//   • Your Turn-ons (3) — name + effect text
//   • Your Pet Peeves (2) — name + penalty text (private; partner never sees)
//   • Your feeling toward Partner — band label + behaviour description
//   • Partner's feeling toward you — band label + behaviour description only
//
// NEVER renders the AP number. The API doesn't expose it; we don't fetch it.
//
// Realtime: subscribes to character_romance row changes for self + partner
// so band labels refresh when the AI fires attraction_point_changes deltas.
// We re-fetch the privacy-gated GET endpoint on each event rather than
// reading the row payload directly — the privacy gate stays the only
// boundary the AP number can't cross.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

interface TurnOn {
  roll: number
  name: string
  effect_text: string
  dice: string
}

interface PetPeeve {
  roll: number
  name: string
  effect_text: string
  dice: string
}

interface ApBand {
  label: string
  behaviour: string
}

interface SelfRomance {
  character_id: string
  turn_ons: TurnOn[]
  pet_peeves: PetPeeve[]
  current_ap_band: ApBand | null
}

interface PublicRomance {
  character_id: string
  current_ap_band: ApBand | null
}

interface PartnerInfo {
  id: string
  character_name: string
}

interface Props {
  characterId: string
  sessionId: string
}

function getRealtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return createClient(url, anonKey)
}

export default function RomanceSection({ characterId, sessionId }: Props) {
  const [self, setSelf] = useState<SelfRomance | null>(null)
  const [partner, setPartner] = useState<PartnerInfo | null>(null)
  const [partnerRomance, setPartnerRomance] = useState<PublicRomance | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Resolve partner via /api/sessions/[id]/players (the OTHER character).
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/players`)
        if (!res.ok) return
        const players = (await res.json()) as Array<{
          id: string
          slot: number
          character_name: string
        }>
        const other = players.find((p) => p.id !== characterId)
        if (!cancelled && other) {
          setPartner({ id: other.id, character_name: other.character_name })
        }
      } catch {
        // silent — sheet still works without partner
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [characterId, sessionId])

  // Self romance fetch.
  async function fetchSelf() {
    try {
      const res = await fetch(
        `/api/characters/${characterId}/romance?viewer=${characterId}`,
      )
      if (!res.ok) return
      const data = await res.json()
      setSelf(data?.data ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Partner romance fetch — privacy-gated; should ONLY return the band.
  async function fetchPartner(partnerId: string) {
    try {
      const res = await fetch(
        `/api/characters/${partnerId}/romance?viewer=${characterId}`,
      )
      if (!res.ok) return
      const data = await res.json()
      const shape = data?.data ?? null
      // Defensive: if the gate ever leaked turn-ons or pet peeves into the
      // partner shape, fail loud rather than render. Per the brief: "if the
      // engineer notices a leak, that's a backend bug — fail loud rather
      // than silently filter on the client."
      if (shape && ('turn_ons' in shape || 'pet_peeves' in shape)) {
        setError(
          'Privacy invariant violated: partner shape leaked private fields. Stopping render.',
        )
        return
      }
      setPartnerRomance(shape)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Initial fetches.
  useEffect(() => {
    fetchSelf()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId])

  useEffect(() => {
    if (partner) fetchPartner(partner.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner])

  // Realtime — listen for character_romance row updates and refresh bands.
  // We listen on the table broadly (since postgres_changes filters per session
  // would require a join column we don't have) and filter client-side.
  useEffect(() => {
    if (!partner) return
    const supabase = getRealtimeClient()
    if (!supabase) return

    const channel = supabase
      .channel(`romance-${characterId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'character_romance',
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { character_id?: string }
          if (!row?.character_id) return
          if (row.character_id === characterId) {
            fetchSelf()
          } else if (row.character_id === partner.id) {
            fetchPartner(partner.id)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, partner?.id])

  if (error) {
    return (
      <section className="bg-gray-900 rounded-2xl p-4 border border-red-900">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-2">
          Romance
        </p>
        <p className="text-sm text-red-300">{error}</p>
      </section>
    )
  }

  if (!self) {
    return (
      <section className="bg-gray-900 rounded-2xl p-4 border border-pink-900/40">
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-400 mb-2">
          Romance
        </p>
        <p className="text-sm text-gray-500 italic">Loading…</p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-pink-400">
        Romance
      </h2>

      {/* Self band */}
      {self.current_ap_band && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-pink-900/60">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
            Your feeling{partner ? ` toward ${partner.character_name}` : ''}
          </p>
          <p className="text-base font-bold text-pink-200 capitalize">
            {self.current_ap_band.label}
          </p>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed">
            {self.current_ap_band.behaviour}
          </p>
        </div>
      )}

      {/* Partner band — band-only by privacy gate */}
      {partner && partnerRomance?.current_ap_band && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-pink-900/30">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
            {partner.character_name}&apos;s feeling toward you
          </p>
          <p className="text-base font-bold text-pink-200 capitalize">
            {partnerRomance.current_ap_band.label}
          </p>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed">
            {partnerRomance.current_ap_band.behaviour}
          </p>
        </div>
      )}

      {/* Self turn-ons */}
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
          Your turn-ons
        </p>
        <ul className="space-y-2">
          {self.turn_ons.map((t) => (
            <li key={t.roll}>
              <p className="text-sm font-semibold text-pink-200">{t.name}</p>
              <p className="text-xs text-gray-400 leading-relaxed">{t.effect_text}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Self pet peeves — never visible to partner; rendered openly here */}
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
          Your pet peeves <span className="normal-case text-gray-600">(private)</span>
        </p>
        <ul className="space-y-2">
          {self.pet_peeves.map((p) => (
            <li key={p.roll}>
              <p className="text-sm font-semibold text-pink-200">{p.name}</p>
              <p className="text-xs text-gray-400 leading-relaxed">{p.effect_text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
