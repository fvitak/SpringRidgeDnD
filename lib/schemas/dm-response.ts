import { z } from "zod";

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const actionRequiredSchema = z.object({
  // 'move' added 2026-04-29 — lets the DM ask a specific player to move their
  // token at the host screen without forcing a free-text follow-up.
  type: z.enum(["roll", "choice", "confirm", "move"]),
  player: z.string().optional(),
  description: z.string(),
});

/**
 * Position values are polymorphic:
 *   - string  → free-text narrative position ("at the riverbank, 30 ft from party")
 *   - object  → structured grid coordinates for the active scene
 *
 * apply-state-changes.ts dispatches based on the runtime shape: strings go to
 * `characters.position`; objects go to `game_state.tokens`.
 */
const structuredPositionSchema = z.object({
  scene_id: z.string().optional(),
  token_id: z.string().optional(),
  x: z.number().int(),
  y: z.number().int(),
}).passthrough();

const positionValueSchema = z.union([
  z.string(),
  structuredPositionSchema,
]);

const stateChangeSchema = z.object({
  entity: z.string(),
  field: z.union([
    z.enum([
      "hp", "condition", "inventory", "position", "spell_slots", "drinks_consumed",
      "current_scene_id", "tokens",
    ]),
    z.string(), // fallback for extensibility
  ]),
  value: z.unknown(),
});

// Validates a position state-change value at apply time (not at parse time).
// Returns true when the value is in a shape apply-state-changes.ts can handle.
export function isValidPositionValue(value: unknown): boolean {
  return positionValueSchema.safeParse(value).success;
}

const dmRollSchema = z.object({
  purpose: z.string(),
  result: z.number(),
});

const initiativeEntrySchema = z.object({
  name: z.string(),
  initiative: z.number(),
  hp: z.number(),
  max_hp: z.number(),
  is_player: z.boolean(),
  conditions: z.array(z.string()).optional(),
});

const combatStateSchema = z.object({
  active: z.boolean(),
  round: z.number().optional(),
  initiative: z.array(initiativeEntrySchema).optional(),
});

// ---------------------------------------------------------------------------
// Root schema
// ---------------------------------------------------------------------------

export const dmResponseSchema = z.object({
  narration: z.string().min(1),
  actions_required: z.array(actionRequiredSchema).default([]),
  state_changes: z.array(stateChangeSchema).default([]),
  dm_rolls: z.array(dmRollSchema).default([]),
  combat_state: combatStateSchema.optional(),
  scene_suggestions: z.array(z.string()).max(3).optional().default([]),
  pending_roll: z.object({
    player: z.string(),
    type: z.string(),
    dc: z.number().optional(),
    description: z.string().optional(),
  }).optional(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript type
// ---------------------------------------------------------------------------

export type DMResponse = z.infer<typeof dmResponseSchema>;

// ---------------------------------------------------------------------------
// Helper — parse a raw AI response string into a validated DMResponse
// ---------------------------------------------------------------------------

/**
 * Parses and validates a raw string returned by the AI Dungeon Master.
 *
 * Handles two common formats:
 *   1. A bare JSON string.
 *   2. A JSON block wrapped in markdown code fences (```json ... ``` or ``` ... ```).
 *
 * Throws a descriptive Error if JSON parsing fails or if the parsed value does
 * not satisfy `dmResponseSchema`.
 */
export function parseDMResponse(raw: string): DMResponse {
  // Step 1 – extract JSON from optional markdown code fences, or grab the
  //         outermost {...} block if the AI wrapped JSON in prose.
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let jsonText = fenceMatch ? fenceMatch[1].trim() : raw.trim();
  if (!jsonText.startsWith("{")) {
    // Grab the largest balanced JSON object substring.
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) jsonText = raw.slice(first, last + 1);
  }

  // Step 2 – parse JSON. If JSON is unrecoverable, fall back to a narration-only
  //         response so the turn still produces something playable.
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.warn("[parseDMResponse] JSON parse failed; falling back. Raw:", raw.slice(0, 500), err);
    return synthesizeRecovery(raw);
  }

  // Step 3 – validate against the Zod schema. On structural failure, log the
  //         issues and try to extract narration anyway. We never throw — we
  //         degrade gracefully so the player isn't stuck.
  const result = dmResponseSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • [${issue.path.join(".")}] ${issue.message}`)
      .join("\n");
    console.warn(`[parseDMResponse] Schema validation failed:\n${issues}\nRaw (first 500): ${raw.slice(0, 500)}`);
    // Try to salvage narration from the (malformed) parsed object.
    const narration = extractNarrationFallback(parsed) ?? "(The Narrator pauses — pick up where you left off.)";
    return {
      narration,
      actions_required: [],
      state_changes: [],
      dm_rolls: [],
      scene_suggestions: [],
    } as DMResponse;
  }

  return result.data;
}

// Best-effort extraction of a narration field even if other fields are malformed.
function extractNarrationFallback(parsed: unknown): string | null {
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.narration === "string" && obj.narration.trim().length > 0) {
      return obj.narration;
    }
  }
  return null;
}

// When JSON parsing fails entirely, hand back the raw text as narration so the
// turn isn't lost. The Narrator's voice stays intact even if the structure
// breaks.
function synthesizeRecovery(raw: string): DMResponse {
  const trimmed = raw.trim();
  // If the AI returned plain prose, use it as narration directly.
  const looksLikeProse =
    trimmed.length > 0 &&
    !trimmed.includes("\"narration\"") &&
    !trimmed.startsWith("{");
  const narration = looksLikeProse
    ? trimmed
    : "(The Narrator stumbles for a moment. Try the action again.)";
  return {
    narration,
    actions_required: [],
    state_changes: [],
    dm_rolls: [],
    scene_suggestions: [],
  } as DMResponse;
}
