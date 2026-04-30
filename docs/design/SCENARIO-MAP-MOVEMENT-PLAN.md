# Rescue of the Blackthorn Clan — Map / Movement Plan

**Owner (drafting):** Main session (Cowork), 2026-04-28. **Drop-off owner:** UX Designer.
**Status:** Draft for grooming. Frank has confirmed the six headline decisions; team agents to refine into formal specs and backlog stories.
**Scope:** Pull *Rescue of the Blackthorn Clan* into GRAIL with visible maps, character/NPC chips on the map, click-to-move with movement validation, and beginner-friendly onboarding.
**Related:** ADR entries 2026-04-28 in `docs/DECISIONS.md` (six in a row).

---

## 1. What's in the PDF

The PDF is **"Rescue of the Blackthorn Clan"** by Catherine & Thomas Thrush / Urban Realms — the first in their *Date Night Dungeons* series. It's a different adventure than *The Wild Sheep Chase* the repo currently runs.

**Shape**
- 146 pages. Built for **2 PCs at level 4**: Wynn (Sorcerer) and Tarric (Ranger). Pre-generated.
- **Four scenarios**, each ≈1–2 hours, each contains exactly one combat plus exploration / RP. Total ≈4–8 hours.
- Designed for couples with explicit "**Date Night**" mechanics layered on top of standard 5E: Turn-ons, Pet Peeves, First Impressions, Attraction Points. Fully optional ("platonic friends can play, just skip the romance rolls").
- Adjustable rating dial (G / PG / PG-13 / R / NC-17).
- Designed for new GMs — explicit "Don't be a Rules Lawyer" guidance, plot-point markers showing what *must* happen, italicized read-aloud text, scenarios self-contained so partners can swap GM each scenario.

**The four scenarios**
1. *The Old Mill* — rescue Wynn from kidnappers at the mill. Combat inside or outside the building.
2. *Blackthorn Manor* — cultists infiltrate the manor at night to kidnap the heir. Multi-floor combat.
3. *The Approach* + *Temple of Nyarlathotep* — pursue the cultists into the wilderness; ambush + temple infiltration.
4. *Inner Sanctum* — final confrontation; multi-round summons (skeletons, etc.).

**The handouts at the back** are the bit that matters for this work
- Pre-built **character sheets** for Wynn and Tarric (pp 59–69).
- **Tokens** — circular badge portraits per scenario for every PC, NPC, and enemy (pp 74, 84, 102, 118).
- **Full-color grid maps** with squares clearly marked, scenario by scenario:
  - Scenario 1: Old Mill (left side, right side, both halves combine into one map).
  - Scenario 2: Blackthorn Manor — First Floor Left, First Floor Right, Second Floor, Ground Floor Left/Right.
  - Scenario 3: The Approach (forest); Temple of Nyarlathotep (Main Temple Left/Right).
  - Scenario 4: Inner Sanctum Left/Right.
- **Combat trackers** per scenario — initiative ladder + per-character stat block + a 24-row "running HP" column + a 24-cell rounds counter. They are the spec for what initiative + combat tracking should look like on screen.

**Key product implication:** the handouts are not optional flavor — the PDF *expects* the GM to print, cut out, and lay them on the table. We are replacing that physical layout with an on-screen one. So the PDF tells us exactly what the UI needs to render.

**Copyright** Frank's order number ("Order #51798438") is stamped on every page. He owns the PDF for personal use. The maps and tokens are © Urban Realms. **Action: assets live in Supabase Storage (per Frank's decision), not in the public repo.** Treat the system prompt content the same way — paraphrase rather than verbatim where possible.

---

## 2. What's already in the repo

The codebase is much further along than I expected. Sprints 1–3 shipped: sessions, character creator, mobile sheet over Realtime, full combat engine (initiative, action economy, conditions, death saves, concentration). Sprint 4 is in progress on polish + persistence + XP/loot.

