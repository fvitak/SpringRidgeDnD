import { supabase } from '@/lib/supabase'
import { getGameState } from '@/lib/db/game-state'

// ---------------------------------------------------------------------------
// State-truth builder (Cluster B, POL-15-21-22b)
// ---------------------------------------------------------------------------
//
// Pure read function. Builds the authoritative snapshot of "what is true
// right now" for the AI's per-turn payload — replaces the AI's
// conversation memory as the source of truth for combat state.
//
// Per the 2026-05-03 architectural ADR ("server is the bookkeeper, AI
// narrates around authoritative state"), the AI reads this block before
// deciding what to narrate. Writing this contradicts memory — it's the
// fix for "Arnie resurrected" / "Charm forgotten" / "AI lost initiative
// pointer."
//
// Shape:
//   - When combat is INACTIVE: returns the minimal
//     `{ active: false, initiative_order: [], party_status: [] }`.
//     Outside combat, the per-turn payload already surfaces
//     `party[].sheet` for spell-slot / HP / condition reads — the empty
//     arrays here are placeholders that keep the type contract tight
//     without bloating the cached header.
//   - When combat is ACTIVE: returns the full snapshot — round, active
//     pointer, active character name, enriched initiative_order with
//     ledger fields on PCs, plus party_status[] for at-a-glance HP /
//     conditions / spell slot reads.
//
// Read by: app/api/dm-action-v2/route.ts → buildSceneContextBlock extras.
// Doesn't mutate anything — never call from the apply path.
// ---------------------------------------------------------------------------

export interface InitiativeEntryWithLedger {
  name: string
  hp: number
  max_hp: number
  is_player: boolean
  conditions: string[]
  /** Only populated for PCs (is_player === true) when a ledger row exists. */
  action_used?: boolean
  bonus_action_used?: boolean
  reaction_used?: boolean
  movement_used?: number
}

export interface PartyStatusEntry {
  name: string
  hp: number
  max_hp: number
  conditions: string[]
  spell_slots: Record<string, number>
}

export interface CombatStateTruth {
  /** Whether combat is currently active. */
  active: boolean
  /** Current combat round (1-indexed). Omitted when not in combat. */
  round?: number
  /**
   * Zero-based index into `initiative_order[]` indicating whose turn it is
   * RIGHT NOW. Server-maintained.
   */
  active_initiative_index?: number
  /** Resolved from `initiative_order[active_initiative_index].name`. */
  active_character_name?: string
  /**
   * Initiative order with PC ledger fields enriched. NPCs have only the
   * AI-authored fields (name/hp/max_hp/is_player/conditions); PCs gain the
   * action-economy fields from the `character_combat_turn` ledger.
   */
  initiative_order: InitiativeEntryWithLedger[]
  /**
   * Monotonic counter from `combat_state.snapshot_seq` — lets the AI know
   * which version of state-truth it's holding. Bumped by the apply step
   * on every combat-relevant write.
   */
  snapshot_seq?: number
  /**
   * Per-PC HP / conditions / spell slots for at-a-glance reads. Populated
   * from `characters` via a session-scoped SELECT. Empty array when combat
   * is inactive (the per-turn `party[].sheet` block already covers this
   * outside combat).
   */
  party_status: PartyStatusEntry[]
}

/**
 * Read-only build of the authoritative combat-state snapshot for a
 * session. Mutates nothing.
 *
 * Returns `{ active: false, party_status: [] }` minimally when combat is
 * not active. When combat IS active, enriches the AI-authored
 * initiative[] entries with per-PC ledger fields (action/bonus/reaction
 * /movement used this round) and surfaces the per-PC party_status[].
 */
