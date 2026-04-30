# Using the GRAIL agent team

This is a Frank-facing walkthrough for the role-scoped agent setup in
this repo. Bookmark this file — it answers "how do I actually use this."

## The core idea in 30 seconds

Instead of one Claude session trying to be PM, designer, architect, and
engineer all at once (and losing context halfway through), you have
**four narrow agents** in `.claude/agents/`. Each one:

- reads only the docs it owns + the project's shared state,
- writes only to its own files,
- and gets its own fresh context window when you invoke it.

Project state lives in `docs/` as markdown. The agents don't "remember"
anything across sessions — they **read files**. Your job is to keep the
files honest (the agents will maintain them if you let them).

## The four roles

| When you want to...                                    | Ask for...            |
| ------------------------------------------------------ | --------------------- |
| Groom the backlog, write stories, plan a sprint's scope | Product Manager       |
| Design a flow, check consistency, write UI copy        | UX Designer           |
| Break down a story, plan technically, review a PR      | Lead Engineer         |
| Actually write code for one task                       | Engineer              |

## How to invoke an agent

In any session, just say what you want. The main Claude session will
route to the right subagent. Explicit phrasing that works well:

- "PM: groom Sprint 4 — flag anything over-committed."
- "UX: design the PER-02 resume flow."
- "Lead Engineer: break down PER-02 into tasks and write the technical plan."
- "Engineer: implement POL-05."

You don't have to say the role name — the routing rule in `AGENTS.md`
handles it — but saying it makes the intent unambiguous.

## A typical sprint cycle

1. **Sprint start.** Ask the PM to groom the backlog and commit a sprint
   plan. PM edits `docs/BACKLOG.md` and `docs/sprints/SPRINT-NN.md`.
2. **Design pass.** For any new UX-heavy story, ask UX to write the
   flow. UX updates `docs/DESIGN-SYSTEM.md` (or adds a flow under
   `docs/design/`).
3. **Tech planning.** Ask the Lead Engineer to break down the sprint
   into tasks. Lead Eng appends a "## Technical plan" section to the
   sprint file and calls out risks.
4. **Implementation.** For each task, ask the Engineer to implement it.
   Engineer writes code, ends with a "Verify by" step.
5. **Review.** Ask the Lead Engineer to review before you commit.
6. **Sprint end.** Ask the PM to fill in the retro section of the
   sprint file. PM also carries unfinished stories forward to the next
   sprint file.

## How to prevent context bloat

The thing that used to happen — "I told Claude last session, why
doesn't it remember" — stops happening when three rules hold:

1. **Decisions live in files, not chat.** If you and an agent agreed on
   something non-obvious, make sure it ended up in
   `docs/DECISIONS.md`. The agent role files instruct each agent to do
   this; remind them if they forget.
2. **Spec docs get edited in-place.** When PM grooms the backlog, the
   edit lands in `BACKLOG.md`. When UX designs a flow, the spec lands
   in `DESIGN-SYSTEM.md`. Don't let the agent leave the output only in
   chat — ask "did you update the file?" if you're unsure.
3. **Each session starts by reading `AGENTS.md`.** The main session
   routes from there. You shouldn't need to re-explain project context.

If context still feels lost, the fix is usually that one of the three
rules above slipped. Not that the agents need bigger memory.

## About Claude's Memory feature

Separate from this file-based system, Claude has a Memory feature that
persists small facts across all your conversations. Good uses for it:
"Frank prefers terse commit messages," "this project is Next.js 16 +
Supabase," "don't apologize in replies." Bad uses: storing the PRD,
the backlog, or architectural decisions — those belong in files where
you can diff, review, and roll them back.

Think of it as: **Memory is for facts about you; files are for facts
about the project.**

## When to create a new subagent

The four we have cover the common cases. If you find yourself doing
the same specialized work repeatedly (e.g. "database reviewer" or
"prompt engineer"), split it into its own file under `.claude/agents/`.
The template is whatever you see in the existing four — YAML
frontmatter with `name` + `description`, then a body covering: "always
read", "you own", "you don't touch", "how to do your job", "output
style."

## When to update the docs yourself

You should edit docs directly when:

- You make a product decision in your head and want it recorded. Drop
  a line in `docs/DECISIONS.md`.
- You finish a story and the BACKLOG status wasn't flipped. Flip it.
- A story's acceptance criteria is actually clearer in your head than
  in the file. Write it in.

The agents aren't precious about who wrote a line; they care that the
line exists. You are the tiebreaker on everything.

## Common pitfalls

- **Letting the Engineer redesign.** If the Engineer starts restructuring
  an area, stop them and send it to Lead Engineer instead. Scope creep
  in Engineer sessions is the #1 way context gets burned.
- **Skipping ADRs.** Every time you think "we already decided this," it
  should be in `DECISIONS.md`. If it isn't, add it.
- **Editing the `.docx`.** The `.docx` roadmap is now stale. The source
  of truth is `docs/`. Regenerate the `.docx` from the markdown only
  when you need to share externally.
- **Asking an agent to do two jobs.** If a request spans roles (e.g.
  "groom this story and then implement it"), split it into two turns.
  The second turn invokes a different agent with the first agent's
  output as input.

## Quick reference — what to say

| Situation                                         | Say this                                                      |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Starting a new session on this repo               | "Where are we? Show me the active sprint."                    |
| About to start work on the next sprint            | "PM, plan Sprint 5 based on what carried forward."            |
| Picking up a fuzzy story                          | "PM, tighten acceptance criteria on POL-03."                  |
| New UX surface area                               | "UX, design the flow for INV-02."                             |
| Starting implementation of something risky        | "Lead Engineer, break down PER-02 and flag risks."            |
| Day-to-day coding                                 | "Engineer, implement POL-05. Here's the sprint file."         |
| Before committing                                 | "Lead Engineer, review these changes for landmines."          |
| After a playtest                                  | "PM, here are my playtest notes — cluster into backlog."      |
