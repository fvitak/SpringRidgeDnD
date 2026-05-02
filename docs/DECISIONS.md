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

### 2026-05-01 — [Engineering] Host UI route-switches `/api/dm-action` vs `/api/dm-action-v2` client-side off `session.module_id`
**Decision:** The host screen's `NarrationScreen` computes `dmActionUrl = session.module_id ? '/api/dm-action-v2' : '/api/dm-action'` once on render and uses that URL at both fetch sites (`handleSubmit` and `handleAskDM`). `session.module_id` is plumbed through from the server: `app/api/sessions/route.ts` writes `module_id: scenario.moduleId ?? null` at insert time and returns it in the POST body; `app/api/sessions/[id]/route.ts` returns it from the GET. Scenarios opt in via a new optional `moduleId` field on `ScenarioDefinition` in `lib/scenarios/registry.ts` (Blackthorn → `"blackthorn"`; WSC and Random Encounter stay undefined → NULL → legacy route). The request body shape stays identical on both routes (`{ session_id, player_input, ... }`); the v2 route resolves `module_id` server-side from `sessions.module_id`, so the client deliberately does NOT pass it in the body.
**Context:** Even though PIV-02b through PIV-04 shipped the v2 route, runtime, romance, and scene-ingestion plumbing, the host UI still hard-coded `/api/dm-action`. Frank could not actually play Blackthorn in the browser. The blocker was a single-line URL choice — the question was where it should live.
**Alternatives considered:**
- Server-side proxy: have `/api/dm-action` detect `sessions.module_id` and forward to `/api/dm-action-v2`. Rejected — adds hidden indirection to the legacy route we explicitly want to leave bit-stable, and makes the WSC prompt-cache behaviour more fragile (the legacy route owns the WSC system prompt; a proxy fork would mean two cache regions sharing a URL).
- Pass `module_id` in the request body from the client (a third source of truth alongside `sessions.module_id` and `scenario.moduleId`). Rejected — the v2 route's body fallback exists only for legacy callers like the smoke test that pre-date the column. New code paths must let the server own resolution.
- Add a feature flag in `settings` or env. Rejected — `sessions.module_id` IS the feature flag; NULL means legacy and set means v2, with no extra state to maintain.
- Resolve `module_id` from `scenario_id` client-side via a constant table. Rejected — fragments truth across two files (`lib/scenarios/registry.ts` and the constant); a single registry field that the server writes into the row is cleaner.
**Consequences:**
- `app/api/sessions/route.ts` POST response now includes `module_id` (additive — old clients that ignore it are unaffected). The GET likewise.
- `lib/scenarios/registry.ts` gains an optional `moduleId` field. Adding a new module-runner scenario is now: register in `lib/adventures/<id>/`, add `moduleId: '<id>'` to the scenario row, done.
- Existing WSC sessions in flight have `module_id IS NULL` (per the PIV-02b migration), so they keep routing to `/api/dm-action`. No backfill required.
- The two routes are not merged and the legacy route is not refactored. WSC stays bit-stable.
- The host UI does not yet render the v2-only response fields (`dm_overrides`, `scene_transition`, `narration_beats`) — they're stripped by Zod's default object behaviour at server-side `parseDMResponse` and never reach the client. PIV-05 will surface the new fields visually.

---