export async function buildStateTruth(sessionId: string): Promise<CombatStateTruth> {
  // 1. Load game_state. We need combat_state JSONB to know if combat is
  //    active and to read the initiative array.
  let gameState: Awaited<ReturnType<typeof getGameState>> = null
  try {
    gameState = await getGameState(sessionId)
  } catch (err) {
    console.warn(
      `[buildStateTruth] failed to read game_state for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { active: false, initiative_order: [], party_status: [] }
  }

  const combatState = (gameState?.combat_state ?? null) as
    | {
        active?: boolean
        round?: number
        initiative?: Array<{
          name: string
          hp: number
          max_hp: number
          is_player: boolean
          conditions?: string[]
        }>
        active_initiative_index?: number
        snapshot_seq?: number
      }
    | null

  // 2. Combat inactive — short-circuit with the minimal shape.
  if (!combatState || combatState.active !== true) {
    return { active: false, initiative_order: [], party_status: [] }
  }

  const round = typeof combatState.round === 'number' && combatState.round >= 1
    ? Math.trunc(combatState.round)
    : undefined
  const initiative = Array.isArray(combatState.initiative)
    ? combatState.initiative
    : []
  const activeIndex =
    typeof combatState.active_initiative_index === 'number' &&
    combatState.active_initiative_index >= 0 &&
    combatState.active_initiative_index < initiative.length
      ? combatState.active_initiative_index
      : undefined

  // 3. Pull every PC for this session — we need character_id (to join
  //    into ledger) plus the fields party_status[] surfaces.
  const { data: charRows, error: charErr } = await supabase
    .from('characters')
    .select('id, character_name, hp, max_hp, conditions, spell_slots')
    .eq('session_id', sessionId)

  if (charErr) {
    console.warn(
      `[buildStateTruth] failed to read characters for ${sessionId}: ${charErr.message}`,
    )
  }

  const characters = Array.isArray(charRows) ? charRows : []

  // Build a name → character_id index for the ledger join below.
  // Initiative entries identify PCs by name (not id), so we resolve via
  // case-insensitive name match.
  const pcByName = new Map<string, { id: string; name: string }>()
  for (const c of characters) {
    if (typeof c.character_name === 'string' && typeof c.id === 'string') {
      pcByName.set(c.character_name.toLowerCase(), {
        id: c.id,
        name: c.character_name,
      })
    }
  }

  // 4. For every PC currently in initiative, look up the ledger row for
  //    THIS round. We pull all rows for the session+round in one query
  //    rather than N round-trips.
  let ledgerByCharacterId: Map<
    string,
    {
      action_used: boolean
      bonus_action_used: boolean
      reaction_used: boolean
      movement_used: number
    }
  > = new Map()

  if (round !== undefined) {
    const { data: ledgerRows, error: ledgerErr } = await supabase
      .from('character_combat_turn')
      .select('character_id, action_used, bonus_action_used, reaction_used, movement_used')
      .eq('session_id', sessionId)
      .eq('round', round)

    if (ledgerErr) {
      console.warn(
        `[buildStateTruth] failed to read character_combat_turn for ${sessionId} round ${round}: ${ledgerErr.message}`,
      )
    } else if (Array.isArray(ledgerRows)) {
      ledgerByCharacterId = new Map(
        ledgerRows.map((r) => [
          r.character_id as string,
          {
            action_used: Boolean(r.action_used),
            bonus_action_used: Boolean(r.bonus_action_used),
            reaction_used: Boolean(r.reaction_used),
            movement_used:
              typeof r.movement_used === 'number' ? r.movement_used : 0,
          },
        ]),
      )
    }
  }

  // 5. Enrich initiative entries — PCs get ledger fields, NPCs don't.
  const initiative_order: InitiativeEntryWithLedger[] = initiative.map((entry) => {
    const base: InitiativeEntryWithLedger = {
      name: entry.name,
      hp: entry.hp,
      max_hp: entry.max_hp,
      is_player: Boolean(entry.is_player),
      conditions: Array.isArray(entry.conditions) ? entry.conditions : [],
    }
    if (entry.is_player) {
      const pc = pcByName.get(entry.name.toLowerCase())
      if (pc) {
        const ledger = ledgerByCharacterId.get(pc.id)
        if (ledger) {
          base.action_used = ledger.action_used
          base.bonus_action_used = ledger.bonus_action_used
          base.reaction_used = ledger.reaction_used
          base.movement_used = ledger.movement_used
        } else {
          // No ledger row yet for this round — emit defaults so the AI
          // sees the field shape. Server's initiative-advance helper
          // will create the row on PC turn-start.
          base.action_used = false
          base.bonus_action_used = false
          base.reaction_used = false
          base.movement_used = 0
        }
      }
    }
    return base
  })

  // 6. Resolve active_character_name from initiative_order[active_index].
  const active_character_name =
    activeIndex !== undefined ? initiative_order[activeIndex]?.name : undefined

  // 7. Build party_status[] from the characters rows.
  const party_status: PartyStatusEntry[] = characters.map((c) => ({
    name: (c.character_name as string | null) ?? '',
    hp: typeof c.hp === 'number' ? c.hp : 0,
    max_hp: typeof c.max_hp === 'number' ? c.max_hp : 0,
    conditions: Array.isArray(c.conditions) ? (c.conditions as string[]) : [],
    spell_slots: (c.spell_slots as Record<string, number> | null) ?? {},
  }))

  return {
    active: true,
    round,
    active_initiative_index: activeIndex,
    active_character_name,
    initiative_order,
    snapshot_seq:
      typeof combatState.snapshot_seq === 'number'
        ? combatState.snapshot_seq
        : undefined,
    party_status,
  }
}
