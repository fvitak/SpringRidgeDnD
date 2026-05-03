-- =============================================================================
-- Migration: 20260501000001_pcs_discovered_by_default.sql
-- Theme:     DATA — PCs are discovered by default; no AI gating required
-- Created:   2026-05-01
--
-- Background: the Old Mill seed (20260429000002) defaulted Wynn and Briar to
-- `discovered: false` so the AI's opening narration would "introduce" them.
-- In playtest this turned out to block PC placement entirely — the player
-- can't place Wynn's token until the AI flips her flag, but that flip
-- depends on the opening turn firing cleanly. Wynn and Briar are
-- player-controlled tokens; their placement is scene-setting context, not
-- a player-earned discovery. They should be `discovered: true` from the
-- start. The "Wynn revealed in opening narration" beat is narrative
-- flavour, not a structural gate.
--
-- Tarric is already `discovered: true` in the seed; this migration brings
-- Wynn and Briar in line. Hostile NPC tokens (`lookout`, `ruffian_*`) keep
-- their `discovered: false` default — those reveal in narration, gated by
-- the AI per the TOKEN DISCOVERY rule in the module-runner header.
--
-- Two changes, both additive (no schema change):
--   1. Patch the canonical seed (`scenes.default_tokens`) so future scene
--      resets get the right defaults.
--   2. Backfill any in-flight session whose tokens still carry
--      `discovered: false` for Wynn / Briar — sessions joined to the
--      Blackthorn scenario only.
--
-- Idempotent: re-running leaves correctly-flagged tokens unchanged.
-- =============================================================================

-- 1. Patch the canonical scene definition for the Old Mill.
--    For each token in default_tokens, if its id is `wynn` or `briar`,
--    set discovered=true; otherwise leave the entry untouched.
UPDATE scenes
SET default_tokens = (
  SELECT jsonb_agg(
    CASE
      WHEN (t->>'id') IN ('wynn', 'briar')
        THEN jsonb_set(t, '{discovered}', 'true'::jsonb)
      ELSE t
    END
  )
  FROM jsonb_array_elements(default_tokens) AS t
)
WHERE id = 'blackthorn.s1.old-mill'
  AND default_tokens IS NOT NULL
  AND jsonb_array_length(default_tokens) > 0;

-- 2. Backfill live game_state.tokens for sessions joined to the Blackthorn
--    scenario. Match by sessions.scenario_id = 'blackthorn-clan' (the
--    scenario id, which is what `scenes.scenario_id` carries in the seed).
--    Only flip wynn / briar entries that are currently false; leave any
--    correct entries alone.
UPDATE game_state
SET tokens = (
  SELECT jsonb_agg(
    CASE
      WHEN (t->>'id') IN ('wynn', 'briar')
        THEN jsonb_set(t, '{discovered}', 'true'::jsonb)
      ELSE t
    END
  )
  FROM jsonb_array_elements(tokens) AS t
)
WHERE session_id IN (
  SELECT id FROM sessions WHERE scenario_id = 'blackthorn-clan'
)
AND tokens IS NOT NULL
AND jsonb_array_length(tokens) > 0;
