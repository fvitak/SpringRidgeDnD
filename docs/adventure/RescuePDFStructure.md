# Rescue of the Blackthorn Clan — PDF Structure Map

This is a structural map of [DriveThruPDFRescue5E.pdf](../../DriveThruPDFRescue5E.pdf) (the source adventure module our AI DM is now meant to run). Verbatim text extract is in [RescuePDFExtract.md](RescuePDFExtract.md).

> Source: *Rescue of the Blackthorn Clan*, © 2020 Urban Realms, by Catherine and Thomas Thrush. First in the "Date Night Dungeons" series. Stat blocks are OGL 1.0a; story/romance content is the publisher's IP.

## 1. Adventure shape

- **Total pages:** 144 (PDF reports 312, but extracted text shows the book paginates to 144; the higher count likely reflects double-up handout layouts).
- **Designed for:** **2 PCs**, level 4 — one **sorcerer (Wynn)** and one **ranger (Tarric)** with wolf companion **Briar**.
- **Format:** **4 Scenarios**, each ~1–2 hours of play, each containing one combat plus travel/RP. Players are encouraged to **swap GMs between scenarios** — and **not read ahead** — so both partners get to be surprised.
- **Rules base:** Standard 5E with a layer of "Date Night" romance mechanics on top.
- **Game rating system:** G / PG / PG13 / R / NC17 — players agree up front how spicy the romance content can get. Reevaluated per scenario.

## 2. Table of contents (page numbers from PDF)

| Page | Section |
|------|---------|
| 3   | Introduction |
| 5   | Before Play Begins — Turn-ons & Pet Peeves |
| 7   | First Impressions |
| 9   | During Play — Attraction Points, First Intimacies |
| 10  | During Combat romance rules |
| 12  | **Scenario One** — rescue Wynn from the Old Mill |
| 24  | **Scenario Two** — homecoming + cultist night attack on the manor |
| 36  | **Scenario Three** — pursuing Karsyn/Carrow to the Temple of Nyarlathotep |
| 45  | **Scenario Four** — final confrontation |
| 59  | Character Sheets and Backstories (handouts) |
| 71  | Romance Rolls Cheat Sheet |
| 73  | Scenario One Tokens, Maps, Combat Tracker |
| 83  | Scenario Two Tokens, Items, Maps, Combat Tracker |
| 101 | Scenario Three Tokens, Maps, Images, Items, Combat Trackers |
| 117 | Scenario Four Tokens, Maps, Combat Tracker |
| 127 | Journal pages |
| 143 | OGL |

## 3. Per-scene anatomy (consistent across all 4 scenarios)

Every scenario in the book follows the same shape. **This is the structure our AI DM needs to ingest and run.**

1. **DM Note** — out-of-character setup the GM reads first; lists what to remove from handouts and what to prepare. *Not* read aloud.
2. **Overview** — one-paragraph summary of what happens in the scene.
3. **Setting the scene** — block clearly marked *"To be read aloud or put into your own words"*. This is the **read-aloud narration**. In the PDF it's set off in italic text.
4. **Plot Points** — flagged with a special icon (rendered as `` in the extract). These are **mandatory beats**; everything else is GM discretion. e.g. "Wynn must escape", "Karsyn sends to town for guards".
5. **Location/room descriptions** — broken down by area (Roof, Room 1, Room 2, Loft, Room 3 etc.). Each includes: read-aloud description, **Points of Entry** (window/door state), **DC Checks** (what skill, DC, consequence), **Items** in the room, and **NPCs** present with role-playing suggestions.
6. **Stat blocks** — every NPC/monster gets a full block: name, level, alignment, HP, AC, Init, Speed, Proficiency, Weapons (atk bonus / damage), Abilities (Str/Dex/Con/Int/Wis/Cha + saves), Skills + Passive Perception, Spells (with verbal trigger phrases for sorcerers!), Tactics, Treasure. **OGL.**
7. **DC Checks tables** — sprinkled inline at points of decision, e.g. "Climbing the paddlewheel — DC 10 Athletics, 1d6 damage on a 1."
8. **Travel encounters** — between scenarios. Often a roll table (`d4` for one of four optional encounters).
9. **What Happens Next** — the trigger that ends the scenario.

