/**
 * GET /api/sessions/:id/map
 *
 * Returns the active scene (with walkable mask + grid metadata) and the
 * current tokens. Used by the host screen Map component. If no scene is set
 * yet, returns { scene: null, tokens: [] }.
 *
 * On first call for a Blackthorn session that has no scene yet, this endpoint
 * lazily seeds the default scene + tokens for Scenario 1 — so Frank doesn't
 * have to manually flip current_scene_id from the DB.
 */

import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { upsertGameState } from '@/lib/db/game-state'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  if (!sessionId) {
    return Response.json({ error: 'Session id required' }, { status: 400 })
  }

  const supabase = getSupabase()

  // 1. Load session to learn the scenario.
  const { data: sess, error: sessErr } = await supabase
    .from('sessions')
    .select('id, scenario_id, name')
    .eq('id', sessionId)
    .maybeSingle()
  if (sessErr || !sess) {
    return Response.json({ scene: null, tokens: [] })
  }

  // 2. Load game_state.tokens + current_scene_id
  const { data: state } = await supabase
    .from('game_state')
    .select('current_scene_id, tokens')
    .eq('session_id', sessionId)
    .maybeSingle()

  let currentSceneId: string | null = state?.current_scene_id ?? null
  let tokens: unknown[] = Array.isArray(state?.tokens) ? state!.tokens : []

  // 3. Lazy-seed for Blackthorn sessions that haven't initialised yet.
  if (!currentSceneId && sess.scenario_id === 'blackthorn-clan') {
    const { data: defaultScene } = await supabase
      .from('scenes')
      .select('id, default_tokens')
      .eq('scenario_id', 'blackthorn-clan')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (defaultScene) {
      currentSceneId = defaultScene.id

      // Hydrate default tokens with character_id where slot matches.
      const defaultTokens = Array.isArray(defaultScene.default_tokens)
        ? (defaultScene.default_tokens as Record<string, unknown>[])
        : []

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
          // Override the seed name with the player's chosen name when available.
          name: matched?.character_name ?? t.name,
        }
      })

      tokens = seededTokens
      await upsertGameState(sessionId, {
        current_scene_id: currentSceneId,
        tokens: seededTokens,
      })
    }
  }

  if (!currentSceneId) {
    return Response.json({ scene: null, tokens })
  }

  // 4. Hydrate the active scene
  const { data: scene } = await supabase
    .from('scenes')
    .select('id, name, image_path, grid_cols, grid_rows, cell_px, cell_w_px, origin_x_px, origin_y_px, walkable, regions, exits')
    .eq('id', currentSceneId)
    .maybeSingle()

  if (!scene) {
    return Response.json({ scene: null, tokens })
  }

  return Response.json({ scene, tokens })
}
