/**
 * /api/dm-action-v2 — module-runner code path (PIV-02b, Sprint 4.6).
 *
 * Parallel to /api/dm-action (which stays as the legacy WSC route).
 * Differences:
 *   - System prompt is split: a stable cached header + a per-turn scene
 *     context block. See DECISIONS.md 2026-04-30
 *     "DM pivot: split system prompt into cached header + per-turn scene context".
 *   - Scene script is loaded from disk via `lib/adventures/loader.ts`
 *     (not from `lib/prompts/*` per-scenario monoliths).
 *   - Response can include `dm_overrides[]` (rule-of-cool) and
 *     `scene_transition` (scripted scene moves), routed through
 *     `apply-state-changes.ts` extras.
 *
 * Module resolution order (post 2026-04-30 follow-up):
 *   1. `sessions.module_id` (preferred — written at session create time
 *      from the scenario picker; see app/api/sessions/route.ts).
 *   2. The optional `module_id` field on the request body (legacy
 *      fallback — kept so smoke tests / older callers that pre-date the
 *      column don't break). When this fires, a warning is logged.
 *   3. If neither is set, the route 400s.
 *
 * The legacy route at /api/dm-action is NOT modified. WSC sessions keep
 * working unchanged.
 */

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { parseDMResponse } from '@/lib/schemas/dm-response'
import { getEventLog, appendEventLog } from '@/lib/db/event-log'
import { getGameState } from '@/lib/db/game-state'
import { applyStateChanges } from '@/lib/db/apply-state-changes'
import { getSupabase } from '@/lib/supabase'
import {
  loadManifest,
  loadScene,
  loadModuleAndScene,
} from '@/lib/adventures/loader'
import {
  buildModuleRunnerHeader,
  buildSceneContextBlock,
} from '@/lib/prompts/module-runner'
import type { Manifest, SceneContext } from '@/lib/schemas/scene-context'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Cached header is computed once per server warm — its content is stable
// across requests, so cache it in module scope to avoid string concat per
// turn. (The Anthropic prompt cache is what matters for billing; this is
// just process-local.)
const CACHED_HEADER = buildModuleRunnerHeader()

// ---------------------------------------------------------------------------
// Request body shape
// ---------------------------------------------------------------------------

interface DMActionV2Request {
  player_input: string
  session_id: string
  /**
   * Adventure module id under `lib/adventures/<module-id>/`.
   *
   * Optional in the request body — the route now prefers
   * `sessions.module_id` written at session create time. The body field
   * stays accepted as a fallback so older callers (and the smoke test)
   * keep working when the session row's column is NULL.
   */
  module_id?: string
  /**
   * Optional override for the scene to load. When omitted, the route
   * reads `game_state.current_scene_id` and falls back to the manifest's
   * first scenario `first_scene_id`.
   */
  scene_id?: string
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: DMActionV2Request
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { player_input, session_id, module_id: bodyModuleId, scene_id } = body

  if (!player_input || typeof player_input !== 'string' || player_input.trim() === '') {
    return Response.json({ error: 'player_input is required and must be a non-empty string' }, { status: 400 })
  }
  if (!session_id || typeof session_id !== 'string') {
    return Response.json({ error: 'session_id is required' }, { status: 400 })
  }

  // Detect the host's auto-fired opening sentinel. The host sends
  // `[scene_start]` exactly once per session — when the event log is empty
  // and `session.module_id` is set — to trigger the AI's opening narration
  // (scene read_aloud + PC/visible-NPC discovery flips). See app/page.tsx
  // "Auto-fire the scenario's opening kick on first turn".
  //
  // We accept it here only as a marker; the AI never sees the literal
  // string. Instead the per-turn scene-context block carries
  // `is_opening_turn: true` and the message body is replaced with a short
  // human-readable cue.
  const isSceneStartSentinel = player_input.trim() === '[scene_start]'

  // 1. Load game state and session metadata (incl. module_id) in parallel.
  let game_state: Awaited<ReturnType<typeof getGameState>> = null
  try {
    game_state = await getGameState(session_id)
  } catch (err) {
    console.error('[v2] Failed to fetch game state:', err)
  }

  let dateNightMode = false
  let currentRating = 'PG'
  let sessionModuleId: string | null = null
  try {
    const supabase = getSupabase()
    const { data: sessRow } = await supabase
      .from('sessions')
      .select('date_night_mode, current_rating, module_id')
      .eq('id', session_id)
      .maybeSingle()
    if (sessRow) {
      dateNightMode = Boolean(sessRow.date_night_mode)
      currentRating = (sessRow.current_rating as string | null) ?? 'PG'
      sessionModuleId = (sessRow.module_id as string | null) ?? null
    }
  } catch (err) {
    console.error('[v2] Failed to fetch session metadata:', err)
  }

