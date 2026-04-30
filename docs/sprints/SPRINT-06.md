# Sprint 6 — Polish, Images & Multi-Scenario (PLANNED)

**Weeks 12+** · **Status:** Planned · **Est points:** ~30

## Sprint goal

App is ready for friends to use beyond one controlled playthrough.
Visually polished, error-resilient, optionally enriched with AI scene
images. Multi-scenario support opens the game beyond Wild Sheep Chase.

## Candidate stories

See `docs/BACKLOG.md` "Planned — Sprint 6" for IDs. Themes:

- **Images** — IMG-01 (scene), IMG-02 (portrait).
- **Scenarios** — SCN-01 (selector), SCN-02 (homebrew generation).
- **Hardening** — SEC-01 (passphrase), POL-10 (error handling), POL-11
  (cost monitoring).
- **Deferred** — XXX-01 (mature-content mode — design TBD; must respect
  Anthropic usage policy; do not start without a product decision).

## Open questions to resolve before commit

- What's the AI image provider and per-session cost ceiling?
- Does SCN-02 require an editable intermediate (DM approves before play)
  or does the AI commit to the generated scenario immediately?
- Is POL-11 enough, or do we need budget enforcement (auto-pause) too?