Things that already exist and we should reuse:
- **AI response contract.** `dmResponseSchema` (Zod) already includes `state_changes` with a `position` field. Today `position` is a **TEXT description** ("Forest clearing, 30 ft from party"), not coordinates.
- **Per-character action economy.** `action_used`, `bonus_action_used`, `reaction_used` are real columns. Movement-per-turn fits cleanly here.
- **Real-time updates.** Mobile sheet already subscribes to its own row via Supabase Realtime — extending to map state is a small step.
- **Initiative tracker UI.** The right-hand sidebar already shows turn-by-turn HP/conditions; the new map view replaces "free description" with a visual.
- **Scenario seam.** Adventure name is already a dropdown on the home screen. The "Random Encounter" mode demonstrates the codebase already supports more than one scenario stylistically; what's missing is a **scenario registry** with its own prompt + content.
- **Backlog already plans for it.** Sprint 6 has SCN-01 (scenario selection) and IMG-01 (scene image). This work is essentially "deliver SCN-01 plus a tactical map layer."

Things that are *not* yet there and we need:
- No grid coordinates anywhere.
- No map images, no walkable masks, no token assets.
- No movement validation (speed, terrain, occupied cells, opportunity attacks).
- No multi-adventure prompt routing — `wild-sheep-chase.ts` is hard-imported in `app/api/dm-action/route.ts`.

---

## 3. The interaction model — host-only map

**Decision (Frank, 2026-04-28):** the map lives on the host PC only. Phones stay as character sheets. The active player walks up to the host laptop (or directs the host) to move their token.

This simplifies the design and matches the PRD's "one host PC, players on phones" assumption more cleanly than the hybrid I'd originally proposed. Implications:

- Phase 1/2 ship without any map UI on the phone.
- The mobile sheet adds a **"It's your turn — move your token at the host screen"** banner when the active player is on its slot.
- No Realtime broadcast of token positions to phones is needed for movement (positions only matter visually, and the phone has no map). Phones still get HP / conditions / death saves over Realtime, unchanged.

### Host screen (laptop) — proposed layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Header: "Blackthorn Clan — Scenario 1: The Old Mill"                 │
├──────────────────────────────────────┬───────────────────────────────┤
│                                       │  Initiative tracker          │
│                                       │  (existing, unchanged)       │
│         Map view (the main pane)      ├───────────────────────────────┤
│         - Background: scene image     │  Party chips                 │
│         - Square grid overlay         │  (existing, unchanged)       │
│         - Tokens placed by (x,y)      │                              │
│         - Active player: pulsing ring ├───────────────────────────────┤
│         - Hover: legal-move cells     │  Narration log               │
│           lit green                   │  (compressed — collapsible   │
│         - Path preview while dragging │   drawer below the map, or   │
│                                       │   slide-up from bottom)      │
├──────────────────────────────────────┴───────────────────────────────┤
│ Input bar (existing) — host types narration / DM actions             │
└──────────────────────────────────────────────────────────────────────┘
```

The narration log doesn't go away — it just demotes from primary pane to a collapsible drawer. The map is the primary pane during scenes that have a map; out-of-combat / travel scenes between maps revert to text-first.

### Phone (player's view)

```
┌─────────────────────┐
│ Tarric — Ranger     │
│ HP 35/35   AC 15    │
├─────────────────────┤
│  ⚔ It's your turn   │
│  Move your token at │
│  the host screen.   │
├─────────────────────┤
│  Action panel       │
│  [ Attack ]         │
│  [ Spell ▾ ]        │
│  [ Other action ]   │
├─────────────────────┤
│  Stats / inventory  │
│  (existing)         │
└─────────────────────┘
```

No mini-map. Movement happens on the host screen; the phone's job is "what attack/spell did you use, and what's my current HP".

### Click-flow on the host screen

The active player walks up to the laptop and:
1. Taps their token (highlighted with a pulsing ring).
2. Cursor changes; legal cells light green, illegal cells stay neutral.
3. Tap a destination → token slides over the path, DB writes, narration log gets a one-liner.

Or the host clicks on the active player's behalf based on what they say. Either flow lands on the same `POST /api/sessions/:id/move` endpoint.

---

## 4. Click-to-move + validation — how it works

### Movement rules to enforce (5E, simplified for new players)

| Rule | Implementation |
|---|---|
| Speed: typically 30 ft = 6 squares per turn | `character.speed_squares` (default 6, can be modified) |
| Difficult terrain: 2 squares of movement per square moved | Per-cell flag `is_difficult` on the walkable mask |
| Walls / obstacles | Per-cell flag `walkable: false` |
| Diagonal movement | 5E variant: every other diagonal counts as 2. Default to "5-foot diagonals" (every diagonal = 1) for beginners; toggle later. |
| Can't move through occupied cells (enemies) | Pathfinder rejects routes through enemy-occupied cells |
| Can move through allies (squeeze) | Path allowed; preview shows with caution color |
| Dash action: doubles movement for the turn | Action panel "Dash" toggle; doubles `remaining_squares` |
| Opportunity attacks: leaving a threatened cell triggers a reaction | Detect on path commit; surface as a **confirm** prompt: "This will provoke from Lookout. Continue?" |
| Once you've used your action, you still get movement | Action vs. movement are independent (already true in `action_used` / movement is currently untracked) |

### Pathfinding

`lib/movement/pathfind.ts` — **A\*** on the walkable grid. Returns the cheapest path or null if unreachable. Cost per cell:
- 1 if walkable + not occupied + not difficult
- 2 if difficult terrain
- ∞ if wall or occupied by a hostile

### Validation function (deterministic, server + client)

```ts
function validateMove(args: {
  characterId: string
  target: { x: number; y: number }
  mapState: MapState   // current cell occupancy + walkable mask
  characterState: CharacterState  // speed, position, dash status
}): ValidationResult
```

`ValidationResult` is:

```ts
type ValidationResult =
  | { ok: true; path: Cell[]; cost: number; remaining: number; provokes: NPCName[] }
  | { ok: false; reason: 'too_far' | 'blocked' | 'no_path' | 'turn_ended'; explanation: string }
