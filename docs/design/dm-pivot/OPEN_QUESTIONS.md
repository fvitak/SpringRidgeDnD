# DM Pivot — Open Questions for Frank

**Owner (drafting):** UX Designer, 2026-04-30
**Status:** Each item blocks something specific in `flows.md`, `screens.md`,
or `copy.md`. Resolve before Engineering breaks ground on the affected
sub-feature.

---

## 1. Pet-Peeve auto-reveal timing

`flows.md` F2 and `screens.md` §2d both encode the PDF's rule that Pet
Peeves stay private "for the first two scenarios" (PDF §5a). I've drafted
*"auto-reveals to partner after Scenario 2 ends"* — but the PDF doesn't
say it auto-reveals; it just says private *until then*. Real options:

- **A.** Auto-reveal at the end of Scenario 2. Simpler — players don't
  have to remember to share.
- **B.** Surface a *"reveal to partner?"* opt-in to each player at the
  end of Scenario 2, default off. Respects player choice.
- **C.** Never auto-reveal; players show each other when they want.
  Closest to the table-reading of the PDF.

UX recommendation: **B**. It teaches players the rule changed without
forcing exposure.

## 2. Real-world parallel mechanic — opt-in surface

PDF §5e: *"Any time the players do the same romantic action as the
characters, award Attraction Points"*, plus an opt-in mode where players
spend AP for real-world intimacies. Right now I've got a small
*"They held hands"* chip in the host sidebar romance widget (`flows.md`
F5). Two open questions:

- Where does the **opt-in** for the spend-AP-for-real-world variant
  live? It's a session-level decision per the PDF (*"Decide ahead of
  time"*). I've not put it on the setup flow; it could be a checkbox on
  the host's session settings before kickoff.
- Should the host be the one tapping the parallel-action chip, or
  should each phone get a *"We just did this in the room"* button?
  Hosting it on the host laptop is simpler; phone buttons are more
  honest to the moment.

UX recommendation: **session-level opt-in toggle on the host before
Begin Adventure**, **chip lives on the host sidebar**, both phones get
a small mirror chip during a romance moment to keep agency.

## 3. AP band labels — show on the host or no?

`flows.md` F5 says AP **bands** can be peeked on the host as a hover/peek
on the chip in the sidebar, but never as a number. Frank's call: should
the host see band labels at all? The argument for: the AI's tone needs
to read off them and a host running the room is allowed to know the
mood. The argument against: the host is often a third party (the off-
slot player); revealing partner's AP-mood to an outside party is more
exposure than the PDF intends.

UX default: **show band on hover**, never as a permanent on-screen
label, never with a number. Need Frank's nod to confirm — if he wants
hosts blind too, we hide the band entirely on the host and the AI alone
narrates from it.

## 4. dm_call host-override (the *"override the override"*)

`flows.md` F4 edge case. If the AI returns a `dm_call` the host
disagrees with, today there's no undo. This sits at the boundary of UX
and Engineering — UX needs to know if Frank wants this affordance to
exist before we design where the button goes. Options:

- **A.** No host override. Trust the AI's read; a bad call is a one-off
  and the next beat moves on.
- **B.** Host can dismiss a `dm_call` strip before the player rolls.
  Roll resolves without the override.
- **C.** Host can dismiss *or* flip direction. Powerful, also dangerous —
  invites abuse against a player.

UX recommendation: **A for first ship**. Add **B** if playtests show the
AI mis-reads frequently. Skip C.

## 5. Where does the Date Night master toggle live?

Today, `SCENARIO-MAP-MOVEMENT-PLAN.md` Phase 3 has Date Night as an
opt-in via a session-creation checkbox. `flows.md` F1 has it as a
session-level switch defaulting **on for Blackthorn**. PM owns the
final answer (this is a product-scope decision, not a UX one), but I
need to know:

- If Date Night is **off** for a Blackthorn session, do players still
  see the Turn-on/Pet Peeve setup steps (read-only, mechanically
  inert)? Or do those steps disappear entirely?
- Does turning Date Night off mid-session do anything, or is it
  setup-only?

UX recommendation (pending PM): **steps disappear when Date Night is
off**, and **the toggle is setup-only**. Mid-session toggling adds
complexity for a feature that's already optional.

## 6. Rating-cap behavior at the locked intimacy gates

`copy.md` §5a shows the *"Both of you would need to set a higher
rating"* lock copy. Open question: when both players are at PG-13 and
neither has the dial open in front of them, should the lock copy
include a CTA to *open settings*? Or is it deliberately friction so
players don't change the rating mid-romance-moment under social
pressure?

UX recommendation: **no CTA**. The lock is informational. Players who
genuinely want to change the rating can navigate to settings; we don't
make it a one-tap trigger inside the intimacy tray.

## 7. Pre-generated PCs — name customization

The PDF's PCs are **Tarric** (Ranger) and **Wynn** (Sorcerer), with the
note that gender/orientation is freely swappable. F2 Step 1 surfaces a
*"customize pronouns"* link, but doesn't currently allow renaming.
Question: do players get to **rename** the PCs?

- **A.** No. The PDF refers to Tarric and Wynn by name in NPC
  dialogue, item drops, and journal pages. Renaming risks the AI
  drifting when reading scripted lines.
- **B.** Yes, with an *"and the script will use this name when
  speaking to you"* note. Higher engagement; risk of AI inconsistency.

UX recommendation: **A for first ship**. Allow nicknames as an
*display-only* field on the sheet (so the player still feels theirs),
but the AI uses the canonical name in all read-aloud and NPC speech.

## 8. The "Explain like I'm new" toggle — per-player or global?

`screens.md` §1c describes it as toggleable per device, defaulted ON for
the first session. Question: should the host's choice **propagate to
phones** by default, or are they independent from the start?

UX recommendation: **independent from the start**. The host might be a
veteran running for two new players — host turns the explainers off
for themselves; players keep them on. No coupling.

## 9. Do we ship Blackthorn Scenario 1 first, or all four scenarios?

Out of UX's lane (PM owns), but worth flagging: the romance layer's
emotional arc is designed for **four scenarios**. AP starts low, builds,
crescendos at Scenario 4. Shipping just Scenario 1 might land the
mechanic flat — most groups won't cross the 10 AP gate in the first
combat.

If PM ships Scenario 1 alone, copy in `copy.md` §5d should soften the
"romance reward" framing further — the gates are likely to stay locked
for the full session, and we want that to feel okay rather than
disappointing.

## 10. NC-17 — do we ship it?

`copy.md` §5 includes NC-17 in the rating dial because the PDF lists it.
Real question: **does GRAIL ship NC-17**? There's an Anthropic policy
question buried in here (PM/Engineering territory), and there's a UX
question I can answer either way:

- If NC-17 ships: the *"Take this further"* gate at 30 AP unlocks for
  R+ pairs. Copy is in §5a.
- If NC-17 does **not** ship: cap the dial at R, document it as a
  product decision, and the 30 AP gate becomes locked-with-explainer
  on every Blackthorn session.

UX default for first ship: **cap at R**. Document NC-17 as a deferred
decision so we don't quietly silently cut it.

---

## Resolution log

When Frank rules on each, append the decision below and remove the
question from the open list. Anything that affects more than two files
also goes into `docs/DECISIONS.md`.
