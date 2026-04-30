/**
 * POST /api/sessions/:id/map/reset
 *
 * Resets game_state.tokens to the scene's default_tokens, re-hydrating
 * character names/ids the same way the initial seed does. Useful when
 * you want to restart positioning without creating a new session.
 */

import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { upsertGameState } from '@/lib/db/game-state'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const supabase = getSupabase()

  // Get current scene id
  const { data: state } = await supabase
    .from('game_state')
    .select('current_scene_id')
    .eq('session_id', sessionId)
    .maybeSingle()

  const sceneId = state?.current_scene_id
  if (!sceneId) {
    return Response.json({ error: 'No active scene' }, { status: 400 })
  }

  // Load scene default_tokens
  const { data: scene } = await supabase
    .from('scenes')
    .select('default_tokens')
    .eq('id', sceneId)
    .maybeSingle()

  if (!scene) {
    return Response.json({ error: 'Scene not found' }, { status: 404 })
  }

  const defaultTokens = Array.isArray(scene.default_tokens)
    ? (scene.default_tokens as Record<string, unknown>[])
    : []

  // Re-hydrate character names/ids
  const { data: chars } = await supabase
    .from('characters')
    .select('id, slot, character_name')
    .eq('session_id', sessionId)

  const seededTokens = defaultTokens.map((t) => {
    const slot = (t as { character_slot?: number }).character_slot
    const matched = slot && chars ? chars.find((c) => c.slot === slot) : null
    return {
      ...t,
      character_id: matched?.id ?? null,
      name: matched?.character_name ?? t.name,
    }
  })

  await upsertGameState(sessionId, { tokens: seededTokens })

  return Response.json({ ok: true, tokens: seededTokens })
}
