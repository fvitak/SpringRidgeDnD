# DM Pivot — Accessibility & Consistency

**Owner:** UX Designer
**Status:** Draft 2026-04-30
**Scope:** What to keep aligned with `docs/DESIGN-SYSTEM.md`, where the
pivot deliberately extends the system, and the accessibility constraints
the new patterns must clear.

---

## 1. What to keep from the existing system

- **Dark theme** on the host laptop. The action box stays on the existing
  background; we do **not** introduce a new neutral-light surface for the
  read-aloud beats. The italic + left-rule + chip already does the work.
- **Typewriter narration** still gates the roll modal (DESIGN-SYSTEM.md
  §Core interaction patterns). The new beat-types stream the same way;
  the dm_call strip animates *in place* once the voice-over before it
  finishes. No skipping ahead.
- **Mobile watch-first rule** is preserved. The romance strip is read-only
  by default; the only new tap surfaces are *expand cheat sheet*,
  *flip pet-peeve card*, and *initiate intimacy*.
- **Condition badges** still pair icon + text label (no icon-only). The
  romance pulse on a chip is a separate layer, not a condition; it
  doesn't change this rule.
- **Frosted-glass card** pattern from the home screen carries into the
  Blackthorn scenario picker without modification. The card just gets a
  second card sibling (*The Wild Sheep Chase* / *Rescue of the
  Blackthorn Clan*).

## 2. Where the pivot deliberately extends

These are documented as *extensions*, not silent third patterns.

- **Action box becomes layered** (was: single narration log). The beat
  rows + sticky roll prompt + dice strip are new structure, but each
  individual treatment (italic for read-aloud, monospaced math for dice)
  reuses pieces already in the system. No new font stack.
- **Bidirectional visual weight** is a new principle. Reward rows and
  consequence rows must be visually symmetric — same height, same
  animation, same weight. **Color** is the only allowed differentiator.
  This applies to: dm_call (gold / dusty rose), AP band bar (warm /
  cool), and to any future feature that handles "good thing happened" /
  "bad thing happened".
- **Romance accent palette** is added: a warm pink for positive AP
  bands, a cool blue/grey for negative. This is the only place the
  palette grows. Document it in DESIGN-SYSTEM.md §Visual language as
  "romance accent" with a note that it appears **only** on romance-layer
  surfaces and never in the host action box (where the brand gold rules).

## 3. The action box gets long — affordances

(Already specified in `screens.md` §1d; surfacing here for the system-
level checklist.)

- Sticky roll prompt at the bottom of the action box while pending.
- Floating *Jump to live ↓* chip when scrolled away from the live edge.
- Auto-scroll suspended while the host is reading scrollback; resumed on
  jump-back.
- Beat anchors via stable ids; URL hash updates so a beat is shareable.

## 4. Partner privacy — leak audit

The pivot adds two genuinely-private data fields per character: **Pet
Peeves** and **Attraction Points**. The leak audit:

| Surface | Risk | Mitigation |
|---|---|---|
| Other player's phone | Direct leak | Realtime payloads are scoped per character_id; partner phones don't subscribe to other character rows. Engineer's responsibility, UX flags. |
| Host laptop | Indirect leak (visible to both at the table) | AP shown as **band only** on hover of the chip in the sidebar; never as a number. Pet Peeves never shown on the host. |
| AI narration | Inferential leak ("the lookout's slovenly armor irritates Wynn — *that's a peeve*") | The DM is allowed to *behave* per the peeve but not *name* it before Scenario 3. Prompt rule, system-prompt territory. UX provides the "before Scenario 3, never label peeves in narration" copy rule. |
| Reconnect path | Wrong-phone state | F7 in `flows.md` requires slot-token verification before private state is fetched on reconnect. Flagged for Engineering. |
| Shoulder-surfing at the table | Physical | Pet-peeve cards stay face-down by default; one-line tip at setup ("angle your screen") |

## 5. Accessibility checklist (per pattern)

### 5a. Touch targets (mobile)

- Yes/Skip buttons in the Turn-on stack: ≥44px tall, ≥half-width.
- Pet-peeve flip cards: tap surface = full card.
- Intimacy tray actions: ≥44px tall, full-width on small screens.
- Rating dial (existing): unchanged.
- The active-player banner *"Your turn — the host screen will follow
  your moves"* is read-only — not interactive — so 44px isn't required;
  it just needs to be legible (≥14px body, dark-theme contrast).

### 5b. Colour and contrast

- **AP band bar** label text vs. fill must hit 4.5:1 (WCAG AA). The fill
  is soft on purpose; the label may need to be near-white on the warm
  side and near-black on the cool side. Engineering measures.
- **DM-call accents** (gold / dusty rose) must reach 3:1 against the
  action-box background as a non-text colour cue, and the **strip's
  text** must independently reach 4.5:1. Don't lean on color alone — the
  strip also carries the word *"DM call"* + reason.
