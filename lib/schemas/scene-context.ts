/**
 * Scene-context contract — the JSON shape that hand-crafted or ingested
 * adventure modules serialise into. Consumed by `lib/prompts/module-runner.ts`
 * at runtime and by `scripts/validate-adventures.ts` at author time.
 *
 * Status: v1, shipped as part of PIV-02b (Sprint 4.6, 2026-04-30). Versioned
 * at the file level via `schema_version`. See ARCHITECTURE.md
 * "Ingestion subsystem → Versioning policy" and the 2026-04-30 ADR
 * "Scene-context JSON is a versioned, schema-validated public contract".
 *
 * Design intent for v1: most fields optional. Sprint 4.7 will pressure-test
 * against real Blackthorn content; expect a handful of fields to harden into
 * "required" in v2 with a migration script.
 *
 * 2026-04-30 update (Sprint 4.7 Part 1 retro): three additive widenings
 * landed against gaps surfaced by the Blackthorn ingest. They are all
 * backward-compatible — every v1 document still validates clean — so the
 * file-level `schema_version` does NOT bump. See the 2026-04-30 ADR
 * "Scene-context schema additive v1 widenings (NPC pool, NPC level/class,
 * structured items)" for the rationale.
 *   1. `Manifest.shared_npcs?` — optional NPC stat blocks scoped to the
 *      whole module so an NPC reused across scenes (e.g. Harold the
 *      Lookout in Blackthorn Parts 1+2) lives once. The validator's
 *      cross-reference check resolves `location.npcs_present[]` against
 *      either `scene.npcs[]` or `manifest.shared_npcs[]`.
 *   2. `NPCStatBlock.level?` + `NPCStatBlock.class?` — first-class numeric
 *      level and class string. `role` keeps its descriptive label
 *      ("Lookout"); the level/class lift out of the `role` blob so the
 *      runtime can compute proficiency bonuses without re-parsing prose.
 *   3. `Location.items[]` widened from `string[]` to
 *      `Array<string | { id, name, properties? }>`. Inert room dressing
 *      ("desk", "candle") keeps the string form; mechanically active
 *      items (Wynn's Ring of Regeneration, Amulet of Protection) use the
 *      object form. The string form remains valid for all v1 data.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/**
 * Current major schema version. Bump only on breaking changes; additive
 * changes (new optional field) keep the same version.
 */
export const SCENE_CONTEXT_SCHEMA_VERSION = 1 as const

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/**
 * A single beat of narration. The runtime currently stitches all beats into
 * one paragraph; POL-12 (BACKLOG.md) will eventually render each beat with
 * fade-in and a Continue gate. The schema is shaped now to support that
 * later without churn.
 *
 * - `read_aloud`: italic / boxed text from the module — delivered as written
 *   (or paraphrased without losing facts).
 * - `scene_description`: room-state prose from the DM, sourced from the
 *   module body.
 * - `dm_voice`: editorial commentary or tone-setting written in the
 *   module-runner's narrator voice.
 */
export const narrationBeatSchema = z.object({
  /** Stable id within a scene (e.g. `"open"`, `"after-combat"`). */
  id: z.string().min(1),
  type: z.enum(['read_aloud', 'scene_description', 'dm_voice']),
  /** The prose itself. Plain text, paragraph breaks via `\n\n`. */
  text: z.string().min(1),
  /**
   * When this beat fires. Optional — most beats fire on `scene_start`. Free-
   * form so the script can express "after_combat" or "approach_mill" without
   * needing the schema to enumerate every trigger.
   */
  trigger: z.string().optional(),
})

export type NarrationBeat = z.infer<typeof narrationBeatSchema>

/**
 * A DC check the AI may invoke. v1 carries enough for the action box's
 * teaching templates (`docs/design/dm-pivot/copy.md` §rule-explainer).
 */
export const dcCheckSchema = z.object({
  /** Stable id within the surrounding scope. */
  id: z.string().min(1),
  /** 5e ability/skill name (lowercase): `"sleight_of_hand"`, `"perception"`. */
  skill: z.string().min(1),
  dc: z.number().int().min(1).max(40),
  /** What the player is trying to do. Used in the teaching explainer. */
  context: z.string().min(1),
  /** Consequence of failure — what the AI narrates / applies. */
  fail: z.string().optional(),
  /** Consequence of success — sometimes script-specific. */
  success: z.string().optional(),
  /**
   * If true, this DC is a candidate for a `dm_override` (clever play could
   * grant advantage, sloppy play disadvantage). Authors flag overridable
   * checks explicitly so the AI doesn't bend rules at random.
   */
  override_eligible: z.boolean().optional(),
})