```

The same function runs:
1. **On hover** (host screen) — to highlight legal cells in green, illegal cells red, with the reason in a tooltip.
2. **On commit** (server) — POST `/api/sessions/:id/move` re-runs validation against current DB state to prevent races.

### UX for "you can't do that"

The user said "you will correct them if they are moving illegally." Three forms of correction:

1. **Pre-emptive (ideal).** Legal cells are always highlighted before the player commits. Illegal cells don't react to hover, or get a red overlay with the reason on tap. This is the "no error needed because the error can't be made" version.
2. **Soft correction.** Player tries to move past their range — show a yellow ring at the maximum reachable cell along their intended path, and a hint: "That's 8 squares away — your speed is 6." Single tap commits the partial move.
3. **Hard rejection.** Server-side validation fails (race condition with another player). Toast: "Briar moved into that doorway just before you. Pick another destination."

### Opportunity attacks

When the planned path leaves a cell adjacent to an unfriendly token, the path preview goes amber and shows a `⚠ provokes from <NPC>` warning. Committing the move triggers a `pending_roll` for the NPC's reaction attack — which the existing roll modal already handles. This is one of the few places we need a new `state_change` field (`provoked_attacks`) — or, more cleanly, the AI handles it via narration since it has full game state.

### Movement is just one of several actions

Movement is half of a turn. The other half (attack, cast, dodge, etc.) still goes through the existing narration text input. So a turn looks like:

1. Active player taps map on host laptop → moves token. App writes `position` to DB. Narration log gets a one-liner: *"Tarric moves 4 squares to the edge of the wood, taking cover behind the oak."* The AI is *not* called for this — the app generates the line locally. (See Section 6 for why this matters for cost.)
2. Player taps "Attack" on phone or types in the host input → that's a normal AI turn. The AI sees the new position in `game_state`.

This split matters: clicking around a map is cheap; calling Claude for every micro-movement would 10x the token bill.

---

## 5. What needs to change architecturally

### Schema additions (new migrations)

```sql
-- 1. Scenario registry
CREATE TABLE scenarios (
  id          TEXT PRIMARY KEY,         -- 'wild-sheep-chase' | 'blackthorn-clan'
  name        TEXT NOT NULL,
  player_count_min INTEGER NOT NULL,
  player_count_max INTEGER NOT NULL,
  prompt_module TEXT NOT NULL           -- 'lib/prompts/blackthorn-clan'
);

-- 2. Scenes (a scene is a map with a specific layout)
CREATE TABLE scenes (
  id           TEXT PRIMARY KEY,         -- 'blackthorn.s1.old-mill-exterior'
  scenario_id  TEXT NOT NULL REFERENCES scenarios(id),
  name         TEXT NOT NULL,
  image_path   TEXT NOT NULL,            -- Supabase Storage URL: 'storage://maps/blackthorn/s1-mill-exterior.png'
  grid_cols    INTEGER NOT NULL,
  grid_rows    INTEGER NOT NULL,
  cell_px      INTEGER NOT NULL,         -- pixels per cell on the source image
  origin_x_px  INTEGER NOT NULL,         -- where the (0,0) cell starts on the image
  origin_y_px  INTEGER NOT NULL,
  walkable     JSONB NOT NULL,           -- 2D array of cell flags
  regions      JSONB NOT NULL,           -- [{ name, cells: [[x,y],...] }]
  exits        JSONB NOT NULL            -- [{ to_scene, cells: [[x,y],...] }]
);