  // Resolve module_id: prefer the session row, fall back to the request
  // body for back-compat with callers (e.g. the smoke test) that pre-date
  // the sessions.module_id column. If only the body has it, log a warning
  // so it's visible in production logs that an old caller is still active.
  let module_id: string
  if (sessionModuleId) {
    module_id = sessionModuleId
  } else if (typeof bodyModuleId === 'string' && bodyModuleId.trim() !== '') {
    console.warn(
      `[v2] sessions.module_id is NULL for session ${session_id}; falling back to body module_id="${bodyModuleId}". This path is for legacy callers only — populate the column at session-create time.`
    )
    module_id = bodyModuleId
  } else {
    return Response.json(
      { error: 'module_id could not be resolved (session row has no module_id and request body did not provide one)' },
      { status: 400 }
    )
  }

  // 2. Resolve which scene to load.
  //    Precedence: explicit body param > game_state.current_scene_id > manifest fallback.
  let manifest: Manifest
  let scene: SceneContext
  try {
    const stateSceneId = (game_state as { current_scene_id?: string } | null)?.current_scene_id
    const requestedSceneId = scene_id ?? stateSceneId ?? null
    if (requestedSceneId) {
      const loaded = loadModuleAndScene(module_id, requestedSceneId)
      manifest = loaded.manifest
      scene = loaded.scene
    } else {
      manifest = loadManifest(module_id)
      const firstSceneId = manifest.scenarios[0]?.first_scene_id
      if (!firstSceneId) {
        return Response.json({ error: `module ${module_id} has no scenarios` }, { status: 500 })
      }
      scene = loadScene(module_id, firstSceneId)
    }
  } catch (err) {
    console.error('[v2] Scene load failed:', err)
    return Response.json(
      { error: `Failed to load scene for module ${module_id}: ${(err as Error).message}` },
      { status: 500 }
    )
  }

  // 3. Last-6 event-log replay (full JSON — see landmine #1 in ARCHITECTURE.md).
  //    Also surface the full-log length so we can flag opening-turn behaviour
  //    on the per-turn scene context (set when log is empty AND the host sent
  //    the [scene_start] sentinel).
  let eventLog: Awaited<ReturnType<typeof getEventLog>> = []
  let eventLogTotal = 0
  try {
    const fullLog = await getEventLog(session_id)
    eventLogTotal = fullLog.length
    eventLog = fullLog.slice(-6)
  } catch (err) {
    console.error('[v2] Failed to fetch event log:', err)
  }

  // Opening turn = the player's first interaction with this session,
  // regardless of whether the auto-fire sentinel triggered or the player
  // typed something themselves. The empty event log is the load-bearing
  // signal; the sentinel is just a UX convenience.
  const isOpeningTurn = eventLogTotal === 0

  const historyMessages: Anthropic.MessageParam[] = []
  for (const entry of eventLog) {
    historyMessages.push({ role: 'user', content: entry.player_input })
    historyMessages.push({
      role: 'assistant',
      content: entry.ai_response
        ? JSON.stringify(entry.ai_response)
        : '{"narration":"","actions_required":[],"state_changes":[],"dm_rolls":[]}',
    })
  }

