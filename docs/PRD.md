# GRAIL — Product Requirements

**Owner:** Product Manager agent
**Last reviewed:** 2026-04-22 (Sprint 4 active)

## Vision

A web-based AI Guide that runs a D&D 5e session for 3–4 friends. The
Guide screen runs on a single host PC; players join on their phones. Claude
handles narration, rules enforcement, NPC roleplay, and combat adjudication.
The app makes it possible for a group with no experienced Guide to play a
complete, coherent tabletop session.

## Why this exists

Playing D&D requires one person to study the rules, prep a scenario, and run
combat bookkeeping. That bottleneck prevents most groups from ever playing.
An AI Guide that is grounded in a specific published scenario and enforces 5e
rules via structured state lowers the barrier to zero.

## Target user

- **Host:** someone willing to run the app on their laptop and moderate the
  session. Not necessarily a D&D expert.
- **Players:** 3–4 friends, mostly new to D&D or returning after years away.
  They sit at the same table and each use their phone for character sheet,
  dice prompts, and death saves.

## Scope of v1 (launch scenario)

v1 ships _The Wild Sheep Chase_ (Winghorn Press, 3–4 hour one-shot) as the
single supported adventure. Everything — prompt, NPC roster, locations,
rules hooks — is tuned to this scenario. Multi-scenario support (SCN-01,
SCN-02) is explicitly deferred to Sprint 6+.

## Non-goals

- Remote play across multiple locations (v1 assumes same table).
- Voice-first interaction (Sprint 5+).
- Player-authored homebrew scenarios (Sprint 6+).
- A character sheet editor after session start — characters are locked once
  made.
- Payment, accounts, or user identity beyond a session-scoped slot.

## Core user stories (shipped)

1. **As a host**, I create a named session and get a QR code my players can
   scan to join. _(Sprint 2)_
2. **As a player**, I pick a slot, choose class/race/stats/name in a guided
   4-step flow, and land on my mobile character sheet. _(Sprint 2)_
3. **As a host**, I type what the party does; the AI narrates, enforces
   rules, requests rolls, and advances the story. _(Sprint 1)_
4. **As a player**, my HP, conditions, spell slots, and death saves update
   live on my phone via Supabase Realtime. _(Sprint 2–3)_
5. **As a host**, combat runs with initiative, turn tracking, action
   economy, conditions, and death saves — all adjudicated by the AI with a
   dice engine I can audit. _(Sprint 3)_

## Core user stories (active — Sprint 4)

See `docs/sprints/SPRINT-04.md` for the current working list. Headline
themes: narrative polish, session persistence across weeks, XP/leveling,
and loot/inventory.

## Success criteria

- A group of 4 new players can complete The Wild Sheep Chase in one sitting
  with no rules questions escalated off-app.
- A session can be paused at the end of a night and resumed next week with
  full narrative coherence.
- Session cost in Claude tokens stays under a target budget per playthrough
  (target TBD after first full-campaign playtest).

## Key product principles

- **Grounded over general.** Every AI response is validated against a Zod
  schema. We never ship a mode where Claude can return unstructured text.
- **Rules are code, not prompt.** Dice rolls, stat math, and HP tracking
  live in deterministic TypeScript, not in the prompt. The prompt _asks_ for
  rolls; the app _executes_ them.
- **Mobile is read-first, interact-second.** Players mostly watch their
  sheet update. Explicit interaction is reserved for rolls, death saves, and
  level-ups.
- **One environment.** Prod is the only environment. Push to main = live.
  This is a deliberate tradeoff for a small side project and shapes how we
  treat migrations and feature flags.

## Open questions the PM owns

- What does the session-cost budget look like in practice (needs a full
  playtest to measure)?
- Should level-up happen mid-session or be gated to end-of-combat?
- Do we need per-character "notes to self" storage, or is the Sprint 5
  notebook system enough?
