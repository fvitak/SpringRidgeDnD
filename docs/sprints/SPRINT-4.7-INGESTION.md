# Sprint 4.7 — Ingestion System (no fixed ship date)

**Filed:** 2026-04-30 · **Status:** ▶ PLANNED · **Planned points:** intentionally unestimated

> **Frank's directive (2026-04-30):** *"lets make that its own sprint.
> and take our time doing it so we can make it a system used to ingest
> future scenarios."*
>
> This sprint has **no fixed ship date**. Quality and reusability are the
> bar — speed is not. See the ADR
> "Ingestion is a first-class system, not a one-off task" in
> `docs/DECISIONS.md` for the framing.

## Sprint goal

Build the *system* the team will use to take any published 5E adventure
PDF and turn it into runtime-ready scene-context JSON that the Module
Runner (shipped in Sprint 4.6) can execute. Use *Rescue of the
Blackthorn Clan* as the first real module through that system —
producing structured JSON for all four scenarios — but the design target
is the **second** module that comes after it.

**The single sentence to anchor on:** *Ingestion is the long-tail
mechanism for adding any scenario — not a one-time chore for
Blackthorn.*

## Framing — what this sprint is and is not

**It is:**
- A product-capability investment. The faster and more reliable
  ingestion is, the more scenarios GRAIL can host.
- A reusable workflow. By the end, "add a new module" should feel like
  *use the tool*, not *do the work again*.
- A place to take time. Schema gaps, validation problems, and authoring
  ergonomics are figured out here, not papered over.

**It is not:**
- A one-off Blackthorn parser. Anything Blackthorn-specific that creeps
  in is a smell — challenge it.
- A schedule-driven sprint. There's no demo at the end of week 2.
- An engineering-only sprint. Authoring workflow choices (manual vs.
  Claude-assisted vs. parser-tool vs. hybrid) are partly product calls.

## Anchor stories

Tight intentionally. Frank's preference is room to figure it out as it
goes — these are anchors, not a checklist. Lead Engineer owns the
technical breakdown inside the ARCHITECTURE doc and the corresponding
ingestion technical plan.

| ID     | Story                                                                                              | Pts |
| ------ | -------------------------------------------------------------------------------------------------- | --- |
| ING-01 | Define the scene-context JSON schema (formal, versioned, validated by Zod). LE drafts; PM signs off | TBD |
| ING-02 | Authoring workflow recommendation (manual / Claude-assisted / parser tooling / hybrid) — spike + decision + ADR | TBD |
| ING-03 | Validation harness — given a module's set of scene JSON files, surface missing required fields, dangling NPC refs, plot-point coverage gaps, missing DC tables, etc. | TBD |
| ING-04 | Ingest *Rescue of the Blackthorn Clan* Scenario One into the chosen workflow                       | TBD |
| ING-05 | Ingest Blackthorn Scenarios Two, Three, and Four                                                   | TBD |
| ING-06 | **Deferred** — reusability test against a real second module. Frank confirmed (2026-04-30) he doesn't own a second one-shot, and this whole project is about Blackthorn for him and his wife. Re-open when/if a second module appears; until then, *reusability stays a design intent, not a v1 acceptance test*. The "no Blackthorn-specific hardcoding" smell-test still applies during ING-01..ING-05. | — |
| ING-07 | Authoring/admin UI considerations — explore lightweight in-app authoring or admin tooling. May defer entirely to a later sprint, but tracked here so we don't forget | TBD |

### Acceptance-criteria sketches

- **ING-01:** the schema is in `lib/schemas/scene-context.ts` (or
  similar), versioned, and Zod-validated. Every required field is
  documented in-line. The 4.6 test-scene fixture round-trips through it.
  Backlog ADR exists.
- **ING-02:** ADR captures the chosen workflow, rejected alternatives,
  and the rationale for *why this generalises*. Sample run: a single
  scene from Blackthorn flows through the workflow end-to-end and lands
  as valid JSON.
- **ING-03:** running the harness against an incomplete module surfaces
  every category of issue. Running against the completed Blackthorn set
  passes clean.
- **ING-04 / ING-05:** all four Blackthorn scenarios are valid scene-
  context JSON, committed to the repo per the existing ADR
  ("Module script lives as flat JSON files in the repo, not Postgres").
  The runtime can boot a session and execute each scenario without
  crashes or schema violations. Mandatory plot points are tagged and
  reachable. Romance hooks are present where the PDF specifies them.
