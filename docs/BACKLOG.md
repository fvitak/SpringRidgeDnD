# GRAIL — Backlog

**Owner:** Product Manager agent
**Source of truth** for all user stories, their status, and sprint
assignment. The PM updates this file; engineers read it.

> Status legend: `Done` · `In Progress` · `Pending` · `Partial` · `Blocked`
> Sprint legend: S1–S3 complete, S4 active, S5–S7 planned.

---

## In progress — Blackthorn / Map / Date Night (filed 2026-04-29)

This block ships ahead of the Sprint 5 voice/notebook work because Frank
prioritised it in chat. PM agent: groom into a proper sprint label
(suggest **Sprint 4.5**) and re-rank.

| ID     | Story                                                                                  | Pts | Status                |
| ------ | -------------------------------------------------------------------------------------- | --- | --------------------- |
| MAP-01 | Scenarios + scenes registry tables; sessions.scenario_id; backfill WSC sessions        | 2   | Done (migration)      |
| MAP-02 | Old Mill scene seeded with hand-traced walkable mask + default tokens                  | 2   | Done (refine in play) |
| MAP-03 | Host-screen tactical Map component (grid + chips + hover)                              | 5   | Done (Phase 1 polish) |
| MAP-04 | Click-to-move on host map with A* pathfind + 5E speed/dash/diagonal validation         | 5   | Done                  |
| MAP-05 | POST /api/sessions/:id/move + GET /map endpoints; lazy scene seed for Blackthorn       | 3   | Done                  |
| MAP-06 | Polymorphic position field on dmResponseSchema + apply-state-changes router            | 3   | Done (ADR logged)     |
| MAP-07 | Scenario picker on home; player count auto-locks to 2 for Blackthorn                   | 2   | Done                  |
| MAP-08 | Pre-built Wynn + Tarric character templates auto-created on session create             | 2   | Done                  |
| DN-01  | Date Night Mode toggle on session creation                                             | 1   | Done                  |
| DN-02  | Per-player content rating dial on phone (G/PG/PG-13/R/NC-17)                           | 2   | Done                  |
| DN-03  | Server computes session rating as floor of active prefs; AI honours via prompt         | 2   | Done                  |
| DN-04  | Synthetic [RATING_CHANGE] event log line so AI acknowledges shifts in voice            | 1   | Done                  |
| MAP-09 | Active-player turn banner on phone ("move at host screen")                             | 1   | Done                  |
| MAP-10 | Asset upload script + storage cutover docs (gitignored public/maps/blackthorn)         | 2   | Done (script ready)   |
| MAP-11 | Scenes 2/3/4 + walkable masks (Manor, Approach/Temple, Inner Sanctum)                  | 8   | Pending               |
| MAP-12 | Multi-floor scene UI (floor switcher tab) for Blackthorn Manor                         | 3   | Pending               |
| MAP-13 | Opportunity attack flow — provoke warning → AI rolls reaction attack                   | 3   | Pending               |
| MAP-14 | Scene-trace admin tool (in-browser walkable-mask painter) — speeds up MAP-11           | 5   | Pending               |
| DN-05  | Romance subsystem proper — Turn-ons / Pet Peeves / Attraction Points / First Imp.      | 8   | Pending (Phase 3)     |
| DN-06  | Private toast on partner's phone for snarky rating-change quips (vs. host narration)   | 3   | Pending               |
| MAP-15 | Tile-perfect calibration of Old Mill walkable mask after first playtest                | 2   | Pending               |
| MAP-16 | Real PDF tokens (cropped & uploaded) replacing initial-monogram chips                  | 2   | Pending               |

> Verify checklist before declaring DONE on the in-progress block:
> 1. Run the two new migrations on Supabase prod.
> 2. Place `old-mill.png` (extracted from PDF) at `public/maps/blackthorn/scenes/old-mill.png`.
> 3. Restart Next dev server; create a Blackthorn session; map renders; clicking own token shows green legal cells; out-of-range click shows yellow "X squares away" message.
> 4. Phone shows the rating dial when Date Night is on; tapping a value updates the host's `current_rating` and lands a one-line acknowledgement next AI turn.

---

## Active — Sprint 4 (Gameplay Polish)

| ID     | Story                                                                                         | Pts | Status      |
| ------ | --------------------------------------------------------------------------------------------- | --- | ----------- |
| POL-01 | Roll modifier display in narration — "rolled 12, +2 DEX = 14, hits"                           | 2   | Pending     |
| POL-02 | Spell / action reference panel on mobile during combat                                        | 5   | Pending     |
| POL-03 | Pop-up clarification when player action is ambiguous (does not interrupt narration)           | 3   | Pending     |
| POL-04 | Guide checks in with inactive player after N turns via narration                              | 2   | Pending     |
| POL-05 | Stat adjuster UX copy explaining +/- swaps standard array (not free points)                   | 1   | Pending     |
| PER-01 | Auto-save full game state every turn and on End Session — verify completeness                 | 3   | Partial     |
| PER-02 | Resume flow: reopen session; full event log + state re-injected to Claude context             | 5   | Pending     |
| PER-03 | Session history view on Guide screen — scrollable prior session log with timestamps              | 3   | Pending     |
| XP-01  | AI awards XP after combat and milestones; Guide can manually adjust                           | 3   | Pending     |
| XP-02  | Level-up flow on mobile: notification at threshold; guided HP roll + new features             | 5   | Pending     |
| XP-03  | 5e level-up rules per class: HP, ASI at 4/8/12, class feature unlocks                         | 5   | Pending     |
| INV-01 | AI awards loot in narration; structured item data written to character inventory              | 3   | Pending     |
| INV-02 | Mobile inventory panel — items with weight/value/description; use/equip applies stat effects  | 4   | Pending     |

