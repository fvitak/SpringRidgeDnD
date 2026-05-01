# Sprint 4.6 — DM Pivot Foundation

**Filed:** 2026-04-30 · **Status:** ▶ PLANNED (foundation slice) · **Planned points:** ~32

> This sprint exists because the AI DM's *role* is changing.
> Pre-pivot: the AI authors an adventure from a high-level prompt.
> Post-pivot: the AI **performs and adjudicates** a published 5E module
> faithfully, while teaching new players the rules in plain English.
> Launch module: *Rescue of the Blackthorn Clan*. See `docs/PRD.md` for
> the full vision rewrite and `docs/DECISIONS.md` for the pivot ADRs.
>
> **Scope change (2026-04-30, late):** The Blackthorn ingestion (originally
> PIV-02) has been lifted out of this sprint and given its own dedicated,
> *no-fixed-ship-date* sprint — see `docs/sprints/SPRINT-4.7-INGESTION.md`.
> Ingestion is being framed as a first-class system for ingesting *any*
> future scenario, not a one-off Blackthorn parser. See ADR
> "Ingestion is a first-class system, not a one-off task." Sprint 4.6's
> job is now to prove the runtime works against a tiny hand-crafted test
> scene; Sprint 4.7 mass-produces real scene JSON against the contract
> 4.6 ships.

## Sprint goal

Lay the foundation for the AI-as-Performer/Referee model: replace the
WSC-specific system prompt with a generic Module Runner prompt + per-turn
scene context; **define the scene-context JSON contract and ship one
hand-crafted test scene that exercises every layer of the runtime**;
make the SRD available as a knowledge source; ship the romance subsystem
plus the mobile intake forms; add teaching mode to the action box; and
wire bidirectional rule-of-cool into the response schema.

**Honest read:** this is a multi-sprint pivot. 4.6 is the foundation
slice — *runtime* readiness. The ingestion sprint (4.7) lands real
Blackthorn content into that runtime, with no time pressure.

## Committed stories

See `docs/BACKLOG.md` "Sprint 4.6 — DM Pivot Foundation" for the
authoritative list. Summary by theme:

- **Module Runner foundation** — PIV-01 (system-prompt rewrite + per-turn
  scene context), PIV-02b (scene-context JSON contract + one hand-crafted
  test scene), PIV-03 (SRD strategy + ADR).
- **Romance subsystem** — PIV-04 (Turn-ons / Pet Peeves / AP / First
  Impressions / First Intimacies on the host + game state), PIV-07 (mobile
  intake forms; private Pet Peeves), PIV-08 (retire drunkenness in favour
  of AP).
- **Teaching + flexibility** — PIV-05 (action-box explanations), PIV-06
  (`dm_override` field + bidirectional rule-of-cool prompt language).

## Acceptance criteria — the demo bar