- **ING-06:** *deferred indefinitely.* Frank doesn't own a second module
  and this project is Blackthorn-for-his-wife. The acceptance test
  re-opens if and when a second module enters the picture. Until then,
  generality is enforced by the *design smell-test* during ING-01..ING-05
  (no Blackthorn-only field names, no hardcoded "if rescue scenario then
  X" branches, etc.) — not by a real second-module run-through.
- **ING-07:** decision is captured (build now / defer / never). If
  built, ergonomics are good enough that adding the next module *after*
  the second one feels like a 1-day task, not a 1-week task.

> Stories may grow or split as we learn. The lightness of this list is
> intentional.

## Risks and unknowns

- **PDF parsing is messy.** Multi-column flow, stat blocks, romance
  tables, italic read-aloud blocks, "DM Note" sidebars — the Blackthorn
  PDF carries meaning in formatting that text extraction loses. Plan for
  the workflow to assume a human-in-the-loop pass.
- **Schema-design generality is a trap.** Designing for "every possible
  module" up front is the bad version of this sprint. Design for
  Blackthorn first, second module second. Re-issue v2 if needed.
- **Authoring workflow selection has product implications.** Pure manual
  authoring is slow but precise. Claude-assisted authoring can ingest
  faster but needs verification. Parser tooling is the highest-leverage
  but the brittlest. Hybrid is most likely the answer; be explicit
  about which step uses which mechanism in the ADR.
- **"Romance hooks" don't have a clean schema yet.** The PDF encodes
  them as Turn-on / Pet Peeve trigger language plus First Intimacy
  unlock conditions. The 4.6 contract is a v1 here; expect this surface
  to need rework once Blackthorn is fully ingested.
- **Sprint 4.6 contract gaps will surface here.** This is expected, not
  a failure mode. The 4.6 retro should explicitly invite contract
  changes that came out of 4.7's ingestion work.
- **No-fixed-date framing has its own risk:** the sprint can drift
  forever. Mitigation: every two real weeks, PM and LE review progress
  against the success criteria below and either keep going or call v1
  done and ship it.

## Success criteria

- All four Blackthorn scenarios are runnable from JSON in the runtime,
  with mandatory plot points, NPC stat blocks, DC tables, read-aloud
  blocks, and romance hooks present.
- The validation harness catches incompleteness before a module ships.
- **The next time we want to add a scenario, the path from PDF to
  running scene context should be substantially faster than authoring
  from scratch — and feel more like *use the tool* than *do the work
  again*.** This is the load-bearing success criterion.
- The chosen workflow is documented in an ADR and reproducible by
  someone who didn't ingest Blackthorn.
- Schema is versioned. Future schema changes are non-breaking by default
  or accompanied by a migration path for committed JSON.

## Parallelism with Sprint 4.6

Once Sprint 4.6's PIV-02b (scene-context contract + test scene) lands,
ING-04 and beyond unblock. ING-01 and ING-02 may begin in parallel with
4.6 — in fact they should, since their output informs 4.6's contract
choices. Concretely:

- **Earliest ING-01 can start:** as soon as Lead Engineer is ready to
  draft the schema. ING-01 *is* the schema 4.6's PIV-02b ratifies and
  uses for the test scene.
- **Earliest ING-04 can start:** once PIV-02b is committed to `main`.
- **ING-06 is parked.** No second module exists to test against; see the
  story note above. Re-evaluate if Frank acquires one.

## Out of scope for 4.7 (explicitly punted)

- **Real-time / collaborative authoring UI.** ING-07 is the placeholder
  for "do we need this?" — actual collaboration tooling is a separate
  sprint if it happens at all.
- **Modules that aren't 5E-shaped.** PF2e, OSR, etc. are out of scope.
  The schema is 5E-shaped.
- **Adventure-path-scale modules** (multi-level dungeons spanning 6+
  sessions). Blackthorn is 4 scenarios; the second-module candidate
  should be similarly contained for 4.7's purposes.
- **Player-authored homebrew scenarios.** SCN-02 was dropped from the
  roadmap; ingestion is for *published modules*, not user generation.

## Cross-team dependencies

| Area | Owner | What 4.7 needs |
|------|-------|---------------|
| Scene-context JSON schema | Lead Engineer | The formal schema lands as `lib/schemas/scene-context.ts` (or similar); versioned; Zod-validated. PM signs off on what counts as "required." |
| Authoring workflow ADR | Lead Engineer | ADR documenting the chosen workflow + rejected alternatives + rationale for generality. |
| PDF source material | PM | Frank's PDF copy of *Rescue of the Blackthorn Clan* is the canonical source. No second module exists; ING-06 is parked. |
| Romance hook schema rework | LE + PM | Likely surfaces in ING-04 or ING-05 as Blackthorn romance content hits the schema. Either fold into v1 or capture as v2 deltas. |
| Validation harness UX | UX Designer (light touch) | If ING-03's output is intended to be human-readable beyond a CLI dump, UX should weigh in on format. Defer until LE has a working CLI version. |

## Retro placeholder

_Filled in when this sprint is closed (whenever that is)._

- What shipped:
- What slipped or didn't fit v1 of the system:
- How many real weeks did this take?
- Schema changes folded back into the 4.6 contract:
- Did the second-module reusability test actually validate generality, or did it expose Blackthorn-specific assumptions we hadn't noticed?
- What's the honest "time to ingest the third module" estimate now?