  // For the opening-turn sentinel, replace the user message with a short,
  // non-narrated cue. The AI gets the actual instruction from the
  // `is_opening_turn: true` flag on the scene-context block (see
  // module-runner.ts header → OPENING TURN section). The user message is
  // intentionally minimal so the AI does not try to echo or paraphrase it
  // in narration.
  const userMessageText = isOpeningTurn
    ? '(Begin the scene.)'
    : player_input.trim()

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: 'user', content: userMessageText },
  ]

  // 4. Build the split system prompt.
  const sceneBlock = buildSceneContextBlock(
    scene,
    (game_state as Record<string, unknown> | null) ?? null,
    {
      current_rating: currentRating,
      date_night_mode: dateNightMode,
      is_opening_turn: isOpeningTurn,
    }
  )

  const systemPrompt: Anthropic.Messages.MessageCreateParams['system'] = [
    {
      type: 'text' as const,
      text: CACHED_HEADER,
      cache_control: { type: 'ephemeral' as const },
    },
    {
      type: 'text' as const,
      text: sceneBlock,
      // intentionally NO cache_control — this entry is per-turn.
    },
  ]

  // Lint-quiet usage of manifest (we keep it in scope for future reuse, e.g.
  // emitting attribution into the response, without re-loading).
  void manifest

  // 5. Stream and validate.
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }
      let fullText = ''
      try {
        const anthropicStream = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          messages,
        })

        anthropicStream.on('text', (text) => {
          fullText += text
          enqueue(JSON.stringify({ token: text }))
        })

        await anthropicStream.finalMessage()

        try {
          const dmResponse = parseDMResponse(fullText)
          // Log the sentinel under a stable, human-readable label so re-load
          // history shows "[Opening scene]" rather than "[scene_start]". The
          // exact recorded value doesn't gate anything — the host's
          // re-fire guard is `event_log.length === 0`, which becomes false
          // the moment any entry lands here.
          const loggedInput = isOpeningTurn ? '[Opening scene]' : player_input.trim()
          await appendEventLog(session_id, loggedInput, dmResponse)

          // Defensive ID translation for `discovered` state_changes.
          //
          // Background: scene/manifest NPC `id` values are descriptive
          // (e.g. "lookout-harold-longfingers", "arnie-wilkens"). The
          // tokens those NPCs correspond to in `game_state.tokens` use
          // short ids (e.g. "lookout", "ruffian_3"). Each NPC stat block
          // carries an explicit `token_id` mapping. The module-runner
          // prompt instructs the AI to emit `entity: <token_id>` for
          // discovery flips, but the AI can still default to the more
          // prominent `id` field. This translation makes the apply path
          // resilient to that — if a `discovered` state_change's entity
          // matches an NPC's `id` AND that NPC has a `token_id`, swap
          // them before apply.
          //
          // No-op when the AI emits the right id directly.
          const npcIdToTokenId = new Map<string, string>()
          for (const npc of [...(scene.npcs ?? []), ...(manifest.shared_npcs ?? [])]) {
            if (typeof npc.token_id === 'string' && npc.token_id.trim() !== '') {
              npcIdToTokenId.set(npc.id, npc.token_id)
            }
          }
          const translatedStateChanges = dmResponse.state_changes.map((sc) => {
            if (sc.field === 'discovered' && typeof sc.entity === 'string') {
              const mapped = npcIdToTokenId.get(sc.entity)
              if (mapped && mapped !== sc.entity) {
                console.warn(
                  `[v2] Translating discovery entity "${sc.entity}" → "${mapped}" (AI used npc.id; should have used token_id).`,
                )
                return { ...sc, entity: mapped }
              }
            }
            return sc
          })

          // Server-side discovery fallback for opening turns.
          //
          // The AI is unreliable about emitting `state_changes` while it
          // focuses on prose — repeated playtests showed beautiful opening
          // narration with `state_changes: []`, leaving Wynn / lookout /
          // dozing-guard tokens unflipped and the host map empty. Rather
          // than keep tightening the prompt rule, the server flips
          // discovery for everyone the scene wants visible at scene start
          // and that the AI has just (presumably) introduced.
          //
          // Scope is opening-turn-only. Mid-scene reveals (reinforcements
          // arriving, players opening a new door) still rely on the AI
          // emitting state_changes per the standing rule. Those are the
          // narrative beats where pacing matters; opening discovery is
          // scene-setting and should just happen.
          if (isOpeningTurn) {
            const tokens = (game_state as { tokens?: Array<Record<string, unknown>> } | null)
              ?.tokens ?? []
            const tokenById = new Map<string, Record<string, unknown>>()
            for (const t of tokens) {
              if (typeof t?.id === 'string') tokenById.set(t.id, t)
            }

            // Collect candidate token ids: PCs + every scene/shared NPC
            // with a token_id field. (NPCs without token_id can't be
            // server-flipped — they have no token to point at.)
            const candidateTokenIds = new Set<string>()
            const tokensField = (gameState: typeof game_state) =>
              (gameState as { pc_token_ids?: string[] } | null)?.pc_token_ids
            const pcIdsFromState = tokensField(game_state)
            // pc_token_ids isn't on game_state directly; derive from tokens
            // where kind === 'pc'/'PC' to match buildSceneContextBlock's logic.
            for (const t of tokens) {
              const kind = typeof t?.kind === 'string' ? t.kind.toLowerCase() : ''
              if (kind === 'pc' && typeof t.id === 'string') candidateTokenIds.add(t.id)
            }
            void pcIdsFromState
            for (const npc of [...(scene.npcs ?? []), ...(manifest.shared_npcs ?? [])]) {
              if (typeof npc.token_id === 'string' && npc.token_id.trim() !== '') {
                candidateTokenIds.add(npc.token_id)
              }
            }

            // Skip ids the AI already flipped this turn.
            const alreadyFlipped = new Set<string>(
              translatedStateChanges
                .filter((sc) => sc.field === 'discovered' && typeof sc.entity === 'string')
                .map((sc) => sc.entity as string),
            )

            for (const tokenId of candidateTokenIds) {
              if (alreadyFlipped.has(tokenId)) continue
              const tk = tokenById.get(tokenId)
              if (!tk) continue
              if (tk.discovered === true) continue
              translatedStateChanges.push({
                entity: tokenId,
                field: 'discovered',
                value: true,
              })
              console.warn(
                `[v2] Opening-turn auto-discovery: flipping "${tokenId}" (AI did not emit state_change for this token).`,
              )
            }
          }

          try {
            await applyStateChanges(session_id, translatedStateChanges, {
              dmOverrides: dmResponse.dm_overrides,
              sceneTransition: dmResponse.scene_transition,
              attractionPointChanges: dmResponse.attraction_point_changes,
            })
          } catch (err) {
            console.error('[v2] Failed to apply state changes:', err)
          }

          enqueue(JSON.stringify({ done: true, response: dmResponse }))
        } catch (parseErr) {
          console.error('[v2] Failed to parse AI response:', parseErr)
          console.error('[v2] Raw AI output:', fullText.slice(0, 1000))
          enqueue(JSON.stringify({ error: 'Failed to parse AI response' }))
        }
      } catch (err) {
        console.error('[v2] Anthropic streaming error:', err)
        enqueue(JSON.stringify({ error: 'AI service error' }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