## 4. Read-aloud narration boxes — how the DM should sound

The PDF gives explicit read-aloud text in italic blocks. The DM is told repeatedly: *"Descriptions that can be read aloud are in italics, but we encourage you to put descriptions into your own words."*

That means our AI DM's job is **not** to invent prose — it is to **deliver the scripted read-aloud text in its own voice** while preserving every fact (cot, gag, chained hands, lookout with shortbow, the specific NPC names, the specific physical layout). Improvisation is allowed for *flavor*, never for *facts*.

Example (Scenario One, opening):

> *It's a chilly autumn morning. The temperature is a few degrees above freezing. The sun rose half an hour ago, but shadows are still deep among the trees…*

> *Ahead an old grain mill sits next to a sparkling stream. The stones of the building glow golden in the morning sun. The roof slumps, giving it a tired and neglected look. The scene would be idyllic if not for the lookout on the roof, keeping watch with a short bow in hand.*

Every scene ends its read-aloud with a prompt back to the players: *"So what does your character do?"*

## 5. Romance / flirty mechanics (the part that's unique to Date Night Dungeons)

This is the layer the AI DM must track in addition to standard 5E. It is **central to the product**, not optional flavor.

### 5a. Turn-ons & Pet Peeves (private, per character)
- Each PC picks/rolls **3 Turn-ons** from a d20 table (e.g. *"A good body — +d6 on any successful physical skill check"*) and **2 Pet Peeves** from a d20 table.
- Each Turn-on/Pet Peeve has an **incompatibility** column — e.g. Turn-on 1 ("Being rescued") is incompatible with Pet Peeve 1 ("Being treated as weak").
- **Kept secret from the partner for the first two scenarios.**
- Triggered when the *other* PC, in line-of-sight, performs the matching action.

### 5b. First Impressions (initial Attraction Points)
- Each PC rolls **3 × d20** against a "preconceived ideas" table written specifically about the *other* PC. Each result either subtracts d6, adds d10, or no change. Plus the other PC's **Charisma modifier**. Plus a fixed bonus from a no-roll preconception. Sum = starting Attraction Points.

### 5c. Attraction Points (the running scoreboard)
- Stored per PC. Positive = attracted, negative = repulsed.
- Bands map to behavior the PC should role-play (*"+10 to +20: Flirtatious, engaging, playful"*; *"-30 and up: So ready to be done with this"*). **Scoreboard number must NOT be shown to either player** during play — only the *band* should colour the AI DM's narration. (Compare to the existing app's hidden `tolerance_threshold` rule.)
- Modified by:
  - **In-combat events** — crit, fumble, max-damage spell, failed spell. Roll d20 on a chart, combine with any matching Turn-on/Pet Peeve.
  - **Aid actions** — flank +2, distract +1, kill opponent +3, physically aid +2, heal/treat +4. Modified by Pet Peeves (e.g. "hates to be coddled" cancels heal aid).
  - **Travel/rest role-play** — DM discretion based on actions like "Tarric makes Wynn dinner".

### 5d. First Intimacies (gates)
- Hand holding / romantic hug: 5 AP. First kiss: 10 AP. *"Anything more": 30 AP.* Initiating action requires that AP threshold; outcome is a d20 + recipient's AP roll on a success table.

### 5e. Real-world parallel mechanic (optional)
- *"Any time the players do the same romantic action as the characters, award Attraction Points."* So if the in-game characters hold hands and the real-world couple holds hands, both PCs get bonus AP. **There is also an optional "spend AP for a real-world kiss/hug" mode that players opt into ahead of time.** This is highly relevant to a couples-targeted UI.

### 5f. End-of-adventure resolution
- AP totals at end of Scenario Four → True Love / Flash of Passion / Can't Wait To Be Rid of Each Other. Resolution chart on page 56.

## 6. Stat blocks (OGL — safe to ingest verbatim)

All NPC stat blocks are explicitly OGL. Every block contains: name, class+level, alignment, HD/HP, init, speed, AC, prof bonus, weapon line(s) with atk bonus + damage, ability scores with mods (and which carry save proficiency), skill list with **Passive Perception** called out, plus any class features, spells with full descriptions and verbal trigger phrases, **Tactics** paragraph, and **Treasure**. Combat trackers in the handouts (e.g. p. 81) summarise the same info into a simple HP/AC/atk grid.

