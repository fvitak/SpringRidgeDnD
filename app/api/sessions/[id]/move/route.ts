/**
 * POST /api/sessions/:id/move
 *
 * Body: { token_id: string, target: { x: number, y: number }, dash?: boolean }
 *
 * Validates the move against the current scene's walkable mask and the live
 * token state, commits the new position to game_state.tokens, and writes a
 * one-line entry into the event log so the AI sees it on its next turn.
 *
 * The endpoint is intentionally thin — pathfinding/validation lives in
 * lib/movement/validate-move.ts and is shared with the host map preview.
 */

import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { upsertGameState } from '@/lib/db/game-state'
import { validateMove, MapToken } from '@/lib/movement/validate-move'
import type { WalkableMask } from '@/lib/movement/walkable'
import { appendEventLog } from '@/lib/db/event-log'

interface MoveBody {
  token_id?: string
  target?: { x: number; y: number }
  dash?: boolean
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params

  let body: MoveBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.token_id || !body.target || typeof body.target.x !== 'number' || typeof body.target.y !== 'number') {
    return Response.json({ error: 'token_id and target { x, y } required' }, { status: 400 })
  }

  const supabase = getSupabase()

  // Load game_state (tokens + current_scene_id) and the active scene mask.
  const { data: state, error: stateErr } = await supabase
    .from('game_state')
    .select('tokens, current_scene_id')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (stateErr || !state) {
    return Response.json({ error: 'Session has no active scene' }, { status: 400 })
  }

  if (!state.current_scene_id) {
    return Response.json({ error: 'No active scene for this session' }, { status: 400 })
  }

  const { data: scene, error: sceneErr } = await supabase
    .from('scenes')
    .select('id, walkable')
    .eq('id', state.current_scene_id)
    .maybeSingle()

  if (sceneErr || !scene) {
    return Response.json({ error: 'Active scene not found' }, { status: 500 })
  }

  const tokens = (Array.isArray(state.tokens) ? state.tokens : []) as MapToken[]
  const moverToken = tokens.find((t) => t.id === body.token_id)
  if (!moverToken) {
    return Response.json({ error: `No token "${body.token_id}" in this session` }, { status: 404 })
  }

  // Look up the mover's character row to read speed_squares + movement_used + dash_used.
  // Tokens with no character_id (NPCs) move with sane defaults — the AI usually drives them.
  let speedSquares = 6
  let movementUsed = 0
  let dashUsed = Boolean(body.dash)
  let characterId: string | null = null
  if ((moverToken as { character_id?: string }).character_id) {
    characterId = (moverToken as { character_id?: string }).character_id ?? null
    if (characterId) {
      const { data: char } = await supabase
        .from('characters')
        .select('id, speed_squares, movement_used, dash_used')
        .eq('id', characterId)
        .maybeSingle()
      if (char) {
        speedSquares = char.speed_squares ?? 6
        movementUsed = char.movement_used ?? 0
        dashUsed = dashUsed || Boolean(char.dash_used)
      }
    }
  }

  const mask = scene.walkable as WalkableMask
  const result = validateMove({
    mask,
    tokens,
    mover: { tokenId: moverToken.id, speedSquares, movementUsed, dashUsed },
    target: body.target,
  })

  if (!result.ok) {
    return Response.json({ ok: false, reason: result.reason, explanation: result.explanation, maxReachable: result.maxReachable ?? null }, { status: 200 })
  }

  // Commit: update token position, character.movement_used, event_log line.
  const newTokens = tokens.map((t) =>
    t.id === moverToken.id ? { ...t, x: body.target!.x, y: body.target!.y } : t,
  )

  await upsertGameState(sessionId, { tokens: newTokens })

  if (characterId) {
    await supabase
      .from('characters')
      .update({ movement_used: movementUsed + result.cost, dash_used: dashUsed })
      .eq('id', characterId)
  }

  // Write a movement summary into the event log so the AI sees it on its next call.
  // We deliberately do NOT call Claude — movement is silent until the next narrative turn.
  const fromX = moverToken.x, fromY = moverToken.y
  const summary = `[${moverToken.name}] moved (${fromX},${fromY}) → (${body.target.x},${body.target.y}) — ${result.cost} squares.`
  try {
    await appendEventLog(sessionId, summary, {
      // Synthetic assistant turn so the AI sees movement in its rolling history.
      narration: `[Movement] ${moverToken.name} moved from (${fromX},${fromY}) to (${body.target.x},${body.target.y}). ${result.cost} squares used; ${result.remainingAfter} remaining.`,
      actions_required: [],
      state_changes: [
        {
          entity: moverToken.name,
          field: 'position',
          value: { x: body.target.x, y: body.target.y, token_id: moverToken.id },
        },
      ],
      dm_rolls: [],
    })
  } catch (err) {
    console.warn('Move log append failed (non-fatal):', err)
  }

  return Response.json({
    ok: true,
    path: result.path,
    cost: result.cost,
    remainingAfter: result.remainingAfter,
    provokes: result.provokes,
    summary,
  })
}
