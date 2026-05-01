# DM Pivot — Flows

**Owner:** UX Designer
**Status:** Draft 2026-04-30 (post-pivot kickoff)
**Scope:** End-to-end user flows for *Rescue of the Blackthorn Clan* with the
AI in its new role: **performer + rules referee** running a scripted module
for a couple new to D&D. Read together with `screens.md` (anatomy) and
`copy.md` (voice).

> Read first: [`docs/adventure/RescuePDFStructure.md`](../../adventure/RescuePDFStructure.md).
> The PDF *is* the script — these flows are how we let two players experience
> that script through phones plus a host laptop.

---

## Cast of flows

| # | Flow | Trigger | Surface(s) |
|---|------|---------|------------|
| F1 | Session create — host picks Blackthorn | Host on `/` | Host laptop |
| F2 | Player join + character setup (Turn-ons / Pet Peeves / First Impressions) | Player scans QR | Phone |
| F3 | During-scene loop — read-aloud → action → roll → resolution | AI delivers a beat | Host + active phone |
| F4 | DM override (cool-bonus or cool-penalty) | DM call mid-roll | Host action box + active phone |
| F5 | Romance moments — AP updates and band shifts | Combat/aid/RP events | Phones (private) + host (band-only) |
| F6 | First Intimacies gating | AP threshold met for one PC | Active phone (private) |
| F7 | Reconnect / phone-drop mid-scenario | Phone loses Realtime | Phone, then host |

---

## F1 — Session create + scenario pick

The host lands on `/`, sees the existing artwork-backed home card, and
clicks **New Session**. The card flips through three short steps. Voice is
warm and unceremonious — this is "let's start", not a wizard.

1. **Pick the scenario.** Today there's a hidden dropdown; for the pivot it
   becomes the primary act of session creation. Two cards: *The Wild Sheep
   Chase* (legacy) and *Rescue of the Blackthorn Clan — Date Night Dungeons*.
   The Blackthorn card carries a quiet "for 2 players · couples-friendly"
   line so a host who picked it by accident can back out cheaply.
2. **Slot count locks to 2** when Blackthorn is selected. The lobby grid
   that today expects 3–4 simply renders two slots — Tarric (Ranger) and
   Wynn (Sorcerer), in that fixed order. Pre-generated PCs are part of the
   module; we don't pretend otherwise.
3. **Date Night toggle + per-player rating dials.** Two switches:
   - *Date Night Mode* (master) — defaults **on** for Blackthorn. If off,
     romance tables don't appear at character setup, AP isn't tracked,
     intimacy gates never fire. Pure 5E mode for platonic friends.
   - *Content rating per player* — G / PG / PG-13 / R / NC-17. Already
     exists (DN-04). The dials sit on the slot cards and travel with the
     player into setup; the strictest of the two caps the scene.
4. **Confirm → QR shown.** Standard QR + `/join/[token]` link, unchanged.

Edge: a host with an in-flight WSC session arrives at `/`. They see their
existing session in a *Resume* card above the *New Session* card and the
Blackthorn pivot doesn't intrude on what they were doing.

---

## F2 — Player join + pre-play character setup

The big new flow. Each player scans the QR and lands at `/join/[token]` on
their phone. Today this fans out into our four-step character creator —
that creator is replaced for Blackthorn by a five-step **matchmaking-quiz**
flow because the PCs are pre-generated. (The 4-step creator stays alive for
WSC.)

The five steps, all on phone, all single-purpose screens:

**Step 1 — Pick your slot.** Two cards: Tarric / Briar (Ranger + wolf
companion) and Wynn (Sorcerer). The PDF explicitly invites swapping
gender/orientation; we surface a small *"customize pronouns"* link beneath
each. Default pronouns are written into the card.

**Step 2 — Read your backstory.** A scrollable card with the PDF's
backstory text (paraphrased, ours to write — see `copy.md`). One CTA:
*"Got it — let's meet your partner"*. The button is gated until the player
scrolls through the whole card so we know they read it.

