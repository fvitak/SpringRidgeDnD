import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { parseDMResponse } from '@/lib/schemas/dm-response'
import { getEventLog, appendEventLog } from '@/lib/db/event-log'
import { getGameState } from '@/lib/db/game-state'
import { applyStateChanges } from '@/lib/db/apply-state-changes'
import { getSupabase } from '@/lib/supabase'
import { getScenario, getScenarioByName } from '@/lib/scenarios/registry'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ---------------------------------------------------------------------------
// Request body shape
// ---------------------------------------------------------------------------

interface DMActionRequest {
  player_input: string
  session_id: string
  event_log_summary?: string
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Parse and validate request body
  let body: DMActionRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { player_input, session_id, event_log_summary } = body

  if (!player_input || typeof player_input !== 'string' || player_input.trim() === '') {
    return Response.json({ error: 'player_input is required and must be a non-empty string' }, { status: 400 })
  }

  if (!session_id || typeof session_id !== 'string') {
    return Response.json({ error: 'session_id is required' }, { status: 400 })
  }

  // 2. Load current game state for this session
  let game_state: Awaited<ReturnType<typeof getGameState>> = null
  try {
    game_state = await getGameState(session_id)
  } catch (err) {
    // Non-fatal — proceed with null game state rather than failing the whole request
    console.error('Failed to fetch game state:', err)
  }

  // 2a. Resolve which scenario this session belongs to (drives prompt + opening kick).
  let scenarioId: string | null = null
  let sessionName: string | null = null
  let dateNightMode = false
  let currentRating = 'PG'
  let currentSceneId: string | null = null
  let currentSceneRow: Record<string, unknown> | null = null
  try {
    const supabase = getSupabase()
    const { data: sessRow } = await supabase
      .from('sessions')
      .select('scenario_id, name, date_night_mode, current_rating')
      .eq('id', session_id)
      .maybeSingle()
    if (sessRow) {
      scenarioId = (sessRow.scenario_id as string | null) ?? null
      sessionName = (sessRow.name as string | null) ?? null
      dateNightMode = Boolean(sessRow.date_night_mode)
      currentRating = (sessRow.current_rating as string | null) ?? 'PG'
    }
    // Read current scene off game_state, then hydrate the scene row.
    if (game_state && (game_state as { current_scene_id?: string }).current_scene_id) {
      currentSceneId = (game_state as { current_scene_id?: string }).current_scene_id ?? null
      if (currentSceneId) {
        const { data: sceneRow } = await supabase
          .from('scenes')
          .select('id, name, grid_cols, grid_rows, walkable, regions, exits')
          .eq('id', currentSceneId)
          .maybeSingle()
        if (sceneRow) currentSceneRow = sceneRow
      }
    }
  } catch (err) {
    console.error('Failed to fetch session/scenario:', err)
  }

  const scenario = scenarioId
    ? getScenario(scenarioId)
    : getScenarioByName(sessionName)

  // Compose the gameState object passed into the prompt builder. Includes the
  // active scene hydrated from `scenes`, the live tokens from game_state, and
  // the rating dial state.
  const gameStateForPrompt: Record<string, unknown> = {
    ...(game_state ?? {}),
    current_rating: currentRating,
    date_night_mode: dateNightMode,
    current_scene: currentSceneRow
      ? {
          ...currentSceneRow,
          tokens: (game_state as { tokens?: unknown })?.tokens ?? [],
        }
      : null,
  }

  // 3. Fetch last 6 event log entries for this session (3 full exchanges)
  let eventLog: Awaited<ReturnType<typeof getEventLog>> = []
  try {
    const fullLog = await getEventLog(session_id)
    eventLog = fullLog.slice(-6)
  } catch (err) {
    // Non-fatal — proceed without history rather than failing the whole request
    console.error('Failed to fetch event log:', err)
  }

  // 4. Build the messages array
  //    Interleave prior turns as user/assistant pairs so Claude has conversation context.
  const historyMessages: Anthropic.MessageParam[] = []

  for (const entry of eventLog) {
    historyMessages.push({
      role: 'user',
      content: entry.player_input,
    })
    historyMessages.push({
      role: 'assistant',
      content: entry.ai_response
        ? JSON.stringify(entry.ai_response)
        : '{"narration":"","actions_required":[],"state_changes":[],"dm_rolls":[]}',
    })
  }

  // Optionally prepend an event log summary as a user-turn context note
  const contextPrefix = event_log_summary
    ? `[Session context: ${event_log_summary}]\n\n`
    : ''

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    {
      role: 'user',
      content: `${contextPrefix}${player_input.trim()}`,
    },
  ]

  // 5. Stream from Anthropic and return SSE response
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
          system: [
            {
              type: "text" as const,
              text: scenario.buildSystemPrompt(gameStateForPrompt),
              cache_control: { type: "ephemeral" as const },
            },
          ],
          messages,
        })

        // Stream text deltas to the client as they arrive
        anthropicStream.on('text', (text) => {
          fullText += text
          enqueue(JSON.stringify({ token: text }))
        })

        // Wait for the stream to fully complete
        await anthropicStream.finalMessage()

        // Parse and validate the complete response
        try {
          const dmResponse = parseDMResponse(fullText)
          await appendEventLog(session_id, player_input.trim(), dmResponse)

          // Apply state changes — non-fatal
          try {
            await applyStateChanges(session_id, dmResponse.state_changes)
          } catch (err) {
            console.error('Failed to apply state changes:', err)
          }

          enqueue(JSON.stringify({ done: true, response: dmResponse }))
        } catch (parseErr) {
          console.error('Failed to parse AI response:', parseErr)
          console.error('Raw AI output:', fullText.slice(0, 1000))
          enqueue(JSON.stringify({ error: 'Failed to parse AI response' }))
        }
      } catch (err) {
        console.error('Anthropic streaming error:', err)
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
