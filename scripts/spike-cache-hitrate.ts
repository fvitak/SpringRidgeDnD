/**
 * Pre-Sprint-4.6 spike: measure prompt-cache hit rate for the proposed
 * "split system prompt" pattern.
 *
 * Today: app/api/dm-action/route.ts uses a SINGLE cached `system` entry
 *   (the WSC prompt) with cache_control: ephemeral.
 *
 * Sprint 4.6 plan: TWO-entry `system` array — entry 1 is the stable
 *   module-runner header (cached), entry 2 is the per-turn scene
 *   context (NOT cached). The bet is that the cached prefix stays warm
 *   across turns even though entry 2 changes per turn.
 *
 * This spike runs both configurations for 10 turns each, captures
 * cache_creation_input_tokens / cache_read_input_tokens from the usage
 * payload, computes hit rate, and prints PASS/FAIL against the >=80%
 * threshold (turns 2-10).
 *
 * Run with (Node 24+, no extra deps):
 *   node --experimental-strip-types scripts/spike-cache-hitrate.ts
 *
 * Loads ANTHROPIC_API_KEY from ../../../../.env.local (project root)
 * if present, falling back to process.env.
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// Env loading — minimal .env parser, no dotenv dep
// ---------------------------------------------------------------------------

function loadEnvLocal() {
  // Walk up from cwd looking for .env.local
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env.local')
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, 'utf8')
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
        if (!m) continue
        const key = m[1]
        let val = m[2]
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
        if (!process.env[key]) process.env[key] = val
      }
      console.log(`[env] loaded ${candidate}`)
      return
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  console.log('[env] no .env.local found, using process.env')
}

loadEnvLocal()

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Config — same model the app uses today (see app/api/dm-action/route.ts)
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-6'
const TURNS = 10

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ---------------------------------------------------------------------------
// Mock content — sized to roughly match what the real app will ship.
// Cached header ~3000 tokens; per-turn scene context ~1500 tokens.
// (Anthropic counts ~4 chars per token, so ~12000 chars and ~6000 chars
// respectively.)
// ---------------------------------------------------------------------------

function buildCachedHeader(): string {
  // Module-runner-shaped instructions + fake 5e cheat sheet.
  const runner = `
You are the AI Dungeon Master running a tabletop 5e adventure module.
Respond ONLY with a single JSON object that conforms to dmResponseSchema.
The schema has these fields: narration (string), actions_required (array),
state_changes (array), dm_rolls (array). Never break character; never
emit prose outside the JSON envelope. The narration field uses second-
person, present-tense voice ("you push open the door...").

When the players take an action that should resolve via mechanics, place
a dm_roll entry with the kind, modifier, DC, and reason. State changes
must reference token IDs, not display names — the runtime reconciles
display names back from the tokens table. Plot points advance only when
their preconditions are met; never advance unprompted.

Never reveal the tolerance_threshold field of any character — it is
private DM data. Never narrate around the tolerance bar UI. If a player
asks how their NPC companion feels about them, paraphrase qualitatively.

When the rating is PG, avoid graphic violence and explicit content.
When the rating is PG-13, allow stylized combat and innuendo. R rating
is gated by date_night_mode and the campaign owner. The current rating
and date_night_mode are passed in the per-turn scene context.
`.trim()

  // Synthetic cheat sheet — combat actions, conditions, common DCs,
  // standard ability checks. Padded to roughly the size we'd ship.
  const cheatSheet = `
=== 5e SRD CHEAT SHEET ===

ACTIONS IN COMBAT
- Attack: make one weapon attack with your action.
- Cast a Spell: most spells take an action to cast.
- Dash: gain extra movement equal to your speed for the turn.
- Disengage: your movement does not provoke opportunity attacks.
- Dodge: attack rolls against you have disadvantage; you have advantage on Dex saves.
- Help: give an ally advantage on the next ability check or attack roll.
- Hide: make a Stealth check.
- Ready: prepare an action with a trigger.
- Search: spend an action to look for something.
- Use an Object: interact with a second object beyond the free interaction.

BONUS ACTIONS
- Two-weapon fighting offhand attack.
- Cunning Action (Rogue): Dash, Disengage, or Hide.
- Healing Word (Cleric/Bard).
- Misty Step, Healing Spirit, etc.

REACTIONS
- Opportunity Attack triggered when an enemy leaves your reach without
  Disengaging.
- Counterspell, Shield, Hellish Rebuke.

CONDITIONS
- Blinded: cannot see; auto-fail sight checks; attack rolls against
  have advantage; your attack rolls have disadvantage.
- Charmed: cannot attack the charmer or target with harmful spells.
- Deafened: cannot hear; auto-fail hearing checks.
- Frightened: disadvantage on checks/attacks while source in line of
  sight; cannot willingly move closer.
- Grappled: speed becomes 0; ends if the grappler is incapacitated.
- Incapacitated: no actions or reactions.
- Invisible: heavily obscured to others; attacks against have
  disadvantage; your attack rolls have advantage.
- Paralyzed: incapacitated, cannot move/speak; auto-fail Str/Dex saves;
  attacks against have advantage; melee crits.
- Petrified: turned to stone; incapacitated; resistant to all damage.
- Poisoned: disadvantage on attacks and ability checks.
- Prone: disadvantage on attacks; ranged attacks against have
  disadvantage; melee attacks against have advantage.
- Restrained: speed 0; disadvantage on attacks and Dex saves.
- Stunned: incapacitated; auto-fail Str/Dex saves; attacks against
  have advantage.
- Unconscious: incapacitated, prone; auto-fail Str/Dex saves;
  melee attacks crit; ranged advantage.

SAVING THROW DCs (suggested)
- Very easy: 5 (e.g. notice a sleeping guard).
- Easy: 10 (climb a knotted rope).
- Medium: 15 (pick a simple lock, swim in stormy water).
- Hard: 20 (jump a 20ft chasm, decipher faded glyphs).
- Very hard: 25 (open a magically sealed door without the key).
- Nearly impossible: 30.

ABILITY CHECK PROFICIENCIES
- Strength: Athletics.
- Dexterity: Acrobatics, Sleight of Hand, Stealth.
- Intelligence: Arcana, History, Investigation, Nature, Religion.
- Wisdom: Animal Handling, Insight, Medicine, Perception, Survival.
- Charisma: Deception, Intimidation, Performance, Persuasion.

COVER
- Half cover: +2 to AC and Dex saves.
- Three-quarters cover: +5 to AC and Dex saves.
- Total cover: cannot be targeted directly.

INITIATIVE / SURPRISE
- Roll Dexterity check; ties broken by Dex score, then by player choice.
- Surprised creatures cannot move or take actions on their first turn
  and cannot take reactions until that turn ends.

DEATH SAVES
- DC 10 Constitution save. Three successes => stable. Three failures =>
  dead. Natural 20 => regain 1 HP. Natural 1 => 2 failures.

LIGHTING
- Bright light: normal vision.
- Dim light: lightly obscured; disadvantage on Perception (sight).
- Darkness: heavily obscured; effectively blinded.

EXHAUSTION (1-6)
- 1: disadvantage on ability checks.
- 2: speed halved.
- 3: disadvantage on attacks and saves.
- 4: hit point max halved.
- 5: speed reduced to 0.
- 6: death.

REST
- Short rest: 1 hour, spend Hit Dice to heal.
- Long rest: 8 hours, regain all HP and half max Hit Dice.
- Cannot benefit from more than one long rest per 24 hours.

SPELLCASTING
- Concentration: only one concentration spell at a time. Damage taken
  forces a Constitution save (DC 10 or half damage, whichever higher).
- Components: V, S, M unless replaced by a focus or component pouch.
- Spell slots: spent on cast; recovered on long rest (most classes).

COMMON SPELL REFERENCE
- Bless: 1 action, V/S/M, 1 minute, concentration. Up to 3 creatures
  add 1d4 to attack rolls and saving throws.
- Cure Wounds: 1 action, V/S, touch. Heal 1d8 + spellcasting modifier.
- Detect Magic: 1 action, V/S, 10 minutes, concentration. Sense magic
  within 30ft and identify school with an Investigation check.
- Faerie Fire: 1 action, V, 60ft, 1 minute, concentration. Outline
  creatures in a 20ft cube; advantage on attacks against them.
- Fireball: 1 action, V/S/M, 150ft, 8d6 fire damage in 20ft radius;
  Dex save for half. Ignites flammable objects.
- Guidance: 1 action, V/S, touch, 1 minute, concentration. Add 1d4 to
  one ability check the target makes.
- Healing Word: bonus action, V, 60ft. Heal 1d4 + modifier.
- Hold Person: 1 action, V/S/M, 60ft, 1 minute, concentration. Wis
  save or paralyzed; saves repeat each turn.
- Magic Missile: 1 action, V/S, 120ft. Three darts, 1d4+1 force each.
- Mage Hand: 1 action, V/S, 30ft, 1 minute. Manipulate small objects.
- Misty Step: bonus action, V, self. Teleport up to 30ft.
- Prestidigitation: 1 action, V/S, 10ft, 1 hour. Minor sensory effect.
- Sacred Flame: 1 action, V/S, 60ft. 1d8 radiant; Dex save for none.
- Shield: reaction, V/S, self. +5 AC until next turn.
- Sleep: 1 action, V/S/M, 90ft. Put 5d8 HP worth of creatures to sleep.
- Thunderwave: 1 action, V/S, self (15ft cube). 2d8 thunder; Con save
  for half; pushes creatures 10ft on fail.

EQUIPMENT REFERENCE
- Light weapons (1d6 or less): dagger, club, sickle, javelin, light
  hammer, mace, scimitar, shortsword, handaxe.
- Martial weapons (1d8+): longsword, battleaxe, warhammer, greatsword
  (2d6), greataxe (1d12), maul (2d6), halberd (1d10), pike (1d10).
- Ranged weapons: shortbow (1d6, 80/320), longbow (1d8, 150/600),
  light crossbow (1d8, 80/320, loading), heavy crossbow (1d10, 100/400).
- Armor types: padded (AC 11+Dex), leather (11+Dex), studded leather
  (12+Dex), hide (12+Dex max 2), chain shirt (13+Dex max 2), scale
  mail (14+Dex max 2 disadv stealth), breastplate (14+Dex max 2),
  half plate (15+Dex max 2 disadv stealth), ring mail (14, disadv
  stealth), chain mail (16, disadv stealth, Str 13), splint (17,
  disadv stealth, Str 15), plate (18, disadv stealth, Str 15).
- Shields: +2 AC.

ENVIRONMENTAL HAZARDS
- Falling: 1d6 bludgeoning per 10ft, max 20d6.
- Suffocating: hold breath 1+Con minutes minimum 30s; then drop to 0
  HP and fail death saves until rescued.
- Drowning: as suffocating but immediate when fully submerged without
  air.
- Extreme heat/cold: DC 5 Con save every hour or 1 level of exhaustion.
- Strong wind: disadvantage on ranged attacks and Perception (hearing).
- Slippery ice: difficult terrain; DC 10 Acrobatics or fall prone.

SOCIAL ENCOUNTER GUIDELINES
- Hostile NPCs typically require Intimidation DC 15-18 to back down,
  and Persuasion DC 18-22 to flip cooperative.
- Indifferent NPCs flip friendly with Persuasion DC 12-15, hostile
  with Intimidation DC 8-10 of insult.
- Friendly NPCs help with anything not against their interests on a
  Persuasion DC 8-12; risky favors are DC 15-18.
- Remember the personality, ideal, bond, and flaw drives every check.

EXPLORATION GUIDELINES
- Travel pace: fast 4mph (-5 passive Perception), normal 3mph,
  slow 2mph (+stealth, +tracking).
- Mounts: typical riding horse 60ft speed, 480lb capacity.
- Foraging: DC 10 Survival, yields 1d6+Wis food/water in plentiful
  region; DC 15 in poor region; DC 20 wasteland.
- Vehicle proficiency only matters in difficult terrain or on rolls.

DUNGEON DESIGN BEAT REFERENCE
- Lock difficulty: poor lock DC 10, average DC 15, good DC 20,
  superior DC 25, masterwork DC 30.
- Trap detection: simple trap DC 10-12, moderate DC 15, complex DC 20.
- Trap disarm: typically the same DC plus Thieves' Tools.

VOICE AND TONE GUIDELINES
- Use sensory anchors: smell, sound, light. Don't lean on adjective
  stacking. Don't repeat the same descriptor twice in three sentences.
- Keep narration to 2-4 short paragraphs. Do not write a chapter.
- Address the party as "you" collectively unless one PC takes a
  specific action.
- When players ask the DM a meta question (rules, what's possible),
  answer in narrator voice without breaking the fourth wall.
`.trim()

  return runner + '\n\n' + cheatSheet
}

// Per-turn scene context — varies one field (round_number) so entry 2
// genuinely changes each turn. JSON.stringify'd to mimic the real plan.
function buildSceneContext(roundNumber: number) {
  return {
    scene_id: 'old-mill-ground-floor',
    scene_name: 'The Old Mill — Ground Floor',
    round_number: roundNumber,
    current_location: 'central grain hall',
    read_aloud: {
      first_entry:
        'The mill door groans on rusted hinges. Inside, dust motes drift in shafts of late afternoon light. The grinding stones sit silent. A spilled sack of flour leaves a powdery trail toward the back stairs. From above you hear the faint sound of someone humming.',
      after_combat:
        'The clatter of weapons fades. Briar lowers her hackles. The hum from upstairs has stopped.',
    },
    npcs: [
      {
        id: 'wynn-lookout',
        name: 'Wynn',
        type: 'goblin scout',
        ac: 14,
        hp: 7,
        max_hp: 7,
        speed: 30,
        cr: 0.25,
        attacks: [
          { name: 'shortbow', to_hit: 4, damage: '1d6+2 piercing', range: '80/320' },
          { name: 'scimitar', to_hit: 4, damage: '1d6+2 slashing', range: '5' },
        ],
        traits: ['nimble escape', 'darkvision 60ft'],
        disposition: 'hostile',
        knows_about_party: false,
        position_grid: [12, 4],
      },
      {
        id: 'harold-miller',
        name: 'Harold',
        type: 'commoner (npc)',
        ac: 10,
        hp: 4,
        max_hp: 4,
        speed: 30,
        cr: 0,
        traits: ['gagged', 'bound to a chair'],
        disposition: 'friendly_if_freed',
        position_grid: [3, 9],
      },
    ],
    dc_table: {
      'climb the back stairs silently': 12,
      'investigate the flour trail': 10,
      'spot the trip wire near the chair': 14,
      'persuade Wynn to surrender (after first hit)': 16,
      'identify the humming voice (Survival)': 13,
    },
    plot_points_active: [
      'Discover Harold tied up in the back room.',
      'Capture or drive off Wynn the lookout.',
      'Find the smuggler manifest on the loft desk.',
    ],
    plot_points_completed: ['Approach the mill from the woodline.'],
    visible_tokens: ['briar', 'pc-1', 'pc-2', 'wynn-lookout'],
    hidden_tokens: ['harold-miller', 'flour-trail-marker', 'manifest-loft'],
    rating: 'PG',
    date_night_mode: false,
    map: {
      grid_cols: 24,
      grid_rows: 18,
      walkable: 'standard floorboards; central grain hall is open; back room blocked by stacked sacks (DC 12 Athletics to push through quietly)',
      regions: [
        { id: 'entry', name: 'Entry hall', cells: '0-3 x 0-5', notes: 'door creaks loudly; flour trail leads inward' },
        { id: 'grain-hall', name: 'Central grain hall', cells: '4-15 x 0-12', notes: 'large open space; grinding stones in middle (cover); rope ladder to loft along north wall' },
        { id: 'back-room', name: 'Back room', cells: '16-23 x 0-8', notes: 'where Harold is bound; trip wire near doorway DC 14 Perception' },
        { id: 'stairs', name: 'Stairs to loft', cells: '4-6 x 13-17', notes: 'creaky boards; DC 12 Stealth or alert anyone above' },
        { id: 'loft-access', name: 'Loft access', cells: '7-10 x 13-17', notes: 'where Wynn is positioned; clear sightlines through grain hall' },
      ],
      exits: [
        { from: 'entry', to: 'outside', door: 'main mill door', state: 'closed_unlocked' },
        { from: 'back-room', to: 'outside', door: 'rear door', state: 'barred_from_inside' },
        { from: 'stairs', to: 'loft', door: 'open trapdoor', state: 'open' },
      ],
    },
    pc_state: [
      { id: 'pc-1', name: 'Mira', class: 'Ranger', level: 5, hp: 38, max_hp: 38, ac: 16, position: [5, 6], conditions: [], spell_slots: { '1': 4, '2': 2 } },
      { id: 'pc-2', name: 'Tristan', class: 'Fighter', level: 5, hp: 47, max_hp: 47, ac: 18, position: [4, 6], conditions: [], second_wind_used: false, action_surge_used: false },
      { id: 'briar', name: 'Briar', type: 'wolf companion', hp: 11, max_hp: 11, ac: 13, position: [5, 7], conditions: [], owner_id: 'pc-1' },
    ],
    discovered_clues: [
      'spilled flour sack near entry — recent (last day)',
      'distinctive boot prints in flour: small, three sets',
      'humming heard from upstairs — voice unfamiliar to party',
    ],
    open_threads: [
      'who is humming? not Harold (he is gagged) — third party?',
      'what was the lookout watching for? a signal? approaching reinforcements?',
      'why is the rear door barred from inside? someone planning to flee that way?',
    ],
    soundscape: 'Distant crows. Faint creaking of beams overhead. The rasping of dry flour underfoot. Wind through gaps in the boards.',
    weather_external: 'overcast late afternoon, light wind, dry; no precipitation expected for 6+ hours',
    time_of_day: 'late afternoon (about 2 hours of daylight remaining)',
    party_resources_summary: '2/3 long rest features available; one healing potion shared; arrows 18/20',
    style_overrides: {
      tone: 'tense but not horror; fairy-tale grimness; rural Wessex mill aesthetic',
      avoid_words: ['suddenly', 'eerily', 'mysteriously', 'as if', 'almost'],
      cadence: 'short clauses for action beats, longer ones for environment',
    },
  }
}

// ---------------------------------------------------------------------------
// Token sanity print (rough char->token estimate, 4 chars ≈ 1 token)
// ---------------------------------------------------------------------------

const cachedHeaderText = buildCachedHeader()
const sampleSceneCtx = JSON.stringify(buildSceneContext(1))
console.log(
  `[size] cached header: ${cachedHeaderText.length} chars (~${Math.round(cachedHeaderText.length / 4)} tokens)`
)
console.log(
  `[size] scene context: ${sampleSceneCtx.length} chars (~${Math.round(sampleSceneCtx.length / 4)} tokens)`
)

// ---------------------------------------------------------------------------
// Run a single configuration for N turns, return per-turn usage rows.
// ---------------------------------------------------------------------------

interface TurnRow {
  turn: number
  cache_creation: number
  cache_read: number
  input_tokens: number
  output_tokens: number
  latency_ms: number
}

async function runConfig(
  label: string,
  systemBuilder: (roundNumber: number) => Anthropic.Messages.MessageCreateParams['system']
): Promise<TurnRow[]> {
  console.log(`\n[run] ${label} — ${TURNS} turns`)
  const rows: TurnRow[] = []
  // Conversation history threads through turns to look like a real chat.
  const messages: Anthropic.MessageParam[] = []

  const userActions = [
    'I creep up to the mill door and listen.',
    'I push the door open slowly.',
    'I scan the room for movement.',
    'The fighter draws her sword and advances on the lookout.',
    'I shoot my crossbow at the goblin.',
    'I move to flank from the right.',
    'I try to free Harold from the chair.',
    'Briar growls and lunges at the lookout.',
    'I check the flour trail for footprints.',
    'I climb the back stairs as quietly as I can.',
  ]

  for (let i = 1; i <= TURNS; i++) {
    const userMsg = userActions[(i - 1) % userActions.length]
    messages.push({ role: 'user', content: userMsg })
    const t0 = Date.now()
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: systemBuilder(i),
      messages,
    })
    const latency_ms = Date.now() - t0

    // Pull text out of the response so the next turn's history is realistic.
    let assistantText = ''
    for (const block of resp.content) {
      if (block.type === 'text') assistantText += block.text
    }
    messages.push({ role: 'assistant', content: assistantText })

    const usage = resp.usage
    const row: TurnRow = {
      turn: i,
      cache_creation: usage.cache_creation_input_tokens ?? 0,
      cache_read: usage.cache_read_input_tokens ?? 0,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      latency_ms,
    }
    rows.push(row)
    console.log(
      `  turn ${i.toString().padStart(2)}: cache_creation=${row.cache_creation
        .toString()
        .padStart(5)}  cache_read=${row.cache_read
        .toString()
        .padStart(5)}  input=${row.input_tokens
        .toString()
        .padStart(5)}  output=${row.output_tokens.toString().padStart(4)}  ${latency_ms}ms`
    )
  }

  return rows
}

// ---------------------------------------------------------------------------
// System builders for the two configurations.
// ---------------------------------------------------------------------------

// BASELINE: single cached `system` entry. Identical pattern to today's
// app/api/dm-action/route.ts (single cache breakpoint, no per-turn entry).
function baselineSystemBuilder(_roundNumber: number) {
  return [
    {
      type: 'text' as const,
      text: cachedHeaderText,
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

// TREATMENT: split — entry 1 cached, entry 2 per-turn scene context (no
// cache_control). This is the Sprint-4.6 pattern under test.
function treatmentSystemBuilder(roundNumber: number) {
  return [
    {
      type: 'text' as const,
      text: cachedHeaderText,
      cache_control: { type: 'ephemeral' as const },
    },
    {
      type: 'text' as const,
      text: JSON.stringify(buildSceneContext(roundNumber)),
    },
  ]
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function hitRate(rows: TurnRow[]) {
  // Measured across turns 2..10 — turn 1 is always cache creation.
  const tail = rows.slice(1)
  let hits = 0
  for (const r of tail) {
    if (r.cache_read > 0 && r.cache_creation === 0) hits += 1
  }
  return { hits, total: tail.length, pct: (hits / tail.length) * 100 }
}

function printTable(label: string, rows: TurnRow[]) {
  console.log(`\n=== ${label} ===`)
  console.log('Turn  cache_creation  cache_read   verdict')
  for (const r of rows) {
    let verdict: string
    if (r.turn === 1) verdict = '(creation)'
    else if (r.cache_read > 0 && r.cache_creation === 0) verdict = 'HIT'
    else if (r.cache_read > 0 && r.cache_creation > 0) verdict = 'PARTIAL'
    else verdict = 'MISS'
    console.log(
      `${r.turn.toString().padStart(4)}  ${r.cache_creation
        .toString()
        .padStart(14)}  ${r.cache_read.toString().padStart(10)}   ${verdict}`
    )
  }
  const hr = hitRate(rows)
  console.log(`Hit rate (turns 2-${TURNS}): ${hr.hits} / ${hr.total} = ${hr.pct.toFixed(0)}%`)
}

function totalTokens(rows: TurnRow[]) {
  let inp = 0
  let out = 0
  let cc = 0
  let cr = 0
  for (const r of rows) {
    inp += r.input_tokens
    out += r.output_tokens
    cc += r.cache_creation
    cr += r.cache_read
  }
  return { input: inp, output: out, cache_creation: cc, cache_read: cr }
}

// ---------------------------------------------------------------------------
// Cost estimate (Sonnet 4.x list prices as of 2026-04 — adjust if stale).
// ---------------------------------------------------------------------------
//   input          $3.00 / Mtok
//   output         $15.00 / Mtok
//   cache write    $3.75 / Mtok  (1.25x base)
//   cache read     $0.30 / Mtok  (0.1x base)
function estimateCost(t: ReturnType<typeof totalTokens>) {
  const cost =
    (t.input / 1_000_000) * 3.0 +
    (t.output / 1_000_000) * 15.0 +
    (t.cache_creation / 1_000_000) * 3.75 +
    (t.cache_read / 1_000_000) * 0.3
  return cost
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[spike] model=${MODEL}  turns/config=${TURNS}`)
  console.log(
    '[budget] expected ~10 turns x ~4500 tokens x 2 configs ≈ 90k input tokens; well under $1.\n'
  )

  const t0 = Date.now()
  const baseline = await runConfig('Baseline (single cached entry)', baselineSystemBuilder)
  const treatment = await runConfig(
    'Treatment (split: cached header + per-turn scene)',
    treatmentSystemBuilder
  )
  const wallSeconds = (Date.now() - t0) / 1000

  printTable('Baseline (single cached entry)', baseline)
  printTable('Treatment (split: cached header + per-turn scene)', treatment)

  const baselineHR = hitRate(baseline)
  const treatmentHR = hitRate(treatment)

  const totalsBase = totalTokens(baseline)
  const totalsTreat = totalTokens(treatment)
  const grandTotal = {
    input: totalsBase.input + totalsTreat.input,
    output: totalsBase.output + totalsTreat.output,
    cache_creation: totalsBase.cache_creation + totalsTreat.cache_creation,
    cache_read: totalsBase.cache_read + totalsTreat.cache_read,
  }
  const totalCost = estimateCost(grandTotal)

  console.log('\n=== Summary ===')
  console.log(`wall time: ${wallSeconds.toFixed(1)}s (cache TTL is 300s — must stay under)`)
  console.log(
    `tokens (both runs): input=${grandTotal.input}  output=${grandTotal.output}  cache_creation=${grandTotal.cache_creation}  cache_read=${grandTotal.cache_read}`
  )
  console.log(`estimated cost: $${totalCost.toFixed(4)}`)
  console.log(`baseline hit rate:  ${baselineHR.pct.toFixed(0)}%`)
  console.log(`treatment hit rate: ${treatmentHR.pct.toFixed(0)}%`)

  const decision = treatmentHR.pct >= 80 ? 'PASS' : 'FAIL'
  console.log(`\n>>> DECISION: ${decision} (threshold: treatment >=80%)`)

  // Emit a JSON blob too, for any follow-up tooling.
  const summary = {
    model: MODEL,
    turns_per_config: TURNS,
    wall_seconds: wallSeconds,
    baseline: {
      hit_rate_pct: baselineHR.pct,
      hits: baselineHR.hits,
      total: baselineHR.total,
      totals: totalsBase,
    },
    treatment: {
      hit_rate_pct: treatmentHR.pct,
      hits: treatmentHR.hits,
      total: treatmentHR.total,
      totals: totalsTreat,
    },
    estimated_cost_usd: totalCost,
    decision,
  }
  console.log('\n[json]')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error('[fatal]', err)
  process.exit(1)
})
