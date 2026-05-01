# GRAIL — Architecture

**Owner:** Lead Engineer agent
**Scope:** How the app is put together today. Reflects what's in `main`, not
aspirations. Update this file when you change structure, not before.

## Stack

| Layer           | Choice                                        | Notes                                            |
| --------------- | --------------------------------------------- | ------------------------------------------------ |
| Frontend        | Next.js **16** + React **19** + Tailwind 4   | App Router, RSC by default                       |
| DB              | Supabase (Postgres)                          | `sessions`, `characters`, `game_state`, `event_log` |
| Realtime        | Supabase Realtime channels                   | Mobile sheet subscribes to its own character row |
| AI              | Anthropic Claude (`claude-sonnet-4-6`)       | `@anthropic-ai/sdk`, SSE streaming, prompt cache |
| Validation      | Zod                                          | Every AI response parses through `dmResponseSchema` |
| Dice            | `crypto.getRandomValues` in `lib/dice.ts`    | Deterministic, auditable                         |
| Hosting         | Vercel + Supabase Cloud                      | Single env. `main` = prod.                       |

> ⚠️ **Next.js 16 is not the Next.js in your training data.** APIs,
> conventions, and file structure may differ. Before writing ANY Next.js
> code, read `node_modules/next/dist/docs/` for the relevant topic.

## Request lifecycle (happy path)

```
Host types action on app/page.tsx
  ↓ POST /api/dm-action
    — builds messages: system prompt (cached) + last 6 event_log rows
      (full JSON, not narration-only) + new player input
    — calls Claude with SSE streaming
    — streams tokens back to Guide screen (typewriter)
    — parseDMResponse() validates final JSON against Zod schema
    — applyStateChanges() routes state_changes → characters / game_state
    — appendEventLog(input, full AI JSON)
    — returns combat_state, pending_roll, etc.
Guide screen applies narration, fires roll modal after typewriter finishes,
Supabase Realtime pushes HP/conditions/death-saves to each mobile sheet.
```

## Directory map

| Path                                   | Purpose                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `app/page.tsx`                         | Guide screen (narration log, input, sidebar, roll modal, typewriter)       |
| `app/character-create/page.tsx`        | 4-step character creator (class → race → stats → name)                     |
| `app/player/[id]/page.tsx`             | Mobile sheet — live via Supabase Realtime; death-save UI at HP=0           |
| `app/join/[token]/page.tsx`            | QR-code landing for players joining a session                              |
| `app/api/dm-action/route.ts`           | Claude call + SSE stream + state-change apply + event-log append           |
| `app/api/sessions/*`                   | Create / fetch / end session                                               |
| `app/api/characters/*`                 | Create character + compute sheet                                           |
| `app/api/players/*`                    | Slot claim, presence                                                       |
| `app/api/event-log/*`                  | Fetch event log for a session                                              |
| `app/api/restart/*`                    | Reset a Random Encounter session                                           |
| `app/admin/scenes/page.tsx`            | Admin scene list — query-param gated, not linked from any player route     |
| `app/admin/scenes/[id]/page.tsx`       | Admin scene detail + alignment editor (Client Component)                   |
| `app/api/admin/scenes/[id]/route.ts`   | `PATCH` — updates geometry params only; never touches `walkable`           |
| `lib/prompts/wild-sheep-chase.ts`      | Full system prompt — persona, lore, rules, combat, drunkenness, spoilers   |
| `lib/schemas/dm-response.ts`           | `dmResponseSchema` (Zod) + `parseDMResponse()`                             |
| `lib/dice.ts`                          | `rollDie`, `roll(NdS)`, `rollCheck`, `rollDamage`                          |
| `lib/character/compute-character.ts`   | Derives full 5e sheet (HP/AC/saves/skills/equipment/spells) on save        |
| `lib/db/apply-state-changes.ts`        | Routes `state_changes[]` to `characters` or `game_state` by field name     |
| `lib/db/event-log.ts`                  | `getEventLog` (last 6) / `appendEventLog`                                  |
| `lib/db/game-state.ts`                 | `getGameState` / `upsertGameState`                                         |
| `lib/supabase.ts`                      | Shared Supabase client                                                     |
| `supabase/migrations/*.sql`            | Forward-only migrations (4 so far)                                         |

## AI response contract

Claude returns a single JSON object. The shape is the product's hard
contract; all changes to it go through an ADR (see `DECISIONS.md`).

```jsonc
{
  "narration": "string",                          // shown to player, typewriter'd
  "actions_required": [ { "type": "roll|choice|confirm", "player?": "...", "description": "..." } ],
  "state_changes":    [ { "entity": "...", "field": "hp|condition|...", "value": <any> } ],
  "dm_rolls":         [ { "purpose": "...", "result": 18 } ],
  "combat_state":     { "active": true, "round": 2, "initiative": [ ... ] },
  "scene_suggestions": [ "...", "...", "..." ],   // max 3, optional
  "pending_roll":     { "player": "...", "type": "...", "dc?": 15 }  // optional
}
```

