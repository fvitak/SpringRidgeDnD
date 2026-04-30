# Sprint 5 — Notebook, Voice & Multi-player Polish (PLANNED)

**Weeks 9–11** · **Status:** Planned · **Est points:** ~36

## Sprint goal

Players can speak actions aloud. A notebook system lets them click
names/locations in narration to save notes. Multi-player balance
(inactive-player check-ins) feels natural in practice, not just in
principle.

## Candidate stories

See `docs/BACKLOG.md` "Planned — Sprint 5" for IDs. Themes:

- **Notebook** — NB-01, NB-02.
- **Voice input** — VOI-01, VOI-02, VOI-03.
- **Voice output (TTS)** — VOI-04, VOI-05.
- **Mobile roll prompts** — MOB-04, MOB-05.

## Dependencies

- NB-01 depends on a stable "named entity" signal from Claude's narration.
  Either prompt-side structured markers or a post-parse pass. Needs a
  spike in planning.
- VOI-02 (player identification) is the hardest item; may slip to
  Sprint 6 if voice quality isn't good enough in practice.
- MOB-04 needs a per-player realtime channel we don't have yet — adds
  Supabase Realtime surface area.