### 2026-04-30 — [Engineering] Scene-context schema additive v1 widenings (NPC pool, NPC level/class, structured items)
**Decision:** Three additive widenings to `lib/schemas/scene-context.ts` close contract gaps surfaced during Sprint 4.7 Part 1 ingestion of Blackthorn:
1. `Manifest.shared_npcs?: NPCStatBlock[]` — module-level NPC pool. Cross-scene NPCs (Harold the Lookout in Blackthorn Parts 1+2) live once at the manifest level. The validator's cross-reference rule resolves `location.npcs_present[]` against `scene.npcs[]` *or* `manifest.shared_npcs[]`, failing only when the id is missing from both.
2. `NPCStatBlock.level?: number` and `NPCStatBlock.class?: string` — first-class numeric level (0–20) and class string. `role` keeps the descriptive label ("Lookout"); the prose-buried "Bandit (level 2)" pattern lifts out of `role` so the runtime can compute proficiency bonuses without re-parsing.
3. `Location.items` widened from `string[]` to `Array<string | { id, name, properties? }>` via `z.union`. Inert dressing keeps the string form; mechanically active items (Wynn's Ring of Regeneration, Amulet of Protection) use the object form. `properties` is a free-form `Record<string, unknown>` for v1.

`SCENE_CONTEXT_SCHEMA_VERSION` does **not** bump — the changes are strictly additive and the string form of `items` is still valid, so every v1 document validates clean. Versioning policy already says additive changes hold the version; the runtime-test fixture (v1) revalidates without edits, which is the load-bearing proof.

**Context:** The previous engineer's PIV-07-style ingestion report flagged five contract gaps. PM/Frank chose to fix gaps 1, 4, 5 now and defer 2 and 3 (`narration_beats` type granularity, DC consequence chains). Without gap 1 fixed, Part 2 of Blackthorn would either duplicate Harold across two scenes (drifts on stat edits) or fail the validator's NPC cross-reference. Without gap 4, the runtime would have to regex level/class out of the `role` blob. Without gap 5, magical items in Part 2 would have nowhere structured to land.
**Alternatives considered:**
- Bump `SCENE_CONTEXT_SCHEMA_VERSION` to `2` for clarity (rejected — v1 data still validates clean; bumping would force a synthetic migration script for zero behaviour change and break the runtime-test fixture's literal-version check).
- Make `items` strictly `StructuredItem[]` and force a one-shot retrofit of every existing scene's strings (rejected — bigger blast radius for no gain; the union accepts both indefinitely, and authoring effort is the same per-item).
- Encode level/class as a single `level_class: "Bandit 2"` string field (rejected — defeats the point; the runtime would still need to parse).
- Keep shared NPCs as a separate `shared-npcs.json` file under `lib/adventures/<module>/` (rejected — adds a third file shape to load and a new cross-file consistency check; one optional manifest field is cheaper).
**Consequences:**
- `lib/adventures/blackthorn/manifest.json` now carries Harold in `shared_npcs[]`. The Old Mill scene's `npcs[]` is empty; `location[exterior].npcs_present[]` continues to reference `lookout-harold-longfingers` and resolves through the new pool.
- Wynn's magical items remain unmodelled in Part 1 — Part 2 will introduce them via the object form when Oberon Scott is ingested.
- The validator's NPC-cross-reference error message no longer includes the "see report" footnote about an unresolved design question (the design is now resolved).
- Future modules with reused-across-scenes NPCs adopt `manifest.shared_npcs[]` as the canonical home; per-scene `npcs[]` is for one-off NPCs only.
- `dmResponseSchema` is unaffected — runtime emits via `state_changes`/`attraction_point_changes` and never round-trips the scene-context shape back into Claude's response.
- One landmine: Zod's default `z.object()` strips unknown keys, so the `_npcs_note` annotation I added to the Old Mill scene is silently dropped on parse. That's the same pattern as the existing `_part_1_todo` field — the comment lives in the source-of-truth JSON for human authors, never in the validated runtime object. Don't add `.passthrough()` to fix this; the strip is desirable.

---

### 2026-04-30 — [Engineering] Adventure validator demotes dangling `leads_to_scene_id` to a warning during partial ingestion
**Decision:** `scripts/validate-adventures.ts` reports `scene_exit_conditions[*].leads_to_scene_id` targets that don't resolve to a sibling scene file as **warnings**, not errors. The same is true for `manifest.scenarios[*].first_scene_id` whose scene file doesn't yet exist. Per-scene schema failures, dangling NPC references inside a scene, and duplicate `points_of_entry` ids within a location remain hard errors.
**Context:** ING-04 ingests Blackthorn one slice at a time (Part 1 = Exterior + Lookout only; Part 2 = the rest of Scene One; later parts = Scenarios Two, Three, Four). If unresolved scene-exit targets were errors, the harness would refuse to validate any partial work — defeating the purpose of running the harness during ingestion.
**Alternatives considered:**
- Treat all dangling refs as errors and require ingestion to land in one big commit (rejected — defeats incremental review and makes Frank's Part-1-then-Part-2 loop impossible).
- Add a `--strict` flag that promotes warnings to errors for the final pre-ship run (deferred — premature; we'll add it when ING-05 lands and we want the gate clean).
- Require a per-scene `_partial: true` field that turns off the check for that scene (rejected — adds schema noise; the warning-vs-error split already communicates "not finished yet" without a content-level marker).
**Consequences:**
- During Sprint 4.7, the harness will print warnings for every not-yet-ingested scene reference. That's expected and visible in CI output.
- Once Scenarios Two through Four land, the warnings naturally disappear without a code change.
- A real bug — typo in a scene id — still surfaces as a warning, which is gentler than we'd like in the long run. Adding `--strict` later is the migration path.
- The validator's hard errors (schema failures, duplicate ids, dangling NPC refs *within* a scene) catch the regressions that actually break the runtime; soft warnings catch the partial-ingestion ones that don't.

---

### 2026-05-01 — [Engineering] Romance intake-vs-sheet split detected via two GET endpoints, not encoded in routing
**Decision:** PIV-07's mobile romance UI lives at the existing `/player/[id]` route. On mount we fan out two API calls — `GET /api/sessions/[id]` (to learn `date_night_mode`) and `GET /api/characters/[id]/romance/status?viewer=<id>` (a new owner-only endpoint that returns `{ has_turn_ons, has_pet_peeves, has_first_impression, complete }`). The intake card flow renders early-return when `date_night_mode && romance_enabled && !complete`; otherwise the regular sheet renders with a `RomanceSection` block. The First Impression's d20s are rolled **client-side** (the existing API already accepts `rolls: [d20, d20, d20]`) so the player sees the dice tumble in front of them. Partner discovery uses `GET /api/sessions/[id]/players` and picks the OTHER character (sessions are 2-PC for Blackthorn).
**Context:** The brief listed three candidate decisions worth an ADR (intake-vs-sheet split detection, partner resolution, client-vs-server first impression rolls). All three landed on the same end of the fence — keep the existing routes, layer two thin endpoints (`/romance/status`, `/romance/tables`) for the new client surface, do client-side d20s. The alternative — a separate `/player/[id]/intake` route — would have forked the URL the QR-code lands on (which is already a load-bearing surface in `/join/[token]`) and added a second redirect to manage.
**Alternatives considered:**
- Dedicated `/player/[id]/intake` route (rejected — fragments the QR landing flow).
- Server-side rolls for First Impression (rejected — the PDF design has the *player* rolling those dice and watching them resolve; client-side rolls preserve the moment, and the engine already validates each d20 against the scripted ranges).
- Encode partner-id in the URL or in `character_romance` (rejected — the existing 2-PC session schema already implies "the other one"; an explicit field would drift).
- Make the status endpoint return partner-progress too (rejected — even a "your partner has finished setup" boolean leaks timing; we only show partner progress through the existing host UI).
**Consequences:**
- Two new owner-gated endpoints: `GET /api/characters/[id]/romance/status` and `GET /api/characters/[id]/romance/tables`. Both require `viewer === id` (same coarse owner check as the rest of `/romance/*`).
- The intake's three POSTs all carry `actor: characterId`; partner id is **never** passed.
- The `RomanceSection` defensively fails closed if a partner-shape ever leaks `turn_ons` / `pet_peeves` — that would be a backend regression and we want it loud, not silently filtered.
- WSC sessions are unaffected — `date_night_mode === false` keeps `intakeStatus` null and the sheet renders unchanged.
- Future PIV-08 (host-side intake helper) can relax the owner-only check on `/romance/tables` if it needs to peek at the same data; today it's symmetric with the rest of the privacy gate.

---

### 2026-05-01 — [Engineering] P0 fix: dmResponseSchema now actually contains `dm_overrides`, `scene_transition`, `narration_beats`
**Decision:** Add the three optional fields the rest of the system was already trying to use. PIV-02b's brief required them; the engineer's report claimed they were shipped; in fact only `attraction_point_changes` (added later by PIV-04) was in the schema. Zod's `z.object({...})` strips unknown keys, so the v2 route's casts (`(dmResponse as Record<string, unknown>).dm_overrides`) read `undefined`, the apply step received `undefined` for both, and **scene advancement was silently broken** — the runtime could never move past Scene 1. Found while wiring the host UI to v2.
**Context:** Surfaced when the host-UI-routing engineer flagged it in their open question. Verified via grep against `lib/schemas/dm-response.ts`. Fixed by:
1. Adding `dmOverrideSchema` (with the load-bearing `direction: 'toward_success' | 'toward_consequence'` flag from the bidirectional rule-of-cool ADR), `sceneTransitionSchema`, and `narrationBeatSchema` (loose `type: string` per the strict/loose ADR) to `lib/schemas/dm-response.ts`.
2. Wiring `apply-state-changes.ts` to actually consume `sceneTransition` (writes `game_state.current_scene_id = transition.to_scene_id`).
3. Cleaning up the v2 route's casts to read directly from the now-typed `DMResponse`.
**Alternatives considered:**
- *Use a wider local schema only at the v2 route's parse site.* Rejected — two sources of truth, drift risk.
- *Leave dmOverrides as `unknown` in the apply step's interface.* Rejected — typed contract is cheap.
- *Promote `dmOverrides` to a dedicated `dm_overrides_log` table now.* Deferred — the event_log JSONB already captures them auditably; promotion only makes sense if drift surveillance becomes real work.
**Consequences:**
- Scene advancement now works. Without this fix, a Blackthorn playtest would have stalled permanently at Scene 1 the moment Wynn and Tarric tried to leave the mill.
- **Process lesson:** agent-claimed work needs trust-but-verify on contract surfaces before downstream stories assume it. The smoke test passed all along because it didn't exercise scene transitions or override emission. Future practice: any story that adds schema fields gets a round-trip test that emits + observes the field, not just a parse-validation test.

---

### 2026-04-30 — [Engineering] Romance AP deltas ride a sidecar `attraction_point_changes[]`, not `state_changes[]`
**Decision:** Add a top-level optional array `attraction_point_changes: Array<{ character_id, delta, reason }>` to `dmResponseSchema`. Route it through `applyStateChanges(sessionId, stateChanges, extras?)` via a new typed `extras.attractionPointChanges` parameter. The handler resolves `character_id` against `characters.id` (UUID) → `characters.character_name` (case-insensitive) → slot label (`"wynn"`/`"tarric"`), upserts the `character_romance` row if missing, and appends to `current_ap` + `ap_history` via the pure `applyApDelta` helper. The numeric AP never leaves the server — only band labels do, via `GET /api/characters/[id]/romance`.
**Context:** PIV-04 needed an AI-emit channel for AP changes. Reusing `state_changes[]` (with `field: "attraction_points"`) was tempting because the apply step already routes that array, but it would mean the AI would have to emit *post-delta totals*, which forces the AI to know the *current* AP — which is exactly the hidden-stat invariant we want to preserve. A sidecar that takes deltas only lets the runtime keep the running total private.
**Alternatives considered:**
- `state_changes[].field = "attraction_points"` (rejected — see above; would require the AI to know the current total).
- A separate `/api/dm-action-v2/ap-delta` endpoint called after each turn (rejected — splits the apply transaction across two requests; harder to keep `ap_history` consistent with the turn that produced the delta).
- Putting the entire engine inline in `apply-state-changes.ts` rather than calling `applyApDelta` (rejected — duplicates the audit-history shape the privacy test asserts on).
**Consequences:**
- The schema gains one optional field; existing callers with no AP changes are unaffected.
- `applyStateChanges` signature widens with an optional `extras?: ApplyExtras` argument. Reserved fields `dmOverrides` / `sceneTransition` are accepted today but ignored — those are PIV-02b/PIV-06 territory.
- The privacy gate in `app/api/characters/[id]/romance/_shared.ts → shapeForViewer` continues to be the only point at which AP-derived data crosses the API boundary; AP-as-band only.
- PIV-07 (mobile romance UI) doesn't need to call any new endpoint to see updated bands — the GET endpoint will return the new band on next read after the AI fires a delta.
- The auto-create behaviour in `applyAttractionPointChanges` means a session that never ran the romance intake forms can still receive deltas; the row gets a fresh `current_ap = 0` and the delta lands cleanly. This is intentional so the AI doesn't need to know about intake-form state.

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

---

### 2026-04-30 — [Engineering] Blackthorn Scene One: opposed-check rules live in `description`, magical items live as Room 2 structured items
**Decision:** Two non-obvious authoring calls during Part 2 ingest of Blackthorn Scenario One:
1. **Opposed-check movement rules** (Stealth -2 / -4 vs. Perception, on the Roof / Room 1 window-climb / Loft floor) are encoded in the location's free-text `description` field rather than as `dc_checks[]` entries. The schema requires `dc_checks[].dc >= 1`, but these PDF rules are *opposed checks* with no fixed DC — the contest is the climber's modified Stealth vs. the watcher's Perception. Choosing a placeholder DC like 1 or 10 would be inventing data. Putting the rule in prose keeps the AI informed without polluting the structured DC table.
2. **Wynn's recoverable magic items** (Ring of Regeneration, Amulet of Protection) live as structured items inside `locations[room-2].items[]` rather than on Oberon's NPC stat block. The NPC schema has no `items` slot. Locating them in Room 2 — where Oberon most plausibly falls or yields — gives them a stable home, while the structured properties (`current_holder_npc_id: oberon-scott`, `rightful_owner_character_role: wynn`, `transfer_on_event`) capture the ownership transfer cleanly and let the runtime address them by id. Both items use the object form of `itemEntrySchema`; `properties` carries effect text + magnitudes (regen dice + interval, AC/save bonuses).

**Context:** Part 2 brief required encoding ~5 PDF "Stealth -X against Perception" rules and Wynn's two magical items recoverable post-combat. Schema didn't bend either way without an additive change.
**Alternatives considered:**
- Set `dc_checks[].dc = 0` for opposed checks → fails Zod (`min(1)`).
- Add an `opposed_checks[]` array to the schema → pushed to v1.x backlog rather than blocking Part 2; only one module needs it today.
- Add `npc.items[]` and put Wynn's gear on Oberon → cleaner ownership story but a wider schema change for a single use case. Deferred.
- Put items on the `exterior` location → Oberon enters from outside, but combat resolves inside the mill more often than not. Room 2 is the central mill body and the most common combat resolution point.

**Consequences:**
- Authors of future modules: opposed-check rules go in `description` until/unless we add a dedicated structure. Document this in any schema doc that grows up around v2.
- Runtime AI sees the rules (not stripped underscore-prefix annotations), so combat narration can apply them.
- If Sprint 4.8 needs to mechanically resolve opposed checks (rather than just narrate), promoting `opposed_checks[]` to a real schema field becomes the trigger.
- Item ownership-transfer is encoded in `properties.transfer_on_event` as a free-text trigger string. The AI is responsible for emitting the corresponding `state_change` when Oberon falls; the structured fields make it obvious *what* to transfer and *to whom*.