See `lib/schemas/dm-response.ts` for the authoritative schema.

## Database schema highlights

| Table        | Key fields                                                                                                 | Notes                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `sessions`   | `id`, `name`, `status`, `join_token`, `player_count`                                                       | `status`: lobby \| active \| paused \| ended                          |
| `game_state` | `session_id`, `state JSONB`, `combat_state JSONB`, `pending_roll JSONB`                                    | one row per session; `combat_state.initiative` is the turn order      |
| `characters` | `session_id`, `slot`, `name`, `class`, `race`, stats, `hp`, `max_hp`, `conditions`, `drinks_consumed`, `tolerance_threshold`, death-save counters, `action_used` / `bonus_action_used` / `reaction_used`, `concentration` | `tolerance_threshold` is hidden from players |
| `event_log`  | `session_id`, `player_input`, `ai_response JSONB`, `created_at`                                            | last 6 rows are replayed into Claude context as full JSON             |

Migrations live under `supabase/migrations/`. Four files so far: initial
schema, Sprint 2 additions, character position, Sprint 3 combat.

## Implementation landmines

These are expensive to rediscover. If you change one, update this list and
open an ADR.

1. **Full-JSON history, not narration-only.** When passing prior turns to
   Claude, `JSON.stringify(entry.ai_response)` the whole object. Passing
   only the `narration` string causes Claude to drift off-schema after 2–3
   turns.
2. **Roll modal timing.** `pendingRoll` lives in `typewriterRef.pendingRoll`
   and fires _only after_ the typewriter finishes the last character. Do
   not call `setPendingRoll` directly from the done-handler or the modal
   races the narration.
3. **Prompt caching.** The system prompt uses `cache_control: "ephemeral"`
   with a 5-minute TTL. Keep the system prompt stable across turns within a
   session or you lose the cache.
4. **Drunkenness math.** `tolerance_threshold` (1–9) is hidden from
   players. Never surface it in narration. Buzzed/Drunk/Hammered levels
   come from multiples of the threshold vs. `drinks_consumed`.
5. **One env.** `main` is prod. No staging. Migrations go live on push. Use
   additive column changes, not destructive ones.
6. **Last 6 entries.** `getEventLog` returns the last 6 turns for Claude
   context. Changing this number affects both cost and narrative coherence —
   touch with care and open an ADR.
7. **Romance intake gate races the rating-dial fetch.** The mobile sheet's
   `intakeStatus` fetch (`/api/characters/[id]/romance/status`) is gated on
   `sessionInfo?.date_night_mode`, which itself is fetched in a separate
   effect that polls every 5 seconds. On the very first paint after a join,
   `sessionInfo` is `null`, so the intake gate decision is "don't show
   intake yet" — this is intentional (we'd rather flash the sheet briefly
   than show intake on a non-Date-Night session by accident). If you ever
   change the order or merge those fetches, re-confirm that a WSC player
   never sees a Romance card on first paint.
8. **Adventure JSON underscore-prefixed annotations are silently stripped.**
   `parseSceneContext` / `parseManifest` use plain `z.object(...)`, which
   strips unknown keys on parse. Author-only notes like `_part_1_todo` and
   `_npcs_note` live in the source JSON for humans but never appear in the
   parsed runtime object — meaning `lib/prompts/module-runner.ts` never
   sees them, and the validator never reports on them. This is desirable
   (the AI shouldn't see authoring TODOs), but it means you can't rely on
   these fields for any runtime behaviour. Do not add `.passthrough()` to
   "fix" this. If a field needs to round-trip, promote it to a real schema
   field.
9. **NPC pool resolution is two-tier.** `location.npcs_present[]` ids
   resolve against `scene.npcs[]` first, then `manifest.shared_npcs[]`.
   Cross-scene NPCs (e.g. Harold the Lookout in Blackthorn Parts 1+2) live
   in the manifest pool so a single edit propagates everywhere. If you add
   an NPC to a per-scene `npcs[]` that already exists in the manifest pool
   under the same id, the schema accepts both — but the per-scene block
   wins at runtime read order in any consumer that doesn't merge the two.
   Pick one home per NPC.
10. **Two DM routes have separate prompt caches; mid-flight pivots are
    undefined.** `/api/dm-action` (legacy WSC) caches the full WSC system
    prompt as a single `ephemeral` block. `/api/dm-action-v2`
    (module-runner) caches a stable header and concatenates a per-turn
    scene-context block with NO `cache_control`. The host UI route-switches
    based on `session.module_id` (NULL → legacy, set → v2). If a session
    ever toggles `module_id` mid-flight (it shouldn't — `module_id` is
    write-once at session create), the next turn lands on the other route
    with a cold cache and a different system-prompt shape. The two routes
    do not share `cache_control` regions and there is no migration path
    for in-flight conversion. If you add a UI affordance to "switch
    modules", build it as "end this session, start a new one with the new
    module".

## External references

- Repo: https://github.com/fvitak/SpringRidgeDnD
- Deploy: https://spring-ridge-dnd.vercel.app
