'use client'

// ---------------------------------------------------------------------------
// RomanceSection — post-intake romance UI on the mobile sheet (PIV-07).
//
// Renders these cards on the player's phone:
//   • Your Turn-ons (3) — name + effect text
//   • Your Pet Peeves (2) — name + penalty text (private; partner never sees)
//   • Your feeling toward Partner — band label + behaviour description
//
// We do NOT render the partner's AP band. Per the PDF design intent, AP
// bands are private per-player role-playing guidance — never shared with
// the partner. The privacy-gated GET endpoint still returns the partner's
// band to the client (that's the API's contract); the UI is the surface
// that hides it. We keep the partner's *name* visible so the player knows
// whose romance arc is being tracked.
//
// NEVER renders the AP number. The API doesn't expose it; we don't fetch it.
//
// Realtime: subscribes to character_romance row changes for self so the
// player's own band label refreshes when the AI fires
// attraction_point_changes deltas. Partner row changes are ignored at
// the UI level (we no longer render anything from the partner shape).
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

  // Initial fetch — self only. We no longer fetch the partner's romance
  // shape; the partner's band is private per-player guidance and never
  // rendered on the partner's phone.
  useEffect(() => {
    fetchSelf()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId])

  // Realtime — listen for character_romance row updates and refresh self.
  // We listen on the table broadly (since postgres_changes filters per session
  // would require a join column we don't have) and filter client-side.
  useEffect(() => {
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
          }
          // Partner row changes are intentionally ignored — we don't
          // render anything from the partner's romance shape.
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId])

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

      {/* Self band — your own feeling toward your partner. We never
          render the partner's band: AP bands are private per-player
          role-playing guidance per the PDF design intent. */}
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