export type DCCheck = z.infer<typeof dcCheckSchema>

/**
 * A way into a location — a door, a window, a paddlewheel climb. Each
 * may carry its own DC check (climb the wheel) or none at all (the front
 * door is unlocked).
 */
export const pointOfEntrySchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  /** Dot-id reference to a `DCCheck` defined on the location, or inline. */
  check: dcCheckSchema.optional(),
})

export type PointOfEntry = z.infer<typeof pointOfEntrySchema>

/**
 * Structured (mechanically-active) item entry. Use the object form when an
 * item carries gameplay-affecting metadata the runtime should be able to
 * read without parsing prose — magical items, scripted loot, anything the
 * AI is expected to attach state to. Inert dressing ("desk", "candle")
 * stays as plain strings via the `items` union.
 *
 * `properties` is intentionally untyped — modules carry their own
 * authoring conventions (effect text, charges, attunement). v1 keeps it
 * a free-form bag; if a convention shows up across modules we promote
 * specific keys in v2.
 */
export const structuredItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  properties: z.record(z.string(), z.unknown()).optional(),
})

export type StructuredItem = z.infer<typeof structuredItemSchema>

/**
 * Items in a location are either inert string descriptors ("desk",
 * "candle") or structured entries (the object form). The union widening
 * preserves v1 string-only data — it still validates as the string arm.
 */
export const itemEntrySchema = z.union([z.string().min(1), structuredItemSchema])

export type ItemEntry = z.infer<typeof itemEntrySchema>

/**
 * A spatial / narrative beat within the scene — a room, a perch, a
 * stretch of road. Locations are the unit the AI narrates around and the
 * unit the validator cross-checks `points_of_entry` against.
 */
export const locationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  /** How a PC reaches the location. */
  points_of_entry: z.array(pointOfEntrySchema).default([]),
  /** Location-scoped DC checks (Investigation in here, etc.). */
  dc_checks: z.array(dcCheckSchema).default([]),
  /**
   * Items in the location. Strings are inert dressing; objects carry
   * structured metadata (id + name + free-form `properties`) for
   * mechanically active items the runtime needs to track.
   */
  items: z.array(itemEntrySchema).default([]),
  /**
   * Foreign-keyed to NPCs in `scene.npcs[].id` or
   * `manifest.shared_npcs[].id` — the validator resolves against either
   * pool. Failures only when the id is in *neither*.
   */
  npcs_present: z.array(z.string()).default([]),
})

export type Location = z.infer<typeof locationSchema>

// -- NPC stat block --------------------------------------------------------

const abilitiesSchema = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
})

const npcWeaponSchema = z.object({
  name: z.string().min(1),
  to_hit: z.number().int(),
  /** Damage expression: e.g. `"1d6+2 piercing"`. */
  damage: z.string().min(1),
  /** Range expression: e.g. `"5"` (melee) or `"80/320"` (ranged). */
  range: z.string().optional(),
})

const npcSpellSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(0).max(9),
  uses_per_day: z.number().int().optional(),
  /** Free-text effect summary; the model reads this rather than re-deriving. */
  effect: z.string().min(1),
})

/**
 * NPC stat block — OGL-shaped. Every numeric is required; descriptive
 * fields (spells, treasure) are optional. v1 deliberately keeps the
 * structure shallow — Sprint 4.7 will surface fields we missed.
 */
export const npcStatBlockSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /**
   * Descriptive label — e.g. `"goblin scout"`, `"Lookout"`,
   * `"Mill kidnapper guard"`. Pre-Sprint-4.7 modules folded class+level
   * into this field as prose ("Bandit (level 2) — the Lookout"); the
   * dedicated `level` and `class` fields below carry that data
   * structurally going forward, leaving `role` for the human label.
   */
  role: z.string().min(1),
  /**
   * 5e character level. Optional because not every stat block has a
   * meaningful level (commoners, generic guards). When present, the
   * runtime can compute proficiency bonus etc. without parsing prose.
   */
  level: z.number().int().min(0).max(20).optional(),
  /**
   * 5e class name (e.g. `"Bandit"`, `"Bard"`). Optional for the same
   * reason as `level`. Free-text for v1; modules may use SRD class names
   * or homebrew labels.
   */
  class: z.string().min(1).optional(),
  alignment: z.string().optional(),
  hp: z.number().int().min(0),
  max_hp: z.number().int().min(0),
  ac: z.number().int().min(0),
  init_bonus: z.number().int(),
  speed: z.number().int().min(0),
  /** Free-text armour description (e.g. "leather + shield"). */
  ac_proficiency: z.string().optional(),
  weapons: z.array(npcWeaponSchema).default([]),
  abilities: abilitiesSchema,
  /** Skill name → modifier (e.g. `{ stealth: +6 }`). */
  skills: z.record(z.string(), z.number().int()).default({}),
  passive_perception: z.number().int().optional(),
  spells: z.array(npcSpellSchema).optional(),
  /** What the NPC does in combat. Plain prose. */
  tactics: z.string().min(1),
  /** Voice / disposition cues for the AI to act in character. */
  roleplay_notes: z.string().min(1),
  /** Loot dropped on defeat / pickpocket. */
  treasure: z.string().optional(),
})

