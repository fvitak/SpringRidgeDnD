# DM Pivot — Screen Anatomy

**Owner:** UX Designer
**Status:** Draft 2026-04-30
**Scope:** The three primary surfaces affected by the pivot — Host action
box, Mobile character sheet, Mobile character creator. Wireframes are ASCII
because we describe — Engineering implements.

> Read together with `flows.md` and `copy.md`. Map widget anatomy is
> already covered in [`SCENARIO-MAP-MOVEMENT-PLAN.md`](../SCENARIO-MAP-MOVEMENT-PLAN.md);
> we don't redo it here.
>
> Related: the **romance intake gate** (action-box state when one or both
> PCs haven't completed intake on Blackthorn) lives in
> [`intake-gate.md`](./intake-gate.md).

---

## 1. Host action box — a layered region, not a log

Today the action box is one stream of narration text. After the pivot it
becomes a **stack of typed beats** so the DM's faithfulness is visible.
Each beat is a row with its own visual treatment; the row identifies
**what the AI is doing right now** (reading the script, riffing, calling a
rule, prompting a roll, resolving).

### 1a. Beat types and visual treatment

| Beat type | Source | Visual treatment | Placement |
|---|---|---|---|
| **Read-aloud** | Module's italic block (PDF §3.3) | Italic text, a slim left rule in the brand accent (gold), a tiny attribution chip in the corner: *"From the Module"* | Full-width row |
| **DM voice-over** | AI's own narration around the read-aloud | Plain weight, no left rule, ambient text colour | Full-width row |
| **DM call (override)** | `dm_call` field | Slim horizontal band, left-edge accent — **gold for bonus, dusty rose for penalty**, label *DM call* on left, reason on the right + a token (*+2*, *adv*, *dis*) | Inline between voice-over and roll prompt |
| **Rule explainer** | `rule_explainer` field | Inset card with a soft border and a small *Rules* tag, collapse caret in the top-right (*"Got it — hide these"* persists per-player after first dismissal of that rule) | Below the roll prompt; collapsible |
| **Roll prompt** | `actions_required: roll` | Sticky strip — pinned to the bottom of the action box while pending. Shows: who, what skill, DC, the *"Roll"* CTA on the active player's phone. On the host, it's a status row. | Sticky bottom |
| **Dice strip (resolution)** | Roll result | Single line, monospaced math, soft background tint, microscopic dice-icon prefix. The math is **always visible** (POL-01) | Full-width row |
| **Romance pulse** | AP delta, plot-point hit | Tiny pip on the affected PC's chip in the sidebar; **does not** add a row to the action box (avoid leaking deltas) | Sidebar only |
| **Plot-point chime** | PDF Plot Point flag | Small marker chip on the right edge of the row, label *Plot point* | Inline on the relevant beat |

### 1b. Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Header — Scenario 1: The Old Mill · Round 3 · ⌬ 2 plot pts    │
├────────────────────────────────────────────────────────────────┤
│  ▎ From the Module                                             │
│  │ It's a chilly autumn morning. The temperature is a few      │
│  │ degrees above freezing. The sun rose half an hour ago…      │
│  │                                                             │
│                                                                │
│  Tarric and Briar pad through the frost-bright underbrush.    │  ← DM voice-over
│  The mill's roof slumps against the dawn.                     │
│                                                                │
│  ╾ DM call · You read the room (cover, low light)   +2  ╼     │  ← bonus override (gold)
│                                                                │
│  ┌─ Rules · DEX (Stealth) check ─────────────────────[ × ]─┐  │
│  │ You'll roll a 20-sided die and add your DEX bonus.      │  │  ← collapsible explainer
│  │ Beat 13 and you slip past unseen.                       │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  🎲  Tarric rolled 14 + 3 (DEX) + 2 (DM call) = 19 — beats 13. │  ← dice strip
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  ▶ Roll for: Wynn — CHA save  DC 12              [pending]     │  ← sticky roll prompt
└────────────────────────────────────────────────────────────────┘
```

### 1c. "Explain like I'm new" master toggle

A switch in the host header. **Default ON for the first session, then per
device pref.** When on, every roll comes with an explainer card. When off,
the cards collapse to a single inline link *"Why this DC?"* per dice
strip — players can still pull it up but the screen isn't busy with
tutorials.

The same toggle is mirrored on each phone for the player to opt themselves
out independently. We don't force it.

### 1d. Scroll affordances and stickiness

The action box gets **long**. Three rules:

- **Sticky roll prompt** at the bottom of the box while a roll is pending.
  It does not scroll out of view. It collapses to a slim chip if the
  prompt resolves.
- **"Back to most recent" jump button** appears as a soft floating chip
  at the bottom-right when the host has scrolled up more than two beats.
  Tap to snap to the live edge.
- **Auto-scroll on new beat** by default. Suspended while the host is
  scrolled away from the live edge, resumed on jump-back.
- **Beat anchors** — each beat has a stable id; the URL hash updates so
  the host can deep-link a specific beat to Frank in chat ("look at this
  one weird DM call").

### 1e. What's left out (deliberate)

- No avatars on each beat. The brand accent + read-aloud chip already
  carry "this voice belongs to the module"; an avatar would over-personify
  the AI.
- No timestamp on each beat. Sessions are an evening, not a transcript.
- No edit button on past beats — narration is committed event-log truth.

### Edge cases considered (host action box)

- **Long read-aloud blocks** (the PDF has some that span 5+ short
  paragraphs). The block stays one beat with internal line breaks; the
  left rule continues unbroken. Don't split into multiple read-aloud
  rows — that would imply the script paused.
- **A roll fails and the AI immediately requests a follow-up roll** (e.g.
  *"…you slip — make a CON save vs. fall damage"*). Two dice strips, two
  roll prompts; the second sticky prompt replaces the first.
- **Empty state** before the first beat: a soft *"Press Begin Adventure
  when both players are ready"* card occupies the action box. No
  pretend-narration.

---

## 2. Mobile character sheet — adds a romance strip

### 2a. New regions for the pivot

Adding to the existing anatomy table in `DESIGN-SYSTEM.md`:

| Region | Shows | Visibility |
|---|---|---|
| **Romance strip** (new) | AP **band** label + soft-color bar, current state copy ("Flirtatious, playful"), recent AP-event toast | Self-only |
| **Turn-ons** (new) | The 3 chosen, with mini-tooltip on each | Self-only |
| **Pet Peeves** (new) | The 2 rolled, dim-locked card | Self-only; auto-reveals to partner after Scenario 2 ends |
| **Romance Cheat Sheet** (new) | A pull-up drawer summarising bands, intimacy gates, and combat AP rules | Self-only |
| **Intimacies tray** (new, conditional) | Any unlocked intimacy actions when AP threshold met | Self-only |
| **Rating dial** (existing, unchanged) | G/PG/PG-13/R/NC-17 with partner-cap badge | Self-only |

### 2b. Layout

```
┌────────────────────────────────┐
│  Tarric · Ranger 4 · HP 35/35  │  ← header (unchanged)
├────────────────────────────────┤
│  AC 15  Init +3  Speed 30      │
│  Conditions: —                 │
├────────────────────────────────┤
│  ✦ Romance                     │
│  ╔═════════════════════════╗   │  ← AP band bar (color only,
│  ║  Flirtatious, playful   ║   │     no number)
│  ╚═════════════════════════╝   │
│  Last beat: Wynn drew the      │  ← AP-event toast (decays)
│  lookout off you ↑             │
│                                │
│  Your turn-ons (3)             │
│  • Caretaker · • Good in a     │
│    fight · • Quiet competence  │
│                                │
│  Your pet peeves (private)     │
│  ▢ ▢   tap to view             │
│                                │
│  Cheat sheet ▾   Rating: PG    │
├────────────────────────────────┤
│  Stats / skills (unchanged)    │
│  Spells / inventory            │
└────────────────────────────────┘
```

When an intimacy gate opens, an **Intimacies tray** slides up from the
romance strip. It is bordered with a softer accent than the rest of the
sheet so it reads as a *moment*, not a permanent panel:

```
  ┌─ Something's possible ─────────┐
  │  • Take their hand             │
  │  • Pull them into a hug        │
  │  ─ locked ─ A first kiss       │
  └────────────────────────────────┘
```

### 2c. Watch-first compliance

The new strip is **read-only** by default. Taps reserved for:
- expanding the cheat sheet
- expanding pet-peeve cards
- initiating an intimacy
- the existing rolls / death-saves / leveling
- the rating dial (existing)

Everything else updates passively over Realtime.

### 2d. Privacy and partner separation

The romance strip is the most leak-prone region we've added. Visual rules:

- **Pet-peeve cards stay face-down** (a card-back graphic) until tapped;
  the player has to actively flip them to read the words. This makes
  shoulder-surfing harder than open text.
- **AP toasts** show the trigger event in plain English but never the
  number. *"Wynn drew the lookout off you ↑"* — the up-arrow is the only
  delta indicator.
- **Pre-Scenario-3 lock** on Pet Peeves is enforced both in copy
  ("private until Scenario 3 begins") and in the data model (Engineering's
  job; UX flags it).

### Edge cases considered (mobile sheet)

- **Long AP-event toast text** (the AI riffs on the trigger). Cap at two
  lines + ellipsis; tap toast to open the full beat in the host action
  box mirrored read-only.
- **Negative AP band** (-30 and up). The band-bar fills from the *right*
  toward the centre rather than left-to-right; visual cue that the bar
  is "cooling" not "filling". Color shifts cool blue/grey on the negative
  side, warm pink on the positive side. Same height, same prominence —
  bidirectional symmetry mirrors the dm_call rule.
- **Both turn-on tooltips open at once** on a small screen. Use a single
  modal for tooltip detail rather than overlapping popovers.
- **No spells region** for Tarric (Ranger has none). Don't show an empty
  Spells card; collapse the section entirely.

---

## 3. Mobile character creator — matchmaking quiz

### 3a. The five-step shape

(See F2 in `flows.md` for the flow.) Each step is **one screen**, full
height, with a thin progress strip at the top (*Step 3 of 5 · Pick three
turn-ons*). No multi-step forms; the phone gets one decision at a time.

### 3b. Card-stack pattern for Turn-ons

A vertical stack of d20 cards, 20 deep. Players can flick between cards
or scroll. Selecting 3 commits.

```
┌────────────────────────────────┐
│  Step 3 of 5                   │
│  Pick three turn-ons (0/3)     │
│                                │
│   ╭──────────────────────────╮ │
│   │   "Caretaker"            │ │
│   │   When your partner      │ │
│   │   bandages or heals you, │ │
│   │   you feel it.           │ │
│   │   ─────                  │ │
│   │   +d6 to your AP on a    │ │
│   │   successful heal.       │ │
│   │                          │ │
│   │   [ Pass ]   [ This me ] │ │
│   ╰──────────────────────────╯ │
│   · · · ● · · · · · ·          │  ← stack indicator
│                                │
│  Skip · Why d20 tables?        │  ← help link
└────────────────────────────────┘
```

The cards lean into the *matchmaking-quiz* read — a single soft brand
accent, big readable copy, no spreadsheet. The mechanic line is
**under** the description, smaller font, so players read the vibe before
the math. Players new to D&D get a sense of "what kind of character is
this" before "what does the bonus do".

When 3 are selected, the bottom of the screen shows the choices as small
chips and the CTA *"Lock these in →"* lights up.

### 3c. Auto-roll for Pet Peeves

Tap *"Roll my pet peeves"* once. Two d20 graphics tumble simultaneously,
land, and reveal one card each. If the engine had to reroll for
incompatibility, a brief overlay reads *"That one didn't fit — rerolling"*
and a soft re-tumble plays. Players can't pick or reroll — that's the
PDF's design. The cards face up here (player has to know what they
rolled). The "back of the card" lock kicks in once they leave this screen.

### 3d. First Impression card

Three preconception statements stack vertically. Each has its own d20.
Players tap *Roll* once per statement; results animate one-by-one with
plain English explainers (see `copy.md`). At the bottom the math sums:

```
  d10 + 0 + d10  =  +14   First-impression rolls
  + 3                       Their CHA modifier
  + 2                       The "they helped you" preconception
  ─────
  +19                       Starting Attraction Points
```

A one-line note follows: *"This is the last time you'll see the actual
number. From here on, it's a feeling."* Then *"Continue to your sheet"*.

### Edge cases considered (creator)

- **Player skips through the backstory step.** Step 2 requires scroll-to-
  bottom before the CTA enables; we don't pretend they read it but we
  raise the bar slightly. If they tap *"Skip for now"* (link, not button),
  we drop a one-line warning that romance moments will reference the
  backstory and they can re-read it from the sheet later.
- **First Impression rolls all negative.** Player lands on the sheet at
  -10 or worse. Copy on the sheet's first paint reads *"Things start
  cool between you. That's okay — feelings change."* Don't moralize.
- **Player abandons mid-stack and the partner's already done.** Partner
  sees a *"Waiting on Tarric…"* screen (existing pattern). No timer.
- **Touch targets.** The Yes/Skip buttons must be ≥44px tall and at least
  half-screen-width-each so a thumb can find them in low light. Card
  swipe is opt-in, not required — buttons are the primary input.

---

## 4. Updates to write into DESIGN-SYSTEM.md

When this draft is reviewed and stable, we fold the durable patterns into
the system doc. Specifically:

- New section *"Action box — beat layers"* describing the typed-row
  pattern, the read-aloud accent rule, and the dm_call symmetry.
- New row in the mobile character-sheet anatomy table for the romance
  strip and intimacies tray.
- New principle: *"Bidirectional visual weight."* When the system handles
  reward and consequence (DM calls, AP gain/loss), the visual treatment
  must be symmetric in size and prominence. Color is the only acceptable
  differentiator.
- Note: the romance accent is **a deliberate addition to the palette**
  (warm pink on the positive AP side, cool blue/grey on the negative).
  It's the only place the romance layer earns its own colour; anywhere
  else, fall back to the existing accent.

I'll quote the DESIGN-SYSTEM.md additions in the hand-back to Frank for
sanity-check before committing.

### Edge cases considered (system-level)

- **Conflict with existing condition badges.** Conditions already pair
  icon+text. A romance pulse is *not* a condition; treat it as a
  separate layer (sidebar pip on the chip), don't crowd the conditions
  strip.
- **Dark theme contrast** on the new soft-color band-bars must hit the
  same accessibility threshold (4.5:1 for label text against bar fill).
  Engineering will measure; UX flags.
- **Brand accent collision.** Today the gold accent is loosely used for
  the brand. The DM-call bonus also uses gold. If the page already shows
  brand gold elsewhere, the dm_call strip should outline rather than
  fill — keep the brand from competing with the runtime signal.
