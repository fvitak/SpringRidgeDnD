# Decisions log (lightweight ADRs)

**Purpose:** capture non-obvious product, design, or engineering decisions
so the next session doesn't have to re-derive them. One entry per
decision. Keep entries short. Append, don't edit — if a decision is
reversed, add a new entry that supersedes the old one.

**Format:**

```
### YYYY-MM-DD — [Area] Short title
**Decision:** the thing we chose.
**Context:** what was the forcing function.
**Alternatives considered:** briefly.
**Consequences:** who now has to do what, and any sharp edges.
**Supersedes:** (optional) link to older entry.
```

---

### 2026-04-22 — [Process] Adopt role-scoped subagents + file-based project state
**Decision:** Introduce four subagents (Product Manager, UX Designer, Lead
Engineer, Engineer) in `.claude/agents/` and route project state through
markdown docs under `docs/` instead of through chat memory.
**Context:** Frank reported that context was getting lost across sessions
despite `CLAUDE.md` / `AGENTS.md` being present. Root cause: `AGENTS.md`
only contained the Next.js warning, and all other state (PRD, backlog,
architecture) lived in a `.docx` that's hard to diff or update
incrementally.
**Alternatives considered:** continue with single-agent sessions and lean
on the Memory feature; split state across multiple `.docx` files.
**Consequences:** PM now owns PRD/BACKLOG; UX owns DESIGN-SYSTEM; Lead Eng
owns ARCHITECTURE + sprint plans; generic Engineers cannot edit spec docs.
Every session now opens by the main agent reading `AGENTS.md` and
delegating.

### (Pre-existing, retro-documented) — [Engineering] Pass full JSON history to Claude, not narration-only
**Decision:** When replaying event log turns into Claude's context, send
`JSON.stringify(entry.ai_response)` for each prior turn.
**Context:** After 2–3 turns, Claude drifted off the Zod schema if only the
narration text was in history.
**Consequences:** Slightly higher token cost per turn (mitigated by prompt
caching); stable schema adherence across long sessions.

### (Pre-existing, retro-documented) — [Engineering] Enable ephemeral prompt cache on system prompt
**Decision:** Send the Wild Sheep Chase system prompt with
`cache_control: "ephemeral"`.
**Context:** The WSC prompt is large (full lore, rules, NPC roster). TTL
is 5 minutes. Keeps per-turn cost manageable.
**Consequences:** The system prompt must stay byte-stable across turns in
a session. Any code path that mutates it per turn (e.g. stuffing current
scene into the system prompt) would defeat the cache.

### (Pre-existing, retro-documented) — [Engineering] One environment only
**Decision:** `main` branch deploys directly to production via Vercel. No
staging environment.
**Context:** Solo side project; overhead of maintaining staging isn't
worth it.
**Consequences:** Migrations are forward-only and additive. Breaking
changes must be shipped behind a flag or split across two deploys.

### (Pre-existing, retro-documented) — [Product] Hidden drunkenness tolerance per character
**Decision:** Each character has a `tolerance_threshold` (1–9) stored in
DB but never surfaced in narration or UI.
**Context:** Emerged from playtest — drunkenness mechanic needs variance
without becoming a "stat to min-max".
**Consequences:** Keep it out of the system prompt, character sheet, and
any tooltip. If it leaks into UI by accident, it's a bug.

### 2026-04-29 — [Product] Ship Blackthorn map + token assets in the repo (reversed earlier ADR)
**Decision:** Commit `public/maps/blackthorn/` to the repo. Frank's call after first playtest — the Supabase Storage cutover is friction without payoff while the app is single-tenant private use. The earlier ADR (2026-04-28, Engineering — Map and token assets live in Supabase Storage) is **superseded** for the duration of private use; revisit before any public release.
**Context:** The original asset-licensing ADR routed assets to a private Supabase Storage bucket via `scripts/upload-blackthorn-assets.ts`. That added an extra setup step (env vars, script run, scenes.image_path migration) for every dev/test cycle. Frank explicitly chose to accept the licensing tradeoff: the app is hosted privately, the repo is private, the audience is two people.
**Alternatives considered:** Keep the gitignore + Storage path (rejected — friction on every clone/redeploy); host on a CDN (rejected — over-engineered for the audience).
**Consequences:** `public/maps/blackthorn/` is no longer gitignored. The upload script + Storage path stay in tree for the eventual public-release cutover. Add a "before going public" line to a future LAUNCH.md or revisit this ADR before any external link.
**Supersedes:** The 2026-04-28 entry on Supabase Storage for asset hosting (in private-use mode only).

