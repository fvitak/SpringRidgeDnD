import { z } from "zod";

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const actionRequiredSchema = z.object({
  type: z.enum(["roll", "choice", "confirm"]),
  player: z.string().optional(),
  description: z.string(),
});

const stateChangeSchema = z.object({
  entity: z.string(),
  field: z.union([
    z.enum(["hp", "condition", "inventory", "position", "spell_slots"]),
    z.string(), // fallback for extensibility
  ]),
  value: z.unknown(),
});

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
  // Step 1 – extract JSON from optional markdown code fences.
  // Matches ```json ... ``` or ``` ... ``` (with optional language tag).
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  // Step 2 – parse JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `DM response is not valid JSON.\n` +
        `Parse error: ${(err as Error).message}\n` +
        `Raw input (first 500 chars): ${raw.slice(0, 500)}`
    );
  }

  // Step 3 – validate against the Zod schema.
  const result = dmResponseSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • [${issue.path.join(".")}] ${issue.message}`)
      .join("\n");
    throw new Error(
      `DM response failed schema validation:\n${issues}\n` +
        `Raw input (first 500 chars): ${raw.slice(0, 500)}`
    );
  }

  return result.data;
}