-- 3. Game state gains a current scene + token positions
ALTER TABLE game_state ADD COLUMN current_scene_id TEXT REFERENCES scenes(id);
ALTER TABLE game_state ADD COLUMN tokens JSONB NOT NULL DEFAULT '[]';
-- token shape: { id, kind: 'pc'|'npc', character_id?, name, image_path, x, y, size, hp, max_hp, conditions[], is_friendly }

-- 4. Characters get speed + dash flag
ALTER TABLE characters ADD COLUMN speed_squares INTEGER NOT NULL DEFAULT 6;
ALTER TABLE characters ADD COLUMN movement_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN dash_used     BOOLEAN NOT NULL DEFAULT false;

-- 5. The existing characters.position TEXT column stays (for narration), but
-- structured position lives on the game_state.tokens row indexed by character_id.
```

Note: I'm storing tokens on `game_state.tokens` (JSONB, single row per session) rather than a separate `tokens` table because a) it's already how `combat_state.initiative` is stored, b) it lets us write all token positions atomically per turn, c) RLS stays simple.

### Asset storage — Supabase

Per Frank's decision, map images and token portraits live in **Supabase Storage**, not in `public/`:

- New bucket: `maps` (private; signed URLs issued per-session for assets the player should see).
- Folder structure: `maps/blackthorn/scenes/`, `maps/blackthorn/tokens/`.
- Upload pipeline: a one-time admin script (`scripts/upload-blackthorn-assets.ts`) reads from a local `_assets/blackthorn/` folder (gitignored) and pushes to Supabase. Frank runs this once on his machine; the server reads via Storage API, never the filesystem.
- Walkable masks stay in Postgres (small, structured, JSONB).

This keeps licensed assets off the public repo entirely while still serving them to the running app.

### Walkable mask format

For each scene, the walkable mask is hand-authored once per map by tracing the rooms. Stored as:

```json
{
  "cols": 15,
  "rows": 20,
  "cells": "WWWWWWWWWWWWWWW\nW.....DDD......\nW...wynn...W..\n..."
}
```

where `W` = wall, `.` = floor, `D` = difficult terrain, `>` = stairs/exit, etc. Compact, diff-friendly, easy to author. Decoded once at map load.

### Prompt + schema changes (small, targeted)

- New `lib/prompts/blackthorn-clan.ts` — full system prompt for the new scenario, structured like `wild-sheep-chase.ts`. Includes scene definitions, NPC dossiers, plot-point gates.
- New `lib/scenarios/registry.ts` — central index that `app/api/dm-action/route.ts` reads from based on `sessions.scenario_id`. Removes the hard import.
- `dmResponseSchema` extension: `state_changes` gains a structured `position` shape:
  ```ts
  { entity, field: "position", value: string | { scene_id?: string, x: number, y: number } }
  ```
  The string form stays valid for back-compat with WSC narration. Coordinate form lights up the map UI.
- New `actions_required` type: `move`. Today there are `roll | choice | confirm`. Adding `move` lets the AI explicitly request "Tarric moves first — pick a square within 30 ft." This is optional — the simpler version is to let movement always be available on the active player's turn without an AI prompt.

This is a Zod schema change, which the codebase says needs an ADR (`docs/DECISIONS.md`) and a Lead Engineer signoff. I'd want to spike this in a small branch before committing.

### The AI sees the new world via `gameState`

`buildSystemPrompt(gameState)` already injects the current state JSON into the prompt. We add to that JSON:

```jsonc
{
  "current_scene": {
    "id": "blackthorn.s1.old-mill-exterior",
    "name": "Outside the Old Mill",
    "rooms": ["Riverbank", "Mill door", "Mill roof"],
    "tokens": [
      { "name": "Tarric", "x": 3, "y": 12, "is_player": true, "hp": 35 },
      { "name": "Wynn", "x": 6, "y": 4, "is_player": true, "hp": 27, "conditions": ["restrained"] },
      { "name": "Lookout (Harold)", "x": 8, "y": 6, "is_player": false, "hp": 11 }
    ]
  }
}
```

The AI now narrates from spatial truth. It can reference rooms by name, knows who's adjacent to whom, and won't say "Tarric is in the kitchen" when Tarric just moved to the loft.

---

## 6. Cost — the part that bites if we ignore it

The existing repo passes the last 6 turns as full JSON to Claude. Each token position is a few characters but if every micro-movement is a "turn", we balloon the history. Three rules to keep this sane:

1. **Map clicks don't call Claude.** Movements write to the DB. The AI sees the new position next time it's actually invoked (on an attack, spell, dialogue, scene transition, etc.).
2. **Per-turn movement summary, not per-step.** When the AI is invoked, the input batches `[Tarric] moved from (3,12) to (3,8) (4 squares, took the long way around the rocks)`. One line, not four.
3. **Token state in the system block, not the message history.** The current scene + token positions go into the cached system prompt's `gameState` block (which already invalidates per turn). They don't accumulate in `event_log`.

I'd estimate this adds ≈300 tokens per turn at worst — well within the existing prompt-cache discount.

---

## 7. The romance / Date Night mechanics — Phase 3 with toggle (confirmed)

Per Frank's decision, romance mechanics ship in Phase 3 as an opt-in. Session creation gets a "Date Night Mode" checkbox. When on, character creation includes a turn-on/pet-peeve picker. The AI gets prompt rules for Attraction Points, hidden like `tolerance_threshold`. Mobile sheet shows current AP. Implementation pattern mirrors the existing drunkenness system.

Phase 1 and Phase 2 ship as straight 5E.

---

## 8. Suggested phasing

I'd cut this work into four phases. Each phase ends in something that runs.

### Phase 1 — Scenario routing + Old Mill map, no movement (≈1 sprint)

Goal: pick *Rescue of the Blackthorn Clan*, see the Old Mill map with character chips placed on it. AI moves chips via narration only — no click-to-move yet.

- New `lib/prompts/blackthorn-clan.ts` (paraphrasing PDF content; flag any verbatim sections).
- New `lib/scenarios/registry.ts`; `dm-action/route.ts` reads from it.
- Sessions table gets a `scenario_id`.
- New migrations: `scenarios`, `scenes` tables; seed Old Mill scene.
- New `Map` React component on the host screen.
- AI emits structured `position` `{x, y}`; chips render at those coords.
- Tokens for Wynn, Tarric, the lookout, ruffians extracted from the PDF and uploaded to Supabase Storage via `scripts/upload-blackthorn-assets.ts`.
- Player count picker auto-locks to 2 when Blackthorn is selected.

**Verify by:** A real run-through of Scenario 1 where the chip positions follow the AI's narration. Combat works exactly as today (text-driven). Map is "for show."

### Phase 2 — Click-to-move with validation, host screen only (≈1 sprint)

Goal: on the active player's turn, they click the map on the host laptop and their chip moves. Illegal moves are corrected.

- `lib/movement/pathfind.ts` (A\*) and `lib/movement/validate-move.ts`.
- New API: `POST /api/sessions/:id/move` (server-side validation, DB write).
- Hover/click UX on host map: green legal cells, amber path preview, red illegal with reason.
- Opportunity attack detection (warn before commit).
- Speed + Dash + difficult terrain wired into the validator.
- New `actions_required: "move"` type for cases where the AI explicitly requests a positional action.
- Mobile sheet adds a "It's your turn — move your token at the host screen" banner during the active slot.

**Verify by:** A planned playtest of the Old Mill combat. Confirm: a) moves under 6 squares commit, b) moves over 6 squares are rejected with a clear message, c) a path through a wall is rejected, d) leaving a cell next to the lookout warns about an opportunity attack.

### Phase 3 — Scenarios 2/3/4 + Date Night toggle (≈1.5 sprints)

Goal: full 4-scenario adventure runnable end-to-end, with Date Night mode as an opt-in.

- All remaining maps + tokens + walkable masks + region labels (uploaded via the same admin script).
- Scene transitions wired (when AI says "you arrive at the manor", `current_scene_id` flips).
- Multi-floor map support (Blackthorn Manor has 3 floors — likely needs a "floor selector" tab on the map widget).
- Date Night mode: hidden Turn-ons / Pet Peeves; Attraction Points; optional First Impressions / First Intimacy flow.
- Rating dial (G / PG / PG-13 / R / NC-17) — AI's tone responds. May need an Anthropic policy review on the higher tiers; recommend capping at PG-13 for the first ship.

### Phase 4 — Beginner onboarding pass

Goal: a group with no D&D experience can complete Scenario 1 without anyone reading a rulebook.

- First-time tutorial: when the host hits "Begin Adventure" on Blackthorn for the first time, walk through "this is your token, this is the grid, this is how movement works" in three steps over the map.
- In-line rules helpers — tap a condition like "Restrained" on a chip to see what it means. Tap "Dash" to see what it does and the cost.
- Action panel on phones with named buttons (Move-instructions / Attack / Cast / Dodge / Disengage / Hide), each launching the right interaction.
- AI prompt addition: explicit "rules tutoring" mode — when a player's action is mechanically vague, the AI explains the rule before resolving.

---

## 9. Risks / things to watch

1. **Schema change to `dmResponseSchema`.** Touches the contract every prior turn was validated against. Needs an ADR and careful migration of in-flight WSC sessions. Suggested mitigation: keep `position` polymorphic (string OR `{x,y}`) so old logs replay fine.
2. **Map authoring is hand work.** Each scene needs a walkable mask traced once. Plan ≈30 min per map × ~10 maps = an afternoon. Worth building a simple in-browser "trace this map" admin tool early.
3. **Two-player scenario in a UI built for 4.** The lobby grid, party sidebar, turn queue all assume 2–4 players today. Should mostly Just Work, but expect cosmetic cleanup.
4. **PDF asset licensing.** The maps and tokens are © Urban Realms. Storing them in Supabase keeps them off any public repo, but if the app is ever shared publicly, licensed assets must be removed or replaced. Storage bucket should be private with signed URLs.
5. **AI off-by-one on coordinates.** LLMs are notoriously bad at grid math. Mitigation: don't ask the AI to compute paths — the app does that. The AI only emits start/end positions; the validator handles the rest.
6. **Existing Wild Sheep Chase players.** Anyone mid-WSC when this ships should keep working. The scenario registry must default `scenario_id = 'wild-sheep-chase'` for sessions that pre-date the new column.
7. **Active-player feedback on the phone.** Without a map, the active player needs a clear "it's your turn, the host map is showing your moves" cue. Easy to under-design — UX should treat this as a first-class state, not a banner afterthought.

---

## 10. Confirmed decisions (from Frank, 2026-04-28)

| # | Question | Decision |
|---|---|---|
| 1 | Replace WSC, or run side-by-side? | **Side-by-side** — add to the scenario picker. |
| 2 | Map layout — host-only / phone-only / hybrid? | **Host PC only**; phones stay as character info. |
| 3 | Romance mechanics — Phase 1 or Phase 3 toggle? | **Phase 3 toggle.** |
| 4 | File this draft as UX design doc? | **Yes** — file as `docs/design/SCENARIO-MAP-MOVEMENT-PLAN.md`; team grooms. |
| 5 | Map asset storage? | **Supabase Storage** (private bucket, signed URLs). |
| 6 | Phase plan changes? | **None.** |

ADR entries logged in `docs/DECISIONS.md` with the same date.

---

## 11. Hand-off — what each agent does next

- **Product Manager:** groom this into `docs/BACKLOG.md` as a new theme (suggest `MAP` prefix — `MAP-01` scenario registry, `MAP-02` Old Mill scene, `MAP-03` host map widget, `MAP-04` validation, etc.). Slot Phase 1 stories into Sprint 5 or carve a dedicated Sprint 5.5 if Sprint 5's voice/notebook scope can't absorb it.
- **UX Designer:** turn Section 3's host-screen wireframe into a formal flow under `docs/design/`, with the active-player phone state called out (Risk #7). Decide on the path-preview, illegal-cell, and opportunity-attack visual language and add it to `DESIGN-SYSTEM.md`.
- **Lead Engineer:** break down Phase 1 into engineering tasks in the next sprint file. Spike the polymorphic `position` schema change first; write the ADR for it before any engineer touches `dm-response.ts`. Confirm `scripts/upload-blackthorn-assets.ts` is the right shape for Supabase asset upload.
- **Engineer:** picks up tasks once Lead Engineer has briefed them in the sprint file.

When this plan is grooming-complete, this file can stay here as the source-of-record draft, or get archived once the backlog stories take over.