### 2026-04-29 — [Engineering] Polymorphic position field + scenarios/scenes/tokens schema
**Decision:** Extend `dmResponseSchema` so `state_changes[].value` for `field: "position"` accepts either a free-text string (existing behaviour, used by WSC narration) **or** a structured `{ scene_id?: string, x: number, y: number, token_id?: string }` object. Add new tables `scenarios` and `scenes`. Add `sessions.scenario_id`, `game_state.current_scene_id`, `game_state.tokens` (JSONB), `characters.speed_squares` / `movement_used` / `dash_used`, `sessions.date_night_mode` / `current_rating`, `characters.rating_preference`.
**Context:** The Blackthorn implementation requires structured grid coordinates so the host map can render and the movement validator can adjudicate. Existing WSC sessions emit free-text positions and must keep working without re-runs. A union type on the Zod field lets both formats pass validation; the apply-state-changes router decides where to write each form.
**Alternatives considered:** A new `field: "grid_position"` distinct from `position` (rejected — doubles the AI's bookkeeping; pollutes prompt with two near-identical fields). Drop the string form entirely (rejected — invalidates every WSC `event_log` row replayed into Claude context). A separate `tokens` table (rejected for now — `combat_state.initiative` already lives on game_state JSONB; consistency wins, single-row atomic writes are easier).
**Consequences:** `apply-state-changes.ts` grows a small dispatch in the `position` branch — string writes to `characters.position`, object writes to `game_state.tokens` (upsert by `token_id` or character match). The schema's union is `z.union([z.string(), z.object({ scene_id, x, y, token_id }).passthrough()])`. Sprint 5 / Phase 1 absorbs the migration cost; in-flight WSC sessions backfill `scenario_id = 'wild-sheep-chase'`. Pre-existing event_log rows replay unchanged because the string form is still valid.

### 2026-04-29 — [Product] Per-player content rating dial + DM averages active ratings
**Decision:** Each phone gets a content-rating dial (G / PG / PG-13 / R / NC-17) when Date Night Mode is enabled. The server computes the **floor** of active ratings (the most conservative wins) and writes it to `sessions.current_rating`. The system prompt receives the active rating as a directive ("the most conservative active player has set rating X — narrate at or below that tier"). Mid-session rating changes trigger a one-line DM acknowledgement in the host narration; richer private-channel notifications are deferred.
**Context:** Frank's call. The PDF's romance system gives each partner control over comfort level; we need an equivalent on-screen.
**Alternatives considered:** Take the **average** rating index (rejected — bumping past someone's stated comfort level on average is exactly what the system should not do). Take the **mode** (rejected — undefined for two players). Use a single host-set rating (rejected — defeats the per-player consent point).
**Consequences:** New columns: `characters.rating_preference` (TEXT default `'PG'`), `sessions.date_night_mode` (BOOLEAN default false), `sessions.current_rating` (TEXT default `'PG'`). New API: `POST /api/players/:id/rating`. Server recomputes session rating on each player update. Host screen surfaces the current rating in a small badge. The AI sees the active rating in `gameState` and gets explicit prompt instruction to honour it.

### 2026-04-28 — [Product] Add Rescue of the Blackthorn Clan as a second scenario (do not replace WSC)
**Decision:** Ship *Rescue of the Blackthorn Clan* as a second selectable adventure alongside *The Wild Sheep Chase*. Home-screen scenario picker presents both. Player count picker auto-locks to 2 when Blackthorn is selected.
**Context:** Frank wants the Blackthorn PDF (Urban Realms, *Date Night Dungeons #1*) playable in GRAIL with on-screen maps and click-to-move. Existing players mid-WSC should continue to work.
**Alternatives considered:** Replace WSC (rejected — breaks in-flight sessions and the WSC content is good); pure "homebrew adventure" pipe (rejected — Blackthorn is a fixed published adventure with specific maps/NPCs that benefit from purpose-built content).
**Consequences:** Need a `scenarios` table + `lib/scenarios/registry.ts`; `app/api/dm-action/route.ts` stops hard-importing the WSC prompt. Sessions get a `scenario_id` column; pre-existing sessions backfill to `'wild-sheep-chase'`. This delivers SCN-01 from the Sprint 6 backlog earlier than originally planned.

### 2026-04-28 — [Design] Map and tokens render on the host PC only; phones stay as character sheets
**Decision:** The tactical map view lives on the host laptop only. Player phones remain character-sheet-only — no map widget, no click-to-move on the phone. The active player walks up to the host laptop (or directs the host) to move their token.
**Context:** Frank's call when reviewing the implementation plan for Blackthorn. A hybrid (phone mini-map + host big map) was on the table; he chose host-only for simplicity and table-feel.
**Alternatives considered:** Hybrid (rejected — doubles the map UI surface area for marginal benefit when everyone is at the same table); phone-only (rejected — destroys the shared "look at the board together" feel).
**Consequences:** Phase 1/2 ship without any map UI on the phone. Phones get a "It's your turn — move your token at the host screen" banner during the active slot. No Realtime broadcast of token positions to phones is needed. Movement validation (A\* + speed/terrain) lives in `lib/movement/` and runs both client-side on hover (host map) and server-side on commit.

### 2026-04-28 — [Product] Date Night romance mechanics ship in Phase 3 with a toggle
**Decision:** Romance mechanics from the Blackthorn PDF (Turn-ons, Pet Peeves, First Impressions, Attraction Points, rating dial) are deferred to Phase 3 and shipped as an opt-in "Date Night Mode" toggle on session creation. Phase 1 and Phase 2 are straight 5E.
**Context:** The PDF is built around couple-friendly mechanics, but explicitly endorses a platonic / straight-5E playthrough. Shipping the maps + click-to-move first keeps the scope contained and lets the romance layer use the same hidden-stat pattern as the existing drunkenness system once it's built.
**Alternatives considered:** Phase 1 inclusion (rejected — too much scope at once); skip entirely (rejected — Frank wants it eventually).
**Consequences:** Hidden Turn-ons / Pet Peeves / Attraction Points implementation pattern mirrors `tolerance_threshold` (hidden, never surfaced in narration or UI). Rating dial may need an Anthropic policy review for higher tiers; recommend capping at PG-13 for the first ship.

### 2026-04-28 — [Engineering] Map and token assets live in Supabase Storage, not the public repo
**Decision:** Map images and circular NPC/PC tokens (extracted from the Blackthorn PDF) live in a private Supabase Storage bucket (`maps`), served via signed URLs. They are not committed to the repo, not placed under `public/`, and not gitignored-but-on-disk in the working tree.
**Context:** The Blackthorn PDF maps and tokens are © Urban Realms. Frank owns the PDF for personal use. Even with a private repo today, asset licensing is cleanest if the assets simply never enter the repo at all.
**Alternatives considered:** Place under `public/maps/blackthorn/` and gitignore (rejected — fragile, easy for an engineer to forget and accidentally commit); host on a CDN outside Supabase (rejected — adds an extra dependency for no gain).
**Consequences:** A one-time admin script (`scripts/upload-blackthorn-assets.ts`) reads from a local `_assets/blackthorn/` folder (gitignored, on Frank's machine) and uploads to Supabase. The server reads via Storage API. Walkable masks (small, structured) stay in Postgres as JSONB on the `scenes` table. If the app is ever made public, asset licensing must be revisited before launch.

### 2026-04-28 — [Process] File the Blackthorn implementation plan as a UX design doc and route through the agent team
**Decision:** The Blackthorn map/movement implementation plan is filed at `docs/design/SCENARIO-MAP-MOVEMENT-PLAN.md` as a UX-owned design draft. PM, UX, and Lead Engineer agents groom it from there into backlog stories, formal layout specs, and a Phase 1 sprint breakdown respectively.
**Context:** Frank's preference when given the choice between "keep as a working draft" and "file under `docs/`". File-based source-of-truth is the established norm in this repo per `AGENTS.md`.
**Consequences:** UX owns refinement of Section 3 (host screen layout) into a formal flow and updates `DESIGN-SYSTEM.md` with the path-preview / illegal-cell / opportunity-attack visual language. PM owns adding `MAP-` prefixed stories to `BACKLOG.md`. Lead Engineer owns the polymorphic `position` schema spike + ADR before any engineer touches `lib/schemas/dm-response.ts`. The plan doc itself can stay as the source-of-record draft until backlog stories supersede it.

### 2026-04-23 — [Design] Home screen uses commissioned artwork as full-viewport background
**Decision:** Replace the plain dark background + DOM title/subtitle on `/`
with a full-viewport fixed `<Image>` of the commissioned portrait artwork.
The h1 "GrAIl" and subtitle "AI Adventure Guide" are removed from the DOM
because the artwork renders equivalent branding. UI (adventure selector,
player count, CTA) floats over the image in a frosted-glass card anchored
to the lower-centre of the viewport.
**Context:** Frank commissioned portrait-format artwork featuring the GRAIL
logo and subtitle baked in. Duplicating them in DOM creates redundancy and
makes the home screen feel like a stock page with an image bolted on.
**Alternatives considered:** Keep h1 and subtitle, position them over the
image → creates redundancy and layout collision with the baked-in artwork
text. Use image as a panel beside the form → destroys the cinematic full-bleed
effect. Use CSS `background-image` → loses Next.js image optimisation.
**Consequences:** The frosted-glass card pattern is now documented in
DESIGN-SYSTEM.md as the standard for UI-over-artwork screens. If a second
artwork-backed screen is added (e.g. adventure select page), use the same
pattern. Engineer must use the Next.js 16 `<Image>` API (verify from
`node_modules/next/dist/docs/`) — not a raw `<img>` tag and not CSS.