**Step 3 — Pick 3 Turn-ons.** Card-stack of 20 Turn-ons from the d20 table.
Player swipes (or taps Yes/Skip on each card). Selecting 3 commits. Each
card shows the turn-on name, a one-line "what it means" beat, the mechanic
(*"+d6 on any successful physical skill check witnessed by your partner"*),
and the **incompatibility warning** if it would conflict with already-rolled
Pet Peeves *(only relevant if the player redoes this step after step 4)*.
This is **private** — the partner phone shows a generic "they're picking
their turn-ons" placeholder.

**Step 4 — Auto-roll your Pet Peeves.** App rolls 2× d20 with re-roll on
incompatibility (with a chosen Turn-on or each other). The screen does the
roll *visibly* — two d20 graphics tumble, land, the result fades in with
the peeve name and short description. If the engine had to reroll, the
copy reads *"That one didn't fit — rerolled"* without breaking the show.
**Pet Peeves are private and stay private from the partner for the first
two scenarios** (PDF rule, Section 5a). The pet-peeve cards are read-only;
the player doesn't get to swap them.

**Step 5 — Roll your First Impression.** This is the romance kickoff. The
player sees three statements about their partner (e.g. Wynn's pre-formed
opinions of Tarric, written in the PDF), rolls 3× d20 against them, watches
each verdict resolve (*"+d10 — yes, that's appealing"* / *"-d6 — that
rubs you wrong"* / *"no change"*), then sees the math sum up: dice +
partner's CHA modifier + the fixed bonus from the no-roll preconception =
**starting Attraction Points**. The number is shown **here, once**, with a
short explainer that it'll vanish into a band after this — *"This is the
last time you'll see the actual number. From here on you'll feel it as a
mood."*

End state: phone lands on the mobile sheet. A small banner at the top
reads *"Waiting on your partner…"* until both players finish setup. When
the second one finishes, the host laptop unlocks the **Begin Adventure**
button.

Edge cases considered:
- If a player's First Impression total is below -5, we still drop them on
  the sheet — the band system handles negative starts (PDF allows it).
- If a player closes the phone mid-stack, on rejoin we resume at the same
  step with their previous selections preserved. Pet Peeves don't reroll.
- A partner hovering over the rolling phone could see private content.
  We surface a one-line lockscreen tip on Step 3: *"This part stays just
  yours for the first two scenarios — angle your screen."*

---

## F3 — During-scene loop

The heartbeat. Every beat in the PDF goes through these four phases. The
DM is now visibly **executing the script** rather than improvising:

**Phase A — Read-aloud.** AI delivers the scripted italic block (in its
own voice, facts preserved — see `copy.md` for handling) into the host
action box. Players watch and listen. Active player's phone shows
*"Tarric & Wynn are listening… (host is reading the scene)"*.

**Phase B — Players act.** Host types *"Tarric circles around to flank
the lookout"* into the input bar (or speaks; voice is Sprint 5+).

**Phase C — AI requests a roll.** The schema's `actions_required: roll`
fires. The roll prompt appears on the *active* player's phone — DEX
(Stealth) DC 13, with the **rule-explainer card** expanded by default for
new players: *"You'll roll a 20-sided die and add your DEX bonus. Beat 13
and you slip past unseen."* Player taps **Roll** (the only required tap on
the phone in the watch-first model).

**Phase D — Resolution.** Result animates back to the host action box as
a **dice strip**:
> *Tarric rolled 14 + 3 (DEX) = 17 — that beats 13. You move silent as the
> shadow of the oak.*

The dice strip is a distinct row in the action box (not free narration —
see `screens.md` §Action box layers). Host advances; AI delivers the next
beat (back to Phase A).

State changes (HP, conditions, AP) push to phones over Realtime. Players
*see* their HP tick without tapping. Passive watch-first rule preserved.

If realtime disconnects mid-loop — see F7.

---

## F4 — DM override (the bidirectional one)