export type NPCStatBlock = z.infer<typeof npcStatBlockSchema>

// -- Plot points + encounters ---------------------------------------------

/**
 * A mandatory or optional beat the AI is supposed to drive toward. Plot
 * points are how the module says "this is the engine of the scene; do not
 * end without it firing."
 */
export const plotPointSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  mandatory: z.boolean(),
  /**
   * Free-text trigger condition the AI uses to decide if the point has
   * fired. The AI signals fire by emitting a `state_change` whose `field`
   * matches the dotted path the runtime watches.
   */
  completed_when: z.string().min(1),
  /**
   * Optional dotted path on `game_state.state` that flips to `true` when
   * the point fires (e.g. `"plot.guard_bypassed"`). Used by the validator
   * to cross-check against `apply-state-changes.ts` field routing.
   */
  status_field: z.string().optional(),
})

export type PlotPoint = z.infer<typeof plotPointSchema>

/**
 * A scripted combat or skill challenge. The `rounds` array is for modules
 * that scripted out round-by-round behaviour (Blackthorn does this for
 * its big set-pieces). Free-form for v1 — Sprint 4.7 may tighten it.
 */
export const encounterSchema = z.object({
  id: z.string().min(1),
  trigger: z.string().min(1),
  participants: z.array(z.string()).default([]),
  rounds: z
    .array(
      z.object({
        round: z.number().int().min(1),
        events: z.array(z.string()).default([]),
      })
    )
    .optional(),
})

export type Encounter = z.infer<typeof encounterSchema>

/**
 * A d4 / d6 random encounter table — Blackthorn uses these between
 * scenarios. Marked optional in v1; future modules may need it inline.
 */
export const travelEncounterSchema = z.object({
  id: z.string().min(1),
  /** Dice expression triggering this entry, e.g. `"d4=1"`. */
  roll: z.string().min(1),
  description: z.string().min(1),
  /** Optional encounter id this leads into. */
  encounter_id: z.string().optional(),
})

export type TravelEncounter = z.infer<typeof travelEncounterSchema>

// -- Romance hooks ---------------------------------------------------------

/**
 * Romance content the scene exposes. v1 fields are stubs — Sprint 4.7
 * (real Blackthorn ingestion) will pressure-test these. Mark fields
 * aggressively optional; promote to required only with a v2 migration.
 *
 * Privacy: see DECISIONS.md 2026-04-30 "Romance subsystem schema". The
 * AP value itself is hidden; bands map to narrative colouring only.
 */
export const romanceHookSchema = z.object({
  id: z.string().min(1),
  /**
   * `turn_on` / `pet_peeve` triggers that pattern-match against the
   * partner's per-character romance row. The AI raises/lowers AP when a
   * trigger fires. Free-text in v1.
   */
  trigger: z.string().min(1),
  /**
   * `hand_hold | hug | kiss | ...` — first-intimacy unlock the hook can
   * gate. Optional; many hooks just shift AP.
   */
  unlocks_intimacy: z.string().optional(),
  /**
   * AP delta the hook applies on fire. Hidden from UI per the
   * tolerance_threshold precedent.
   */
  ap_delta: z.number().int().optional(),
  /** What the AI narrates when the hook fires. */
  narration_cue: z.string().optional(),
})

export type RomanceHook = z.infer<typeof romanceHookSchema>

// -- Exits -----------------------------------------------------------------

export const sceneExitConditionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  /**
   * Optional id of the next scene. If absent, the scene ends without
   * transition (e.g. session paused; module complete).
   */
  leads_to_scene_id: z.string().optional(),
  /**
   * Free-text trigger expression; the AI emits `scene_transition` on
   * the response when it judges the trigger to have fired.
   */
  trigger: z.string().optional(),
})

export type SceneExitCondition = z.infer<typeof sceneExitConditionSchema>

// ---------------------------------------------------------------------------
// Scene context — the top-level shape for one scene file
// ---------------------------------------------------------------------------

