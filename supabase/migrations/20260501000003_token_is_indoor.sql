-- =============================================================================
-- Migration: 20260501000003_token_is_indoor.sql
-- Theme:     DATA — Per-token indoor/outdoor flag for visual disambiguation
-- Created:   2026-05-01
--
-- Background: top-down maps draw the roof on the same plane as the floor below
-- it. In the Old Mill playtest, ruffian tokens placed inside Room 2 read as
-- "up there with Harold (the lookout)" because the chip overlaps the roof art
-- visually. The fix is the simplest viable solution: a per-token boolean
-- `is_indoor` flag. Tokens flagged indoor render at reduced opacity so the
-- eye reads them as "behind the building's walls/roof"; outdoor tokens (and
-- Harold up on the roof) render at full opacity.
--
-- Old Mill defaults:
--   is_indoor = true:  wynn, ruffian_1, ruffian_2, ruffian_3
--   is_indoor = false: tarric, briar, lookout
--
-- The full layered system (named map layers per floor) is filed for the
-- Manor scenario where multi-story rooms appear; for v1 binary inside/
-- outside is enough.
--
-- Two changes, both additive (no schema change):
--   1. Patch the canonical seed (`scenes.default_tokens`) so future scene
--      resets get the right defaults.
--   2. Backfill any in-flight session that already has the Old Mill scene
--      active. Match by token id within the JSONB array.
--
-- Idempotent: re-running leaves correctly-flagged tokens unchanged because
-- jsonb_set replaces the same value with itself.
-- =============================================================================

-- 1. Patch the canonical scene definition.
UPDATE scenes
SET default_tokens = (
  SELECT jsonb_agg(
    CASE
      WHEN (t->>'id') IN ('wynn', 'ruffian_1', 'ruffian_2', 'ruffian_3')
        THEN jsonb_set(t, '{is_indoor}', 'true'::jsonb)
      WHEN (t->>'id') IN ('tarric', 'briar', 'lookout')
        THEN jsonb_set(t, '{is_indoor}', 'false'::jsonb)
      ELSE t
    END
  )
  FROM jsonb_array_elements(default_tokens) AS t
)
WHERE id = 'blackthorn.s1.old-mill'
  AND default_tokens IS NOT NULL
  AND jsonb_array_length(default_tokens) > 0;

-- 2. Backfill live game_state.tokens for sessions in the Old Mill scene.
--    Same id-based mapping. Apply to any row whose current_scene_id matches,
--    so re-runs after reseat/replay all stay in sync.
UPDATE game_state
SET tokens = (
  SELECT jsonb_agg(
    CASE
      WHEN (t->>'id') IN ('wynn', 'ruffian_1', 'ruffian_2', 'ruffian_3')
        THEN jsonb_set(t, '{is_indoor}', 'true'::jsonb)
      WHEN (t->>'id') IN ('tarric', 'briar', 'lookout')
        THEN jsonb_set(t, '{is_indoor}', 'false'::jsonb)
      ELSE t
    END
  )
  FROM jsonb_array_elements(tokens) AS t
)
WHERE current_scene_id = 'blackthorn.s1.old-mill'
  AND tokens IS NOT NULL
  AND jsonb_array_length(tokens) > 0;
