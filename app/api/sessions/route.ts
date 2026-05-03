import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { SCENARIOS, getScenario, getScenarioByName } from '@/lib/scenarios/registry'
import { BLACKTHORN_TEMPLATES, BLACKTHORN_SLOT_MAP } from '@/lib/data/blackthorn-characters'

export async function POST(req: NextRequest) {
  let body: {
    name?: string
    player_count?: number
    scenario_id?: string
    date_night_mode?: boolean
    initial_rating?: string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Resolve scenario first — by id if given, else by name.
  const scenario = body.scenario_id
    ? getScenario(body.scenario_id)
    : getScenarioByName(body.name)

  const name = body.name?.trim() || scenario.name
  const player_count = body.player_count ?? scenario.playerCountMax

  if (![2, 3, 4].includes(player_count)) {
    return Response.json({ error: 'player_count must be 2, 3, or 4' }, { status: 400 })
  }
  if (player_count < scenario.playerCountMin || player_count > scenario.playerCountMax) {
    return Response.json(
      {
        error: `${scenario.name} requires ${scenario.playerCountMin}–${scenario.playerCountMax} players`,
      },
      { status: 400 },
    )
  }

  const date_night_mode =
    Boolean(body.date_night_mode) && SCENARIOS[scenario.id].supportsDateNight

  const allowedRatings = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const
  const initial_rating =
    body.initial_rating && (allowedRatings as readonly string[]).includes(body.initial_rating)
      ? body.initial_rating
      : 'PG'

  const join_token = crypto.randomUUID().slice(0, 8)

  try {
    const supabase = getSupabase()
    // Write `module_id` when the scenario points at an adventure module
    // (Blackthorn → "blackthorn"). NULL stays the documented marker for
    // legacy WSC/random-encounter sessions; /api/dm-action-v2 reads this
    // to decide whether to route through the module-runner code path.
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        name,
        status: 'active',
        join_token,
        player_count,
        scenario_id: scenario.id,
        date_night_mode,
        current_rating: initial_rating,
        module_id: scenario.moduleId ?? null,
      })
      .select('id, join_token')
      .single()

    if (error) throw error

    // For Blackthorn, auto-create Wynn (slot 1) and Tarric (slot 2) so the
    // host can start the adventure without going through the 4-step creator.
    // Players can override the names later via the existing character flow.
    if (scenario.id === 'blackthorn-clan') {
      const rows = Object.entries(BLACKTHORN_SLOT_MAP).map(([slotStr, key]) => {
        const slot = Number(slotStr)
        const tmpl = BLACKTHORN_TEMPLATES[key]
        return {
          session_id: data.id,
          slot,
          player_name: tmpl.suggestedName,
          character_name: tmpl.suggestedName,
          class: tmpl.class,
          race: tmpl.race,
          level: tmpl.level,
          xp: tmpl.xp,
          hp: tmpl.hp,
          max_hp: tmpl.max_hp,
          ac: tmpl.ac,
          stats: tmpl.stats,
          saving_throws: tmpl.saving_throws,
          skills: tmpl.skills,
          inventory: tmpl.inventory,
          spell_slots: tmpl.spell_slots,
          conditions: tmpl.conditions,
          tolerance_threshold: tmpl.tolerance_threshold,
          drinks_consumed: tmpl.drinks_consumed,
          personality_traits: tmpl.personality_traits,
          // Hardcoded pronouns from the Blackthorn PDF (PIV pronouns task).
          // NULL on templates without pronouns → AI defaults to they/them.
          pronouns: tmpl.pronouns ?? null,
        }
      })
      const { error: charErr } = await supabase.from('characters').insert(rows)
      if (charErr) console.warn('Blackthorn auto-character insert failed:', charErr.message)
    }

    return Response.json(
      {
        session_id: data.id,
        join_token: data.join_token,
        module_id: scenario.moduleId ?? null,
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('Failed to create session:', err)
    return Response.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