Spells include the full 5E description (range, components, duration, effect text). Wynn's spell list is reproduced in the handouts so the DM doesn't need a separate PHB reference for her.

## 7. Character sheets & forms in the PDF (pp. 59–70)

- **Tarric Greycloak** — backstory (pp. 59–60), character sheet (pp. 61–62), Briar's sheet (p. 63).
- **Wynn Blackthorn** — backstory (pp. 65–66), character sheet (pp. 67–70 incl. spell pages).
- **Romance Rolls Cheat Sheet** — p. 71.

The character sheets are pre-filled (these are not blank forms; they are designed for these two PCs specifically). What the players *do* fill in: chosen Turn-ons, rolled Pet Peeves, rolled First Impression total, current Attraction Point total, current HP, items added during play.

The book also explicitly invites swapping **gender and orientation**: *"For simplicity's sake we've written Wynn as 'she' and Tarric as 'he,' but those assignments are not at all necessary or in any way intrinsic to the story. Feel free to switch the genders and orientations around any way you like."*

## 8. Journal pages (p. 127+)

The PDF includes blank journal pages so players can record what happens. (Possible companion-app feature: auto-generate session journal from the event log.)

## 9. Tokens, maps, combat trackers (handouts)

- Each scenario has cut-out **tokens** for every named NPC/monster.
- Each scenario has **maps** (mill, manor, temple, etc.).
- Each scenario has a pre-built **Combat Tracker** sheet listing initiative numbers down the side and per-NPC HP/AC/atk grids — designed to be filled in with pencil during combat.
- Page 83 explicitly notes: *"Use the white tokens for Thad and Morgan until their duplicity is revealed."* — the book has built-in **identity-reveal mechanics** that the AI DM must honor.

## 10. What this means for the AI DM (one-line)

The AI DM is not an *author* anymore. It is a **performer + rules referee** running this specific scripted module: faithful to plot points, faithful to read-aloud content, faithful to NPC stats and tactics, faithful to the Date Night romance layer — while teaching two new players how 5E works in plain English at every dice roll.

## 11. Critical principle: the PDF is its own instruction manual

**The book itself is the directions.** Every artifact in it doubles as a runtime instruction to the AI DM:

| Artifact in the PDF | What the AI DM should do with it |
|---|---|
| *"DM Note"* boxes | Follow as out-of-band setup; never read aloud to players. |
| Italic read-aloud blocks (*"To be read aloud or put into your own words"*) | Deliver these verbatim or in the DM's own voice — facts must be preserved. |
| `` Plot Point icons | Treated as **mandatory beats**. The DM must engineer play toward them. |
| *"Roll-playing suggestions"* in NPC blocks | Use as the NPC's voice/personality (e.g. Harold = not bright, agrees with everything). |
| *"Tactics"* in stat blocks | Use as the NPC's combat AI (e.g. "Throws dagger before charging"). |
| DC Check tables under rooms | These ARE the rules adjudicator — don't invent new DCs when one is provided. |
| Round-by-round timing (*"Round 1: Morgan opens the door…"*) | Run the encounter on this fixed clock, not freely. |
| *"Use the white tokens for Thad and Morgan until their duplicity is revealed"* | The book itself mandates information-hiding — the AI DM honors this, no spoilers. |
| Romance Rolls Cheat Sheet (p. 71) | The complete ruleset for Attraction Point updates — the DM doesn't need its own. |

**Therefore the LLM's system prompt does not need to be a giant DM rulebook.** It needs to be a small, stable prompt that says *"you run scripted 5E modules. Follow the script in the structured scene context provided to you on each turn. Stay in voice. Teach the players the rules as situations come up. Track the romance layer."* Everything else gets injected per-turn from a parsed/indexed copy of the PDF.

This is the architectural pivot:

- **Before:** LLM is the author of the adventure, given high-level goals.
- **After:** LLM is the actor/referee performing a structured script. The script is data we ingested from the PDF. The LLM's freedom is limited to *voice and pacing*, not *facts and outcomes*.