Frank's Refinement #3: cool goes both ways. The DM can grant **advantage**
(rule-of-cool bonus) or **disadvantage** (rule-of-cool penalty) when the
player's described approach is, respectively, clever or sloppy. The roll
mostly stands; overrides are the exception.

Flow:

1. Player describes action; host types it.
2. AI sees the described approach and decides *"this earns an override"*.
   Schema returns the roll request **plus** a `dm_call` field with
   `direction: bonus | penalty` and a one-line `reason`.
3. **Host action box renders a dm_call strip** above the roll prompt. It
   is visually distinct from base narration (see `screens.md`) — a slim
   horizontal band with a left-edge accent (gold for bonus, dusty rose for
   penalty), the DM's reason as a single sentence, and a *"+2"* / *"adv"* /
   *"disadv"* token on the right.
4. The same strip pushes to the active player's phone, attached **above**
   the roll modal so it's read before the tap.
5. Roll resolves with the override applied. The dice strip in the action
   box shows the override math explicitly: *"15 + 3 (DEX) + 2 (DM call:
   you read the room) = 20 — crit-adjacent."*

Why visual symmetry matters: if only bonuses got a celebratory strip and
penalties were buried in narration, the system would feel like a yes-machine.
Both directions sit on the same row, same height, same animation. Color is
the only differentiator — not size, not weight.

Edge cases considered:
- An override triggered on a **save** (passive recipient — *"the trap
  fires faster than you can react"*) should still show the strip even
  though the player didn't *describe* anything; the reason just flips
  authorial: *"the dust they kicked up tipped the trap"*.
- Stacking: if the AI ever returns two dm_calls on one roll, the strip
  shows them as separate lines stacked. Two is the cap; the schema rejects
  more.

---

## F5 — Romance moments and AP updates

Per the PDF (Section 5c): never show the AP **number**. Show the **band**.
This already aligns with how `tolerance_threshold` is hidden today.

**What the player sees:**

| Surface | What's shown | What's hidden |
|---|---|---|
| Own phone | Own AP **band** as a soft-color bar at the top of the romance strip + a one-line state ("Flirtatious, playful") | Own AP number; partner's AP entirely |
| Own phone — when AP changes | A toast: *"Something just stuck with you"* + the trigger event in plain English (*"…Tarric drew the lookout off you"*) | The numeric delta |
| Host screen | A *romance pulse* — small heart-pip animation on the affected PC's chip in the sidebar; band-only label appears on hover | Number, partner-private deltas |
| Partner phone | **Nothing** — Pet Peeves and AP are private | All of the above |

Why this works: the PDF says *"don't talk about the number — only the
band"* and *"don't show your sheet to your partner."* The app reinforces
both rules without nagging.

The host (laptop) shows band labels because the AI's narration tone needs
to read off them — but only as a hover/peek on the chip, not as a
permanent on-screen number. The host is one human running the room, not a
spectator with cheat-codes.

**Real-world parallel mode (PDF §5e).** Already opted-into at session
setup or never. When on, the host can tap a small *"They held hands"*
chip in the sidebar romance widget that awards both PCs +AP. This is the
one place the host nudges the romance layer; the AI handles every other
update.

Edge cases considered:
- Both players hit the same AP band threshold on the same beat; we queue
  the toasts so they don't collide.
- A player at -30 (deep negative) shouldn't see "Crazy about" copy ever;
  the band-mapping is per-player and hides untriggered bands.

---

## F6 — First Intimacies gating

PDF (Section 5d): hand-holding 5 AP, romantic hug 5 AP, first kiss 10 AP,
*"anything more"* 30 AP. Initiating requires the AP; the dice still
decide the outcome.

Flow:

1. Player A's AP crosses the next gate. **Their phone only** lights up a
   small new entry in the romance strip: *"You could try something."*
   Tapping reveals the available action(s) at the current threshold —
   *Hold their hand*, *Pull them into a hug*, *Kiss them*, etc., copy
   tuned to the rating dial (see `copy.md`).
2. Player A taps an action. Phone confirms once: *"This will be a real
   in-fiction moment your partner sees. Continue?"*
3. App emits the action through the host action box as a fresh beat
   labelled **Romance roll** (own colour band — see `screens.md`). AI
   narrates the attempt. The d20 + recipient's AP roll resolves on
   recipient's phone (their tap, their consent, their reaction
   determines outcome).
4. Result returns to host narration in voice. Recipient's phone shows the
   PDF outcome line (*"That was fun"* / *"Wow, the Earth moved!"* /
   *"Let's never speak of this again"*), tuned for tone.

The partner doesn't see the gate light up on their own phone (they don't
know AP is in range until A initiates). This preserves the asymmetric
romantic surprise the PDF leans on.

Edge cases considered:
- Recipient declines (*"not now"*) — phone has a cancel option on the
  confirm. The DM narrates the moment passing rather than landing. AP
  doesn't change; we don't punish a *no*.
- Two gates open simultaneously (rare). Only the **lowest** is shown
  initially; once spent, the next surfaces on the next beat.
- *"Anything more"* (30 AP) is hard-capped at the rating dial — if either
  player's dial is below the threshold (PG-13 or under), the option
  appears as **locked** with a one-line explainer (*"Both of you would
  need to set a higher rating before this opens"*). We don't hide it —
  hiding feels furtive; locked-with-reason feels like a thermostat.

---

## F7 — Reconnect / phone-drop

Phones lose Wi-Fi. Already a real concern under PER-02. With the romance
layer's **private state** (Pet Peeves, AP), reconnection has a sharper
constraint: state must reach the *right* phone, not the wrong one.

Flow:

1. Phone loses Realtime. Mobile sheet greys to 60% and shows a
   non-blocking pill at top: *"Reconnecting…"*. The host action box shows
   a small status chip near the affected PC's chip: *"Wynn — phone
   offline"*.
2. Phone regains network. App rejoins the session via stored session token
   (already designed in PER-02). On reconnect, the sheet **fetches the
   PC's full private state** (Pet Peeves, AP band, intimacy gate state)
   *only after the slot identity is verified* — same QR-token the player
   used to claim the slot.
3. While offline, AI requests the active player to roll. Phone reconnects
   mid-prompt: the unanswered roll prompt is still pending and surfaces.
   **The AI does not auto-resolve a roll for an offline player** — that
   would let the host effectively decide for the player. If it's been more
   than ~30s, host gets a soft offer in the action box: *"Wynn's offline.
   Pause here, or roll on her behalf?"* with explicit confirm.

Edge cases considered:
- Two phones reconnect with the same slot token (e.g. someone refreshed
  and the old tab is still alive). Last-claimed wins; old tab gets a
  blocking *"This slot is open on another device"* screen.
- A player's phone died; they want to keep playing on the host's tablet.
  Out of scope for this pivot — flag for backlog.
- After reconnect, the player should never see narration that already
  happened *while they were offline* as if it were new. Recap is "you
  missed: Tarric tied up the lookout. Catching up…" — short, factual, no
  re-narration.

---

## Edge cases considered (across all flows)

- **Couple physically next to each other.** Pet-Peeve privacy is the
  weakest at the table — they can lean over. We can't enforce, only
  encourage (Step 4 micro-copy + a small "tilt your screen" ghost).
- **Solo play (one host, no second player).** Out of scope — the PDF is
  built for 2 PCs; we don't fake a partner. If someone tries a 1-slot
  session, the host gets *"Blackthorn needs two players — invite a
  partner or pick a different scenario."*
- **Mid-session rating change.** A player drops their dial from R to PG-13.
  Currently DN-04 makes this take effect on the next beat; we keep that.
  In F6, this can mean a previously-visible gate locks again — show it
  greyed with the lock reason rather than disappearing.
- **AI returns a `dm_call` the host disagrees with.** No undo button on
  the strip yet (Lead Engineer territory). Note for follow-up: a host-only
  *"override the override"* affordance might be needed for hot-seat
  feedback.
