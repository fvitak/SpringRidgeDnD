# DM Pivot — Romance Intake Gate

**Owner:** UX Designer
**Status:** Draft 2026-05-01
**Scope:** What replaces the auto-fired opening narration on Blackthorn
when one or both PCs haven't completed romance intake (Turn-ons, Pet
Peeves, First Impressions). Date Night Mode only.

> Read with `flows.md` F2 (character setup) and `screens.md` §1 (action
> box layers). The gate sits between session-load and the first
> read-aloud beat.

---

## 1. Final copy

The gate occupies the action box as an **Empty-state card** (not a beat
row — there is no narration yet). Voice matches §1c of `copy.md`: warm,
slightly tired, never blocking. One soft brand-accent border, italic
header, plain body.

### State A — neither PC has finished intake

> *Hold the curtain a moment.*
>
> Tarric and Wynn haven't told me what makes their hearts move yet.
> Tap a name in the party rail — there's a QR code waiting. Each player
> scans on their phone and picks three Turn-ons, rolls their Pet Peeves,
> and sees their First Impression of the other. Then I can begin.

### State B — one PC done, one not

> *Almost there.*
>
> Wynn is ready. I'm still waiting on Tarric — tap his chip on the right
> and pass him the QR if you haven't yet. Once he's chosen his Turn-ons,
> rolled his Pet Peeves, and seen his First Impression, the morning
> begins.

(Names swap by which PC is unfinished. Single source of truth.)

### State C — final player is mid-intake (just hit Step 4 or 5)

> *Almost there.*
>
> Tarric is finishing up. Give him the room — we'll start the moment he
> lands on his sheet.

State C replaces State B the instant the second player passes Step 2.
No CTA — there's nothing for the host to do.

---

## 2. Visual treatment + placement

The gate **occupies the full action-box content area** in place of any
beat rows. It is a centered card, max-width ~520px, with the existing
soft brand-accent border (gold, same token as read-aloud rule). Padding
matches the explainer card in `screens.md` §1a. No close affordance — it
is gating, not dismissable.

The header is italic (matches read-aloud register), the body is plain
weight, and the implicit CTA — the words *"tap a name in the party
rail"* — pairs with a small **arrow chip pointing right** at the
bottom-right corner of the card, toward the sidebar. No button — the
target is the existing PC chip the host already uses.

The empty-state pattern from `screens.md` §1e (*"Press Begin Adventure
when both players are ready"*) is the family this belongs to; the
intake gate is a more specific variant of that same shape.

**Transition out.** When the second player commits Step 5, the card
fades out over ~300ms and the first read-aloud beat fades in to replace
it. No slide, no celebration animation — the moment belongs to the
narration, not to the system.

---

## 3. Sidebar status indicator — yes

A small **dotted-circle / spinner / check** sits to the right of each PC
name in the party rail, using the existing romance accent palette:

| State | Glyph | Color token | Meaning |
|---|---|---|---|
| Not started | hollow dotted circle | muted ambient | Player hasn't opened the QR |
| In progress | half-filled circle (subtle pulse) | warm pink (romance accent +) | Player is mid-intake |
| Complete | filled check | warm pink | Done; awaiting partner |

Glyph + always-visible text label *"setup"* / *"ready"* on hover for
accessibility (icon-only is forbidden per DESIGN-SYSTEM.md). Pip sits in
the slot the romance pulse occupies later — same real estate, sequential
purposes.

---

## 4. Engineer-facing requirements

1. **Fire condition.** Gate replaces any auto-fire opening narration
   when `session.module_id === 'blackthorn'` AND `date_night_mode ===
   true` AND any character in the session has `romance_intake_complete
   !== true`. Date Night OFF skips the gate entirely.
2. **Status source.** Read intake completion via the existing
   `/romance/status?session_id=...` endpoint (PIV-07). Returns per-PC
   `{ turn_ons_done, pet_peeves_done, first_impression_done }`; all
   three true = complete.
3. **Realtime.** Subscribe the host screen to a Supabase Realtime
   channel scoped to `characters:session_id=eq.<id>` so any commit on a
   PC's intake fields pushes a status update. No polling. The gate card
   re-renders from the new payload; the sidebar pip transitions
   accordingly.
4. **Auto-fire transition.** When the realtime event flips the last
   PC's status to complete, the host issues the opening-narration
   request that today fires on session load. The gate card receives a
   `data-state="dismissing"` attribute, fades 300ms, then unmounts; the
   first beat row mounts in its place. Do not race — wait for narration
   payload before unmounting if network is slow (show *"Beginning…"*
   skeleton if >500ms).
5. **Per-state copy.** Gate component takes `{ unfinishedSlots: PC[],
   inProgressSlot: PC | null }` and renders A / B / C deterministically.
6. **No host bypass.** No "skip intake" button. If Frank wants one
   later, it's a separate decision — flag for PM.

---

## 5. Open question for Frank

If a host has Date Night Mode ON but wants to demo Blackthorn solo (no
second player ever joining), the gate locks the session forever. Do we
ship a host-only **"start without intake"** escape hatch behind a small
*"this is a demo"* link, or is "use Date Night OFF for that" the
answer? My instinct is the latter — fewer affordances, clearer rules —
but flag it.

---

## Edge cases considered

- **Host hasn't shared QR yet.** State A copy reads *"tap a name in the
  party rail — there's a QR code waiting"*; the implicit two-step (share
  QR, complete intake) is one sentence. Doesn't shame the host.
- **Player abandons mid-stack.** Status reverts from "in progress" to
  "in progress" on rejoin (PIV-07 preserves selections); gate stays in
  State B/C. No regression.
- **Realtime drops during intake.** Sidebar pip shows last-known state;
  gate card stays put. When Realtime reconnects, status reconciles via
  one-shot `/romance/status` fetch. Reuse the F7 reconnect pattern.
- **Both PCs finish on the same realtime tick.** Gate dismisses once;
  opening narration fires once. Idempotency on the auto-fire trigger is
  the engineer's responsibility (don't double-narrate).
