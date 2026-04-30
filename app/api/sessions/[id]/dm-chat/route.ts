import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getGameState } from '@/lib/db/game-state'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params

  let body: { message: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.message?.trim()) {
    return Response.json({ error: 'message is required' }, { status: 400 })
  }

  const supabase = getSupabase()
  const [gameState, { data: sessRow }] = await Promise.all([
    getGameState(sessionId).catch(() => null),
    supabase.from('sessions').select('name, scenario_id').eq('id', sessionId).maybeSingle(),
  ])

  const tokens = Array.isArray((gameState as { tokens?: unknown })?.tokens)
    ? (gameState as { tokens: unknown[] }).tokens
    : []

  let sceneName = ''
  if ((gameState as { current_scene_id?: string })?.current_scene_id) {
    const { data: scene } = await supabase
      .from('scenes')
      .select('name')
      .eq('id', (gameState as { current_scene_id: string }).current_scene_id)
      .maybeSingle()
    sceneName = scene?.name ?? ''
  }

  const contextLines = [
    `Session: ${sessRow?.name ?? sessionId}`,
    sceneName ? `Current scene: ${sceneName}` : '',
    tokens.length > 0
      ? `Tokens on map: ${tokens.map((t: unknown) => {
          const tok = t as { name?: string; x?: number; y?: number }
          return `${tok.name ?? '?'} at (${tok.x ?? '?'},${tok.y ?? '?'})`
        }).join(', ')}`
      : '',
  ].filter(Boolean).join('\n')

  const systemPrompt = `You are the AI Guide (DM) for a D&D 5e adventure. The DM player is talking to you privately, out of character, to coordinate the game.

Current game state:
${contextLines}

Respond concisely and helpfully. You may reference game mechanics, token positions, or suggest next steps. This conversation is not part of the game narrative.`

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: body.message.trim() }],
    })

    const reply = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    return Response.json({ reply })
  } catch (err) {
    console.error('dm-chat error:', err)
    return Response.json({ error: 'AI service error' }, { status: 500 })
  }
}
