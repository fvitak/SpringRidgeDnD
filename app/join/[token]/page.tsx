import { redirect } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

interface PageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ slot?: string }>
}

export default async function JoinPage({ params, searchParams }: PageProps) {
  const { token } = await params
  const { slot } = await searchParams

  const slotNum = slot ? parseInt(slot, 10) : NaN

  // Look up session by join_token
  const supabase = getSupabase()
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, player_count, status')
    .eq('join_token', token)
    .single()

  if (sessionError || !session) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-100 font-serif">
        <div className="text-center space-y-3 px-6">
          <p className="text-4xl">🗺️</p>
          <h1 className="text-2xl font-bold text-purple-400">Session Not Found</h1>
          <p className="text-gray-400">This adventure link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  // Validate slot number
  if (isNaN(slotNum) || slotNum < 1 || slotNum > session.player_count) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-100 font-serif">
        <div className="text-center space-y-3 px-6">
          <p className="text-4xl">❓</p>
          <h1 className="text-2xl font-bold text-purple-400">Invalid Slot</h1>
          <p className="text-gray-400">Ask for a valid QR code from the shared screen.</p>
        </div>
      </div>
    )
  }

  // Check if slot is already taken
  const { data: existing } = await supabase
    .from('characters')
    .select('id')
    .eq('session_id', session.id)
    .eq('slot', slotNum)
    .maybeSingle()

  if (existing) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-100 font-serif">
        <div className="text-center space-y-3 px-6">
          <p className="text-4xl">🪑</p>
          <h1 className="text-2xl font-bold text-purple-400">Seat Taken</h1>
          <p className="text-gray-400">
            This seat is taken — ask for a different QR code.
          </p>
        </div>
      </div>
    )
  }

  // Valid — redirect to character creation
  redirect(`/character-create?session_id=${session.id}&slot=${slotNum}`)
}
