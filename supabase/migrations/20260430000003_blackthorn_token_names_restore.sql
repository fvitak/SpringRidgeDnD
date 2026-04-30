-- =============================================================================
-- Migration: 20260430000003_blackthorn_token_names_restore.sql
-- Theme:     DATA — Restore distinguishing display names for Old Mill tokens
-- Created:   2026-04-30
--
-- The landscape migration (20260429000002) flattened the hostile token names
-- in the Old Mill scene to plain "Lookout" and three identical "Ruffian"
-- entries. The system prompt + UI rely on the more descriptive seed names
-- (e.g. "Harold (Lookout)", "Ruffian (cards)", "Ruffian (dozing)") so players
-- can tell tokens apart in the sidebar and so DM narration can refer to them
-- by recognisable handles.
--
-- Note: state_change `entity` matching now uses token IDs (which are unique
-- and stable). Display names are restored purely for UI legibility — the
-- prompt no longer relies on them as state-change keys.
--
-- This migration is idempotent: re-running it leaves the data unchanged.
-- =============================================================================

-- 1. Patch the canonical scene definition (scenes.default_tokens).
--    Match by token id; rewrite only the `name` field, preserve every other
--    field as-is.
UPDATE scenes
SET default_tokens = (
  SELECT jsonb_agg(
    CASE
      WHEN (t->>'id') = 'lookout'    THEN jsonb_set(t, '{name}', '"Harold (Lookout)"'::jsonb)
      WHEN (t->>'id') = 'ruffian_1'  THEN jsonb_set(t, '{name}', '"Ruffian (cards)"'::jsonb)
      WHEN (t->>'id') = 'ruffian_2'  THEN jsonb_set(t, '{name}', '"Ruffian (cards)"'::jsonb)
      WHEN (t->>'id') = 'ruffian_3'  THEN jsonb_set(t, '{name}', '"Ruffian (dozing)"'::jsonb)
      ELSE t
    END
  )
  FROM jsonb_array_elements(default_tokens) AS t
)
WHERE id = 'blackthorn.s1.old-mill'
  AND default_tokens IS NOT NULL
  AND jsonb_array_length(default_tokens) > 0;

-- 2. Patch any in-flight session whose live tokens still carry the flat
--    names. Match by token id within the JSONB array. Same pattern as above
--    but applied to game_state.tokens for each row currently in the Old Mill
--    scene.
UPDATE game_state
SET tokens = (
  SELECT jsonb_agg(
    CASE
      WHEN (t->>'id') = 'lookout'    THEN jsonb_set(t, '{name}', '"Harold (Lookout)"'::jsonb)
      WHEN (t->>'id') = 'ruffian_1'  THEN jsonb_set(t, '{name}', '"Ruffian (cards)"'::jsonb)
      WHEN (t->>'id') = 'ruffian_2'  THEN jsonb_set(t, '{name}', '"Ruffian (cards)"'::jsonb)
      WHEN (t->>'id') = 'ruffian_3'  THEN jsonb_set(t, '{name}', '"Ruffian (dozing)"'::jsonb)
      ELSE t
    END
  )
  FROM jsonb_array_elements(tokens) AS t
)
WHERE current_scene_id = 'blackthorn.s1.old-mill'
  AND tokens IS NOT NULL
  AND jsonb_array_length(tokens) > 0;