export const sceneContextSchema = z.object({
  schema_version: z.literal(SCENE_CONTEXT_SCHEMA_VERSION),
  /** Globally-unique within a module. Matches the file basename by convention. */
  scene_id: z.string().min(1),
  /** Display name used by the host UI. */
  name: z.string().min(1),
  /** Optional scenario ordering, mirrors the manifest entry. */
  ordering: z.number().int().min(1).optional(),
  /**
   * Out-of-character DM prep notes — handout removal, props, mood. NEVER
   * read aloud; the module-runner header reminds the model of this.
   */
  dm_setup_notes: z.string().optional(),
  /** One-paragraph summary the AI uses when summarising the scene. */
  overview: z.string().optional(),
  /**
   * Narration beats. v1 supports stitching all beats into one paragraph
   * for the existing typewriter; POL-12 will render per-beat. Authors
   * MUST supply at least one `read_aloud` beat for the scene-open.
   */
  narration_beats: z.array(narrationBeatSchema).min(1),
  plot_points: z.array(plotPointSchema).default([]),
  locations: z.array(locationSchema).default([]),
  npcs: z.array(npcStatBlockSchema).default([]),
  /**
   * Scene-level DCs not bound to a specific location (e.g. a dimensional
   * Perception check that applies room-wide).
   */
  dc_checks_glossary: z.array(dcCheckSchema).optional(),
  encounters: z.array(encounterSchema).optional(),
  travel_encounters: z.array(travelEncounterSchema).optional(),
  romance_hooks: z.array(romanceHookSchema).optional(),
  /** How the scene ends. At least one entry is recommended but not enforced. */
  scene_exit_conditions: z.array(sceneExitConditionSchema).default([]),
})

export type SceneContext = z.infer<typeof sceneContextSchema>

/**
 * Strict parser. Throws a Zod error formatted with file location info if
 * the caller passes one. Use this on every load — silent typos are
 * exactly what the schema is here to prevent.
 */
export function parseSceneContext(raw: unknown, source?: string): SceneContext {
  const result = sceneContextSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((iss) => `  • [${iss.path.join('.')}] ${iss.message}`)
      .join('\n')
    const where = source ? ` (in ${source})` : ''
    throw new Error(`scene-context validation failed${where}:\n${issues}`)
  }
  return result.data
}

// ---------------------------------------------------------------------------
// Manifest — `lib/adventures/<module-id>/manifest.json`
// ---------------------------------------------------------------------------

export const manifestScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** 1-based ordering; manifests typically list scenarios in play order. */
  ordering: z.number().int().min(1),
  /** The scene the runtime loads first when this scenario starts. */
  first_scene_id: z.string().min(1),
})

export type ManifestScenario = z.infer<typeof manifestScenarioSchema>

export const manifestSchema = z.object({
  schema_version: z.literal(SCENE_CONTEXT_SCHEMA_VERSION),
  module_id: z.string().min(1),
  name: z.string().min(1),
  /**
   * Free-text attribution string. e.g. `"© Urban Realms, Date Night
   * Dungeons #1"`. Used in About/Credits surfaces; not load-bearing for
   * the runtime.
   */
  source_attribution: z.string().optional(),
  scenarios: z.array(manifestScenarioSchema).min(1),
  expected_pcs: z.object({
    min: z.number().int().min(1),
    max: z.number().int().min(1),
  }),
  /** Highest rating this module is rated for. Per-PC dial floors below. */
  content_rating_cap: z.enum(['G', 'PG', 'PG-13', 'R', 'NC-17']),
  /**
   * Whether this module's romance subsystem should be exposed. False
   * means the romance code path is a no-op pass-through for the module.
   */
  supports_date_night: z.boolean().default(false),
  /**
   * Module-level NPC pool. NPCs that appear across multiple scenes
   * (e.g. Harold the Lookout in Blackthorn Parts 1 and 2) live here so
   * their stat block lives once and scenes reference by id from
   * `location.npcs_present[]`. The validator resolves those refs against
   * either `scene.npcs[]` or `manifest.shared_npcs[]`.
   *
   * Optional and additive in v1 — modules without cross-scene NPCs leave
   * it absent.
   */
  shared_npcs: z.array(npcStatBlockSchema).optional(),
})

export type Manifest = z.infer<typeof manifestSchema>

export function parseManifest(raw: unknown, source?: string): Manifest {
  const result = manifestSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((iss) => `  • [${iss.path.join('.')}] ${iss.message}`)
      .join('\n')
    const where = source ? ` (in ${source})` : ''
    throw new Error(`manifest validation failed${where}:\n${issues}`)
  }
  return result.data
}