The runtime executes a structured scene faithfully against a tiny,
hand-crafted **test scene** (NOT Blackthorn — Blackthorn ingestion is
Sprint 4.7's job). The test scene is something like *"you wake in a
stone cell; a guard dozes by the door"* — one room, one DC check, one
NPC stat block, one read-aloud block, one mandatory plot point. Just
enough surface to prove every layer.

For that scene:

1. The AI delivers the read-aloud block **as written** (or paraphrased
   without losing facts), in voice, sourced from the scene JSON — not
   invented.
2. The mandatory plot point is the engine of the scene; the AI does not
   let the scene end without it firing.
3. The NPC's stat block and tactics are followed — DCs come from the
   scene JSON, not the model's imagination.
4. When a player rolls, the action box explains it in plain English:
   *"You rolled a 14, plus your +3 DEX modifier and +2 proficiency,
   total 19. The guard's AC is 12, so you hit. Now roll 1d6+3 for
   damage."* First-fire of a mechanic over-explains; subsequent fires
   shorten.
5. When the AI bends a rule (advantage for clever play, disadvantage for
   sloppy play), the response includes a `dm_override` payload that is
   visible in the event log.
6. **Romance layer end-to-end on the test scene:** each phone walks
   through romance intake (Turn-ons → Pet Peeves auto-roll → First
   Impressions → starting AP). AP updates silently behind the scenes
   (number never shown) but the AI's voice shifts band when the band
   changes. Pet Peeves stay private to each phone.
7. **WSC still works.** The legacy WSC scenario continues to run through
   its own path; nothing in this sprint regresses it.

## Known risks at planning time

- **PIV-02b (scene-context contract + test scene) is the linchpin.** It
  defines the shape Sprint 4.7's ingestion system will produce instances
  of. Get this wrong and 4.7 either ships against a bad contract or has
  to redesign mid-flight. Lead Engineer owns the schema; PM signs off on
  the test-scene fixture choice.
- **Tiny test scene cannot exercise the full romance layer in
  isolation.** Romance mechanics (Pet Peeves triggering off NPC
  attributes, AP shifts on intimacy moments, First Intimacy unlocks) are
  a Blackthorn-shaped surface. Sprint 4.7 may surface contract gaps when
  it ingests real Blackthorn content. Plan for the contract to evolve in
  4.7; treat 4.6's contract as **v1, not final**.
- **PIV-03 (SRD strategy) blocks PIV-01.** Whether the SRD lives in the
  cached system prompt vs. RAG vs. a tool-call materially changes the
  prompt assembly code path. Decide in week 1, ADR by mid-sprint.
- **PIV-07 (mobile romance forms) is interlocked with PIV-04** — the host
  AP scoreboard is meaningless without the intake. Ship both or neither.
- **Cache stability.** The system prompt must stay byte-stable across
  turns to preserve prompt caching. The new per-turn scene context goes
  in the *user* message (or a non-cached system entry per the ADR), not
  the cached header.
- **Scope creep into ingestion.** The temptation will be to "just hand-
  author one Blackthorn scene while we're here." Resist — that work is
  Sprint 4.7. The test scene is a throwaway; its only job is to prove
  the runtime.

## Working agreements (specific to this sprint)

- Any change to `lib/schemas/dm-response.ts` requires an ADR.
  PIV-06 (`dm_override`) is the obvious candidate.
- The system prompt is now generic and stable across scenarios. Any
  per-scenario or per-turn data goes in the user message (or a non-
  cached system entry per the ADR), never the cached header.
- Pet Peeves are private. If they leak into anything visible to the
  partner — narration, host UI, network payload to the partner's
  phone — it's a P0 bug.
- AP numerical value is hidden. Bands may colour narration; numbers must
  not appear in UI or response text. Same rule as `tolerance_threshold`.
- "The PDF is its own instruction manual." When in doubt, follow what
  the module says. Do not let the prompt re-author rules the module
  already specifies. (This applies once 4.7 lands real PDF content; the
  4.6 test scene is hand-crafted scaffolding.)

## Out of scope for 4.6 (explicitly punted)

- **Any Blackthorn scene content.** All four Blackthorn scenarios are
  ingested in Sprint 4.7.
- Real-world parallel romance mechanic ("couple holds hands → AP
  bonus") — a future story.
- Spend-AP-for-real-world-kiss mode — a future story.
- End-of-adventure resolution chart (relevant only after Scenario Four).
- Travel-encounter d4 roll tables.
- Authoring/admin UI for ingestion (deferred to 4.7 or later).

## Cross-team dependencies

| Area | Owner | What 4.6 needs |
|------|-------|---------------|
| Scene-context JSON contract (PIV-02b) | Lead Engineer | Concrete Zod schema + TypeScript type + one hand-crafted test-scene fixture. PM acceptance is "the runtime executes the test scene end-to-end against the contract." This contract is the input to Sprint 4.7. |
| SRD strategy ADR | Lead Engineer | One-pager picking cached prompt vs. RAG vs. tool-call. PM accepts the recommendation. |
| Test-scene fixture content | PM (with LE) | One-room demo scene: stone cell, dozing guard, one DC check, one NPC stat block, one read-aloud, one plot point. Throwaway. PM writes the prose; LE shapes it into JSON. |
| Mobile romance-intake layout | UX Designer | Three-step flow on the phone: Turn-ons → Pet Peeves auto-roll/swap → First Impressions. Pet Peeves screen never reachable from the partner's phone. |
| Action-box teaching visual language | UX Designer | First-fire vs. shortened-fire visual states. Goes in `docs/DESIGN-SYSTEM.md`. |
| `dm_override` event log UI | UX Designer | A small chip / inline tag that surfaces "AI bent a rule here" in the event log. |

## Retro placeholder

_Filled in at end of sprint by PM agent._

- What shipped:
- What slipped:
- Scope expansions picked up in-sprint:
- Carry-forward to Sprint 4.7 / 5:
- Was the demo bar (runtime executes the test scene faithfully end-to-end) met?
- Did Sprint 4.7 surface contract gaps that should be folded back into a v2 of the scene-context schema?
