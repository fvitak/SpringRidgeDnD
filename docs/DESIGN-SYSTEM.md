# GRAIL — Design System

**Owner:** UX Designer agent
**Scope:** Visual language, interaction patterns, and flow rules for the Guide
screen and mobile character sheet. Update this file when the visual or
interaction language changes — don't let it drift.

> This doc is intentionally short to start. Expand it as patterns harden.
> Anything that feels like a one-off decision is probably an entry that
> belongs here.

## Platforms

- **Guide screen** — laptop browser, 1280px+. One primary pane of narration,
  one persistent sidebar. Dark theme expected (fits "game master at the
  table" mood). High information density is acceptable.
- **Mobile character sheet** — phone portrait. Read-first. Tapping is
  reserved for rolls, death saves, leveling, inventory actions.

## Voice and tone

- **Narration (from Claude):** second-person, present tense, plain
  description over metaphor. Spoiler-safe (never reveals plot twists before
  player discovery).
- **UI copy (from us):** warm, concise, slightly playful. Never sarcastic.
  Assume a player who's new to D&D but not new to phones.
- **Errors:** name what happened in one sentence, say what to try. No
  stack traces surfaced to players.

## Core interaction patterns

### Typewriter narration
AI narration streams character-by-character. Do not let other UI elements
(roll modal, scene suggestions) appear until the typewriter finishes. This
keeps the player's eyes on the story beat, not on a button.

### Roll modal
Appears _after_ the typewriter completes. Includes:
- the name of the roll and its purpose
- the DC if one is set
- a single primary CTA ("Roll d20")
- visible modifier math _after_ the roll ("rolled 12, +2 DEX = 14, hits")
  — this is POL-01.

### Session sidebar (DM)
- Out of combat: "In the Scene" — party + active NPCs + current location.
- In combat: initiative tracker; "In the Scene" is hidden to avoid
  duplicate character listings (Sprint 3 fix).

### Mobile "watch-first" rule
A player should be able to sit at the table and get 90% of the value
without tapping. HP, conditions, spell slots, death saves all update live.
Taps only appear when the AI requests one.

## Flow: first-time session

1. Host lands on `/`, clicks **New Session**, picks adventure, names it.
2. QR code + `/join/[token]` link displayed.
3. Each player scans QR → `/join/[token]` → slot picker → character
   creator (class → race → stats → name) → lands on mobile sheet.
4. When all slots filled (or host marks ready), session flips to `active`.
5. Host types the first action. AI narrates the opening scene.

## Flow: returning to a session (Sprint 4 — PER-02)

_Designer note: this flow is being defined this sprint. Draft below, revisit
before it ships._

1. Host reopens `/` with an existing active/paused session.
2. Last narration replay (brief recap generated from event log) is shown.
3. Host clicks **Resume** — full event log + game_state is re-injected
   into Claude's context; the next `/api/dm-action` call picks up in place.
4. Players re-scan QR; their mobile sheets reconnect via Supabase Realtime.

## Character-sheet anatomy (mobile)

| Region    | Shows                                                                 |
| --------- | --------------------------------------------------------------------- |
| Header    | Name, class/race, level, HP bar                                       |
| Stats     | STR/DEX/CON/INT/WIS/CHA with modifiers                                |
| Combat    | AC, initiative, conditions (badge strip), death-save track at HP=0    |
| Skills    | Proficiency-marked skills with modifiers                              |
| Spells    | Spell slots by level; available spells (Sprint 4 adds action panel)   |
| Inventory | Weight/value/description; use/equip buttons (Sprint 4)                |
| Notes     | (Sprint 5) auto-captured names/locations from narration               |

## Visual language (seed — expand as we harden)

- **Primary brand accent:** TBD — currently using Tailwind defaults. Pick
  one before Sprint 5 polish.
- **Health bar:** green → amber → red; flashes red when damage lands.
- **Condition badges:** neutral background, condition-specific icon,
  always paired with the condition name text (no icon-only).
- **Clickable narration terms (Sprint 5):** blue for unseen, light gray
  for already-saved-to-notebook.

## Home screen — artwork background pattern

The home/lobby screen (`/`) uses commissioned portrait-format artwork as a
full-viewport fixed background. This pattern applies whenever a full-bleed
hero image is used under a UI overlay.

### Background image rules

- Delivered as a Next.js `<Image>` component (not CSS `background-image`),
  positioned `fixed inset-0 w-full h-full object-cover object-center -z-10`.
- The image does not scroll — it is a fixed stage.
- The image is not tiled or flanked by colour fills. Wide viewports crop the
  horizontal edges symmetrically via `object-cover`. This is intentional.
- A full-viewport ambient darkening layer (`fixed inset-0 bg-black/20 -z-[5]`)
  sits between the image and the UI. Keep opacity at 20% or below — its job is
  depth, not obscuring.

### Frosted-glass UI card

Any form or interactive element overlaid on this background uses a frosted
dark card:

```
bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl
```

- Inputs inside the card: `bg-white/10 border border-white/20 text-white
  placeholder:text-white/50`
- Labels: `text-white` or `text-zinc-200`
- Do not use solid opaque card backgrounds (`bg-zinc-900`, `bg-black`) on
  artwork-backed screens — they fight the cinematic mood.

### Title / branding suppression

When the artwork contains baked-in title text (logo, subtitle), remove the
equivalent DOM elements. The image is the source of truth for branding on
that screen. Do not display both.

### Placement

UI cards on the home screen are anchored to the lower-centre of the viewport
(`flex flex-col items-center justify-end pb-12`). The upper half of the image
is intentionally left clear of UI to preserve the artwork's composition.

### Responsive

- Mobile portrait: card is `w-full` with `px-4` margin on the parent. Touch
  targets inside the card must be ≥44px.
- Desktop landscape: card is `max-w-sm` centred. The artwork crops top/bottom
  symmetrically; the lower focal point (figure/horizon) remains visible above
  the card.
- Ultrawide (2560px+): acceptable horizontal crop of edge detail. Revisit with
  `object-[center_30%]` tuning after first visual review if needed.

## Open UX debts

- No documented loading skeletons (we have spinners).
- No empty-state copy for "session with no event log yet" on history view
  (Sprint 4 — PER-03).
- No explicit consent / age screen (Sprint 6, XXX-01 depends on this).
- No onboarding for the stat adjuster UX — being addressed in POL-05.
