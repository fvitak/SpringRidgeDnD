# GRAIL — Agent Guide

This repo is worked on by a **team of role-scoped subagents**, not by one
generalist session. Every session (you included) starts here and then
delegates based on what the user is asking for.

## 0. Critical: Next.js 16

<!-- BEGIN:nextjs-agent-rules -->
This codebase uses Next.js **16** + React **19**. APIs, conventions, and
file structure differ from your training data. **Before writing any
Next.js code**, read the relevant guide in `node_modules/next/dist/docs/`.
Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 1. Who does what

| Role                     | Subagent file                                 | Owns (writes)                                                            | Reads (never edits)                                   |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| Product Manager          | `.claude/agents/product-manager.md`           | `docs/PRD.md`, `docs/BACKLOG.md`, `docs/sprints/SPRINT-NN.md`            | ARCHITECTURE, DESIGN-SYSTEM, source code              |
| UX Designer              | `.claude/agents/ux-designer.md`               | `docs/DESIGN-SYSTEM.md`, `docs/design/*`                                 | PRD, BACKLOG, sprints, ARCHITECTURE, source code      |
| Lead Engineer            | `.claude/agents/lead-engineer.md`             | `docs/ARCHITECTURE.md`, technical plans in sprint files                  | PRD, BACKLOG, DESIGN-SYSTEM                           |
| Engineer                 | `.claude/agents/engineer.md`                  | `app/`, `lib/`, `supabase/migrations/`                                   | All docs (reads only)                                 |

All four agents may append entries to `docs/DECISIONS.md` when making a
non-obvious call in their area.

## 2. Routing rule (for the main session)

When Frank asks something, route by intent, not by keyword:

- **"What should we build / is in the backlog / cut scope"** → PM agent.
- **"Design this flow / is this consistent / write copy"** → UX agent.
- **"Plan Sprint N / break down story X / review this PR / risk of Y"**
  → Lead Engineer agent.
- **"Implement story X / fix this bug / add this migration"** →
  Engineer agent (after Lead Engineer has written the task brief in the
  sprint file, if one is needed).
- **"How should the team work together / set up the scaffold"** →
  answer directly, don't delegate.

When in doubt, ask Frank one question before spawning an agent.

## 3. File map of project state

```
docs/
  PRD.md                     — vision, scope, principles   (PM)
  BACKLOG.md                 — all stories + status        (PM)
  ARCHITECTURE.md            — system shape + landmines    (Lead Engineer)
  DESIGN-SYSTEM.md           — visual + interaction language (UX)
  DECISIONS.md               — lightweight ADR log         (shared, append-only)
  USAGE.md                   — how to use this team        (Frank-facing)
  sprints/
    SPRINT-04.md             — current active sprint
    SPRINT-05.md             — planned
    SPRINT-06.md             — planned
.claude/agents/
  product-manager.md
  ux-designer.md
  lead-engineer.md
  engineer.md
```

## 4. Durable rules that apply to everyone

- `main` is prod. No staging. Migrations are additive only.
- Every AI response must validate against `dmResponseSchema`
  (`lib/schemas/dm-response.ts`). Schema changes go through Lead
  Engineer + an ADR.
- Event-log history is passed to Claude as **full JSON**, not just
  narration text. Breaking this causes schema drift after 2–3 turns.
- The WSC system prompt is **prompt-cached** (`ephemeral`, 5-min TTL).
  Do not mutate it per turn.
- `tolerance_threshold` on characters is **hidden**. Never show it in
  UI or narration.
- When in doubt, append to `docs/DECISIONS.md` rather than leaving a
  decision in chat. Chat forgets; files don't.

## 5. When starting a new session

1. The main agent reads this file.
2. Identifies the role the task needs and spawns that subagent.
3. The subagent reads its own ownership docs + DECISIONS.md + the
   relevant sprint file.
4. The subagent does the work and writes the result to its owned files
   (not just into chat).
5. If a decision was non-obvious, the subagent appends to DECISIONS.md.

See `docs/USAGE.md` for the Frank-facing walkthrough.