- **Read-aloud left rule** is decorative; the *"From the Module"* chip
  is the assistive cue.

### 5c. Non-color signals

- Override direction is signalled both by **color** (gold/rose) **and by
  text** (*+2*, *adv*, *dis* token; reason copy). A colour-blind player
  can read the direction from the math sign and the *"DM call —"*
  prefix.
- AP band changes signal direction via a **text arrow** (↑ / ↓) in the
  toast, not just the bar fill.

### 5d. Keyboard path on the host

- Roll prompts on the host screen are reachable by Tab and triggered by
  Enter or Space. (DESIGN-SYSTEM.md notes this as a baseline; we hold
  to it for the new dm_call confirm flow.)
- The "Explain like I'm new" toggle and the rating-dial settings on the
  host's session header are tab-reachable.

### 5e. Motion / animation

- Tumble animation on the d20 graphics (Steps 4 and 5 of setup, and the
  Romance roll) honors `prefers-reduced-motion`. When reduced, dice
  resolve via a quick fade instead of a tumble.
- Auto-scroll on new beats also honors reduced-motion: scroll *jumps*
  rather than smoothly animates.

### 5f. Screen reader & live regions

- The dice strip is announced as a live region (*"Tarric rolled 14 plus
  3 DEX equals 17, beats 13"*).
- The dm_call strip is announced *before* the dice strip — sequence
  matters for the math to make sense. Engineering must respect DOM
  order.
- AP-event toasts are announced once and don't repeat.

## 6. Cross-feature consistency check

- **Map widget** (per `SCENARIO-MAP-MOVEMENT-PLAN.md`) and the new
  layered action box need to share the same beat sequence. A movement
  click that the AI later narrates ("Tarric crosses to the cot") should
  appear as **one beat** in the action box, not two — the move-line is
  generated locally and folded into the next AI beat. No duplicate
  rows.
- **Combat tracker** (existing) and the new dm_call strip both want the
  reader's eye. During combat, dm_call strips render *inside* the
  initiative-current row in the action box, not above the whole box —
  keeps the eye on whose turn it is.
- **Drunkenness state** (existing per ADR) and AP band both use the
  hidden-number pattern. Good — they're siblings. Document the pattern
  once in DESIGN-SYSTEM.md as *"Hidden numeric state"*.

## 7. Things to flag for follow-up

- We don't have a documented loading skeleton for the romance strip's
  first paint after reconnect (DESIGN-SYSTEM.md §Open UX debts already
  notes "no documented loading skeletons"). When the romance strip
  reconnects, it should skeleton, not flicker the band incorrectly.
- The "Explain like I'm new" toggle behavior across both phones and the
  host needs a single source of truth — per-device pref, but the *first
  session* default = ON for everyone, regardless of device. PM/Engineer
  should confirm where this state lives.
- Onboarding for the matchmaking-quiz creator — there's no existing
  pattern for *"swipe to skip / tap to pick"* in this codebase. Risk of
  players not realizing there are 20 cards to scroll through. A subtle
  *"20 in this stack"* counter handles this; flag for visual review.

## 8. Deltas to write into DESIGN-SYSTEM.md

These get folded in once Frank reviews the draft. I'll quote old/new
when the time comes.

- **§Voice and tone:** add a sentence noting that the DM voice for
  Blackthorn is *"the module's voice — preserve facts, allow flavor."*
- **§Core interaction patterns:** add *"Action box — beat layers"* with
  the typed-row taxonomy.
- **§Core interaction patterns:** add *"Bidirectional visual weight"* as
  a named principle.
- **§Mobile character-sheet anatomy table:** new rows for romance strip,
  turn-ons, pet peeves, romance cheat sheet, intimacies tray.
- **§Visual language:** add *"Romance accent"* (warm pink / cool grey-
  blue) with the constraint that it lives only on romance-layer surfaces.
- **§Open UX debts:** retire the "no documented loading skeletons" note
  for the romance strip if Engineering ships skeletons; otherwise leave.

### Edge cases considered

- **Player turns off "Explain like I'm new" mid-session.** Already-shown
  explainer cards collapse on the next render; they don't disappear in
  place (would yank the layout). Already-resolved dice strips keep the
  inline math regardless of toggle — math is POL-01 territory and not
  optional.
- **A host with no audio reading aloud.** Read-aloud beats are still
  delivered as text — the italic block carries the script even if no one
  is *speaking* it. The PDF allows "or put into your own words"; we
  allow "or just read on your screens".
- **Two players on phones with different reduced-motion prefs.** Each
  device respects its own pref. Host laptop is independent.
- **Long-form narration that goes off the end of small phones.** The
  romance strip toast caps at two lines; AP-event explanations beyond
  two lines collapse with *"…tap to read"*. Mobile is read-first but
  not infinitely tall.