**Sprint 4 total:** ~44 pts planned (original target ~35). Lead Engineer
should flag overcommit risk at planning. See `docs/sprints/SPRINT-04.md`.

---

## Planned — Sprint 5 (Notebook, Voice & Multi-player Polish)

| ID     | Story                                                                            | Pts | Status  |
| ------ | -------------------------------------------------------------------------------- | --- | ------- |
| NB-01  | Notebook system — names/locations in narration as clickable blue links           | 5   | Pending |
| NB-02  | Notebook panel on Guide screen — saved names/locations with editable notes          | 3   | Pending |
| VOI-01 | Web Speech API on Guide screen; always-on listening with mic toggle                 | 5   | Pending |
| VOI-02 | Player identification via voice — speaker assignment or character-name trigger   | 5   | Pending |
| VOI-03 | Push-to-talk fallback; visual waveform indicator                                 | 3   | Pending |
| VOI-04 | TTS for Guide narration — Web Speech API or ElevenLabs; configurable voice       | 5   | Pending |
| VOI-05 | Auto-read toggle — narration read aloud after each AI response                   | 3   | Pending |
| MOB-04 | Mobile roll prompts — dice prompt on relevant player phone; result feeds back    | 5   | Pending |
| MOB-05 | Visual dice roll animation on mobile; haptic feedback on submit                  | 2   | Pending |

---

## Planned — Sprint 6 (Polish, Images & Multi-Scenario)

| ID     | Story                                                                                    | Pts | Status  |
| ------ | ---------------------------------------------------------------------------------------- | --- | ------- |
| IMG-01 | AI scene image at major narrative moments — full-width on Guide screen                      | 3   | Pending |
| IMG-02 | Character portrait generated during creation — shown on mobile sheet header              | 3   | Pending |
| SCN-01 | Scenario selection on session creation; WSC default; extensible                          | 5   | Pending |
| SCN-02 | Guide generates homebrew scenario from premise; AI builds reusable template              | 8   | Pending |
| SEC-01 | Passphrase protection on session join page                                               | 2   | Pending |
| POL-10 | Error handling — graceful fallbacks for Claude API failures, Supabase disconnects        | 3   | Pending |
| POL-11 | API cost monitoring — token usage per session; alert Guide if approaching budget         | 2   | Pending |
| XXX-01 | Adult/mature content mode — private sessions; API policy compliance; design TBD          | 0   | Pending |

---

## Completed (summary)

Full detail of shipped stories, plus scope-expansion items picked up during
each sprint, lives at the bottom of this file for searchability. See also
`docs/sprints/` for per-sprint retros once added.

### Sprint 1 — The Foundation (✓ 34 pts)
INF-01..03 (Next.js/Supabase/DB schema), AI-01..03 (dm-action route, WSC
prompt, Zod schema), DM-01..03 (Guide screen, SSE streaming, event log
persistence). **Scope expansion:** prompt caching; full-JSON history passed
to Claude.

### Sprint 2 — Sessions, Players & Characters (✓ 42 pts)
SES-01..04 (session creation, join page, slot picker, lobby/active
management), CHR-01..05 (4-step creator, computed character), MOB-01..03
(mobile sheet, Supabase Realtime, party sidebar). **Scope expansion:**
adventure dropdown, Random Encounter mode, +/- stat adjuster from class
archetype.

### Sprint 3 — Combat Engine (✓ 45 pts)
CMB-01..12 — initiative, turn tracking, dice engine, roll modal, action
economy, conditions, death saves, concentration, spell slots.
**Scope expansion:** 14-item bug bash; drunkenness system; "In the Scene"
sidebar hides during combat; restart encounter button; WSC tavern
auto-start; input auto-focus; prompt upgrades for rolls, initiative
collection, split-party tracking, spoiler protection, metaphor frequency.

---

## Future polish (post-playtest, no sprint yet)

| ID     | Story                                                                                                | Pts | Status  |
| ------ | ---------------------------------------------------------------------------------------------------- | --- | ------- |
| POL-13 | Combat-AP observer rolls — when a PC crits/fumbles in line of sight of the partner, AI rolls the d20 reaction chart behind the screen and narrates the result transparently with the cheeky-meta voice ("rolled a 5; she was busy parrying"). Also rolls matching Turn-on/Pet-Peeve dice. AI-rolled (per the *players-roll-for-intentional-acts* ADR — observer reactions are ambient narrative adjudication). | 5   | Pending |
| POL-14 | Floor / elevation visual indicator for tokens — Old Mill has a Roof + ground floor + Loft. Today all tokens render on the same map plane, which makes "Harold on the roof" visually overlap with characters placed inside Room 1/Room 2. Frank flagged in 2026-05-03 playtest. UX direction needed. Simplest viable approach: per-token location badge ("Roof" / "Room 2" / "Outside") shown beneath the chip. Heavier proper solution: floor switcher tab + per-floor tokens. Decide before Manor scenes (Scenarios 2/3 have multi-floor maps and this becomes worse there). | TBD | Pending |

---

## Grooming notes for the PM agent

- Sprint 4 is over its original point budget (~44 vs ~35). Either scope
  cut (defer INV-01/02 to Sprint 5) or accept slip before planning.
- POL-05 is 1pt and purely copy — can be a "closing kill" for the sprint.
- PER-02 (resume flow) is the biggest risk: touches prompt assembly, event
  log truncation, and game_state re-hydration. It should be scoped and
  spiked before being committed.
- XP-01..03 are interlocked. Either ship all three or none; a half-shipped
  level-up is worse than no level-up.
