# Sprint 4 — Gameplay Polish

**Weeks 7–8** · **Status:** ▶ IN PROGRESS · **Planned points:** ~44

## Sprint goal

The game feels complete and polished for a real friend-group session. Roll
modifiers are shown in narration, mobile combat actions are visible,
sessions persist across weeks, and narrative depth is consistent.

## Committed stories

See `docs/BACKLOG.md` "Active — Sprint 4" for the authoritative list.
Summary by theme:

- **Narrative polish** — POL-01 (modifier display), POL-02 (action panel),
  POL-03 (ambiguous-action clarification), POL-04 (inactive-player
  check-in), POL-05 (stat adjuster copy).
- **Session persistence** — PER-01 (auto-save completeness), PER-02
  (resume flow), PER-03 (session history view).
- **Progression** — XP-01/02/03 (award, level-up flow, 5e level-up rules).
- **Loot** — INV-01 (AI-awarded loot → DB), INV-02 (mobile inventory).

## Known risks at planning time

- Point total (~44) exceeds original target (~35). Lead Engineer to flag
  at planning; PM to pick a drop candidate if not resolved by mid-sprint.
- PER-02 (resume flow) is the biggest unknown — touches prompt assembly,
  event-log truncation, and game_state rehydration. Spike before commit.
- XP-01/02/03 are interlocked. Ship all three or none.

## Working agreements (specific to this sprint)

- Any change to the Zod schema in `lib/schemas/dm-response.ts` needs an
  ADR entry in `docs/DECISIONS.md` before merge.
- PER-01 is listed as "Partial" — first task is to write a test that
  demonstrates the gap, then close it. No blind "also saving X" commits.

## Retro placeholder

_Filled in at end of sprint by PM agent._

- What shipped:
- What slipped:
- Scope expansions picked up in-sprint:
- Carry-forward to Sprint 5:
