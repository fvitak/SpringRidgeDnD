# DM Pivot — Voice & Copy

**Owner:** UX Designer
**Status:** Draft 2026-04-30
**Scope:** The DM's voice; rule-explainer copy patterns; bidirectional
DM-override copy; read-aloud framing; First Intimacies copy keyed to the
rating dial.

> The PDF is the source of truth for the DM's voice. Line citations
> reference [`docs/adventure/RescuePDFExtract.md`](../../adventure/RescuePDFExtract.md)
> by line number. Any verbatim line longer than ~15 words is paraphrased,
> not quoted, in app copy.

---

## 1. The DM voice

The PDF's voice is **warm, slightly playful, written for a couple on a
date night**. It addresses two players, often calls out roleplaying
suggestions in casual asides ("just play the character as you see fit"),
and never moralizes. It explains rules quickly when asked but moves on.

Two anchor lines from the extract:

- *"Turn-ons and Pet Peeves are about role-playing"* (line 161). The DM
  cares about feelings before mechanics.
- *"Anything not included in the module is at the discretion of the DM…
  the characters are free to respond as they like"* (lines 546–548). The
  DM is permissive; the script is a floor, not a ceiling.

Our adapted voice rules:

- **Second person, present tense.** *"You step into the cold."*
- **Address both players when both are present**, the active player when
  only one is acting. *"You two share a glance"* vs *"Tarric, you draw
  your bow."*
- **Plain words over flourishes.** The PDF says "the roof slumps" not
  "the dilapidated thatch sags pathetically". Match that register.
- **Never sarcastic.** Even bad rolls get warm framing. *"That's not the
  one"* is allowed; *"oof, brutal"* isn't.
- **Romance copy is tasteful, not titillating.** Match the band, not the
  rating.
- **Short.** A read-aloud beat caps at ~80 words; a DM voice-over caps
  at ~40. If the AI runs longer, schema layer truncates and we ship a
  bug.

### When to use which voice

| Situation | Voice |
|---|---|
| Reading a scripted block | The module's voice — preserve facts, allow flavor. Italic, attributed |
| Riffing between scripted beats | DM voice-over — plain weight |
| Calling a rule | Rule-explainer voice — *coach*, not *judge* |
| DM call (override) | A single sentence, *"because"* phrasing |
| Romance moment | Warm and quiet. Lean on senses, not adjectives |
| System / error | Neutral, what-happened + what-to-do (already in DESIGN-SYSTEM.md §Voice) |

---

## 2. Rule-explainer copy patterns

The audience is two new players. Every dice roll the *first* time it
appears gets the **full explainer**; subsequent rolls of the same kind
shrink to a one-liner. The "Explain like I'm new" toggle (per-player) is
the master switch.

### 2a. Skill check (the canonical example)

**Full form (first time DEX/Stealth comes up):**

> *Stealth check.* Roll a 20-sided die and add your DEX bonus (+3). If
> your total beats DC 13, you slip past unseen. The DC is the lookout's
> Passive Perception — basically how alert he is.

**Result line:**

> You rolled 14, +3 DEX = 17. That beats 13 — so you make it past
> without a sound.

**Short form (second + occurrence):**

> Stealth check vs DC 13. (*Tap to remember.*)

### 2b. Saving throw

**Full form:**

> *Saving throw — CON.* Roll a d20 and add your CON bonus (+1). Beat the
> DC (12) and you shake off the worst of it. Saves are how your character
> resists things happening *to* them — poisons, charms, frostbite.

**Result line:**

> Wynn rolled 9 + 1 = 10. That falls short of 12 — the cold finds her.
> Take 4 cold damage.

### 2c. Attack roll + damage

Two rolls, one explainer. Explain attack first, then damage when the
attack lands.

**Attack full form:**

> *Attack roll.* Roll a d20 and add your attack bonus (+5). Beat the
> target's AC (12) and you hit. A natural 20 is a critical hit — extra
> dice on damage.

**On-hit damage line:**

> Hit. Now roll 1d8+3 for damage — that's your longbow's die plus your
> DEX bonus.

**Result line:**

> 14 + 5 = 19, hits AC 12. 6 + 3 = 9 piercing damage. The lookout
> staggers.

### 2d. Advantage / disadvantage

These are confusing for new players. Spend a sentence on each the first
time:

**Advantage full form:**

> *Advantage.* Roll the d20 twice and take the better of the two. Cover,
> a clever angle, or a setup from your partner can earn you advantage.

**Disadvantage full form:**

> *Disadvantage.* Roll the d20 twice and take the lower one. Awkward
> footing, dim light, or a sloppy plan can saddle you with it.

**Result line (advantage):**

> Rolled 8 and 17 — you keep the 17. With your +3, that's 20.

### 2e. Critical hits and crit-fails (1s and 20s)

> A natural 20 is a *critical hit*. Roll your damage dice twice and add
> them up — your blow lands clean.

> A natural 1 on an attack is a *fumble*. Whatever you swung at, it
> wasn't where you wanted it.

(Save / skill 1s and 20s aren't autosuccesses in 5E — explain only when
they come up; don't preemptively muddy the water.)

### Pattern rules

- Always show the **math**, in order, with the modifier source named
  inline (*"+3 DEX"*, not just *"+3"*).
- Always say what the **DC represented in fiction** (*"the lookout's
  Passive Perception"*) the first time. After that, just *"DC 13"*.
- Use *"beat"* not *"meet or beat"* — 5E rule is "meet or beat" (≥), but
  *"beat 13"* is what new players expect to hear. We can footnote this
  in the cheat sheet, not in every explainer.

---

## 3. DM-override copy (bidirectional)

The two patterns must feel symmetric. Same length, same shape, different
direction. *"Because"* phrasing in both — the DM names a reason. No
emoji, no winks.

### 3a. Cool-bonus (rule-of-cool advantage)

**Strip on the action box (gold accent):**

> *DM call — you read the room (cover, low light)* · **+2**

**Spoken into the dice strip:**

> 14 + 3 (DEX) + 2 (DM call) = 19 — beats 13 cleanly.

**Riff prefix (used when the AI narrates the override into the moment):**

- *"That's a good read."*
- *"Smart move — the shadows are deeper there than you'd think."*
- *"You earn the easier shot."*

### 3b. Cool-penalty (rule-of-cool disadvantage)

**Strip on the action box (dusty rose accent):**

> *DM call — you charged before checking your footing* · **-2**

**Spoken into the dice strip:**

> 14 + 3 (DEX) − 2 (DM call) = 15 — still beats 13, but only just.

**Riff prefix:**

- *"The angle's against you."*
- *"You moved too fast — the floorboard groans."*
- *"That'll cost you a beat."*

### 3c. Adv / disadv variants (no fixed +/- number)

When the override gives advantage or disadvantage instead of a flat
number:

**Bonus strip:** *DM call — clean approach* · **adv**
**Penalty strip:** *DM call — noisy entry* · **dis**

**Result line:**

> Rolled 8 and 17 — *advantage*, you keep the 17. With +3 that's 20.

### 3d. What we never write

- *"Lucky!"* / *"Brutal!"* — judgment words, no.
- *"…but the DM is feeling generous"* — implies the DM is favouring,
  not refereeing. The override is about what the **player** did, not
  about the DM's mood.
- *"You should have…"* — never lecture after a penalty. Name what
  happened, move on.

---

## 4. Read-aloud framing

The PDF marks read-aloud blocks in italics with the explicit instruction
*"To be read aloud or put into your own words"* (line 539, repeated
throughout). Our DM is allowed to riff voice; it must preserve **every
fact** (PDF Structure §4).

### 4a. Visual treatment

In the action box, a read-aloud beat has:

- **Italic body text.**
- **A slim left rule** in the brand accent (gold).
- **A small chip** in the row's top-right: *From the Module*.

### 4b. How the DM speaks the script

- **Preserve nouns and proper names** verbatim (the lookout, Wynn, Briar,
  the cot, the ransom note).
- **Allowed flexibility:** sentence rhythm, transitions, sensory layering
  ("the air smells of damp grain"), warmth toward the players.
- **Never invented:** new NPCs, new exits, new items, mechanics changes,
  spoiler beats, anything contradicting the PDF.

### 4c. The PDF's own *"so what does your character do?"* end-cap

The PDF closes most read-aloud blocks with *"So what does your character
do?"* (PDF Structure §4). We honor this — every read-aloud beat ends with
a short prompt to act. Our variants (rotate so it doesn't echo):

- *"What do you two do?"*
- *"How do you want to handle this?"*
- *"Tarric, Wynn — your move."*
- *"Take a moment. What feels right?"*

### 4d. Worked example

PDF (line 558-ish, paraphrased):

> *It's a chilly autumn morning. The temperature is a few degrees above
> freezing. The sun rose half an hour ago, but shadows are still deep
> among the trees.*

Acceptable AI delivery:

> *(read-aloud)* It's a chilly autumn morning, a few degrees above
> freezing. The sun's been up half an hour, but shadows still pool deep
> under the pines. Frost crackles where you step. Ahead, an old grain
> mill leans against a sparkling stream, its roof slumped like it's
> tired of standing. The scene would be idyllic — except for the
> lookout on the roof, shortbow in hand. *What do you two do?*

Facts preserved: time, weather, mill, stream, slumping roof, lookout,
shortbow. Voice added: *"frost crackles"*, *"like it's tired of standing"*,
*"pine"*. None of the additions invent fact or contradict.

### Edge cases considered

- **Player asks about something the read-aloud doesn't mention** ("is
  there smoke from the chimney?"). DM answers from the scripted
  description if it's there, otherwise *"You can't see from here — get
  closer to find out"* — punt to action, don't fabricate.
- **The PDF's read-aloud block contains a ratio or a number we paraphrase
  poorly.** Flag for engineering: numbers in read-aloud must round-trip
  unchanged through the AI's voice layer. If we ever drop a number, the
  validation layer should refuse the response.

---

## 5. First Intimacies copy by rating

The PDF's ladder (line 419-ish):

- Romantic Hug — 5 AP
- Hand Holding — 5 AP
- First Kiss — 10 AP
- *"Anything more"* — 30 AP

Our copy must match the **rating dial** (G / PG / PG-13 / R / NC-17). The
strict-of-two-players rule means the rating is whichever player set it
lower.

### 5a. The action labels in the Intimacies tray

These are what the player sees on their phone in the tray (see
`screens.md` §2). Same gates, different vocabulary.

| Gate | G | PG | PG-13 | R | NC-17 |
|---|---|---|---|---|---|
| 5 AP | *Take their hand* | *Take their hand* | *Reach for their hand* | *Lace your fingers together* | *Lace your fingers together* |
| 5 AP (hug) | *Pull them into a hug* | *Pull them into a hug* | *Hold them close* | *Hold them against you* | *Hold them against you* |
| 10 AP | *(locked at G)* | *A quick kiss* | *Kiss them* | *Kiss them, slow* | *Kiss them, slow* |
| 30 AP | *(locked under R)* | *(locked)* | *(locked)* | *Take this further* | *Take this further* |

A locked gate shows the **action label greyed** with the lock reason
inline, in plain copy: *"Both of you would need to set a higher rating
before this opens."* No furtive hiding — the player can see the gate
exists and what it would take to reach it.

### 5b. Confirm before committing

Before the action commits:

> This will be a real in-fiction moment your partner sees. Continue?

CTA: *Yes — try* / *Not now*. Cancelling is free; AP doesn't change.

### 5c. Outcome lines (PDF success table, our voice)

The PDF gives outcome bands by `d20 + recipient's AP`:

| PDF outcome (line 435–443) | Our line, recipient's phone |
|---|---|
| Natural 20 — *"Wow, the Earth moved!"* | *"Something just shifted between you. That landed."* |
| Over 20 — *"That was a spiritual experience!"* | *"You feel it through your whole chest."* |
| 10–20 — *"That was fun."* | *"That was warm. Easy."* |
| Below 10 — *"Let's never speak of this again."* | *"It wasn't quite the moment you'd hoped for."* |
| Natural 1 — *"That was too awkward for words."* | *"Awkward — both of you blink at the same time. Move on, gently."* |

These are paraphrases, intentionally — the PDF lines are punchy but
catalog-y. Ours are softer and less catch-phrase-y, suiting the
in-fiction voice. We never quote the PDF's lines verbatim.

### 5d. Tone rules across all rating tiers

- **Sense over body part.** Even at R, lean on warmth, breath, eye
  contact. Don't itemize anatomy.
- **Consent in the language.** *"You feel them lean in. Are you with
  them?"* The recipient's roll is real consent in fiction; the copy
  reinforces that they're an actor.
- **No coaching, no congratulating.** A high-AP outcome doesn't say
  *"nice work"* — it says what happened. The romance isn't a quest
  reward.

### Edge cases considered

- **Mismatched rating mid-session** (one player drops the dial). The
  available tier flips to the lower; previously-unlocked actions for
  that gate update on next paint. Don't strand a player with a copy
  variant that no longer matches the rating.
- **Player tries to initiate at a gate not yet unlocked.** Tray won't
  show it (private gating); they can't try.
- **Rating dial set to G end-to-end.** No 10AP/30AP gates ever appear,
  the romance strip on the sheet still works, AP still tracks. The
  scenario remains complete (PDF says explicitly: *"platonic friends
  can play, just skip the romance rolls"*).

---

## 6. Microcopy library — small but recurring

### 6a. Setup screens (F2)

- Step 2 CTA when not yet scrolled: *Read the rest, then continue.*
- Step 4 reroll line: *That one didn't fit — rerolled.*
- Step 5 vanish-the-number line: *This is the last time you'll see the
  actual number. From here on, it's a feeling.*

### 6b. Action box state

- Empty state: *Press Begin Adventure when both players are ready.*
- Pending roll status (host): *Waiting on Wynn's roll…*
- Stuck-on-pending (~30s+): *Wynn's offline. Pause here, or roll on her
  behalf?*
- Back-to-most-recent chip: *Jump to live ↓*

### 6c. Mobile sheet

- AP-event toast (positive): *Wynn drew the lookout off you ↑*
- AP-event toast (negative): *That landed sideways for Tarric ↓*
- Pet peeves face-down card: *Private until Scenario 3 begins.*
- Reconnecting pill: *Reconnecting to the table…*
- Your-turn banner: *Your turn — the host screen will follow your moves.*

### 6d. Errors (general voice already in DESIGN-SYSTEM.md)

- Slot already taken: *That slot's been claimed on another device. Pick
  another?*
- Roll failed to commit: *Couldn't send your roll. Try once more?*
- Realtime down longer than ~30s: *We've lost the table for a moment.
  Sit tight.*

### Edge cases considered

- **Repeated reroll lines** during Pet Peeves can stack (theoretically up
  to 3 rerolls if both peeves conflict with picks and each other). Cap
  at one display: *Took a couple rerolls to find a fit.*
- **Toast collision** when two AP changes hit on the same beat. Queue
  with 800ms gap so the player can read each.
- **Localization** is out of scope — but voice should not embed jokes
  that lean on English idiom (*"that landed sideways"* is borderline;
  flag if i18n becomes real).
