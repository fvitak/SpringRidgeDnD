-- =============================================================================
-- Migration: 20260430000002_add_briar_token.sql
-- Adds Briar (Tarric's wolf companion) to the Old Mill scene.
--
-- Two changes:
--   1. Appends Briar to scenes.default_tokens so future resets include him.
--   2. Appends Briar to any existing game_state.tokens rows that have the Old
--      Mill scene active but don't yet have a "briar" token.
-- =============================================================================

-- 1. Update default_tokens in the scene definition.
UPDATE scenes
SET default_tokens = default_tokens || jsonb_build_array(
  jsonb_build_object(
    'id',         'briar',
    'kind',       'npc',
    'name',       'Briar',
    'image_path', null,
    'x',          7,
    'y',          12,
    'size',       1,
    'hp',         11,
    'max_hp',     11,
    'conditions', '[]'::jsonb,
    'is_friendly', true,
    'color',      '#6B8E4E',
    'stats', jsonb_build_object(
      'ac', 13,
      'speed_squares', 8,
      'attacks', jsonb_build_array(
        jsonb_build_object('name','Bite','bonus',4,'damage','2d6+2')
      )
    )
  )
)
WHERE id = 'blackthorn.s1.old-mill'
  AND NOT (default_tokens @> '[{"id":"briar"}]');

-- 2. Patch live game_state rows for this scene that are missing Briar.
UPDATE game_state
SET tokens = tokens || jsonb_build_array(
  jsonb_build_object(
    'id',          'briar',
    'kind',        'npc',
    'name',        'Briar',
    'image_path',  null,
    'x',           7,
    'y',           12,
    'size',        1,
    'hp',          11,
    'max_hp',      11,
    'conditions',  '[]'::jsonb,
    'is_friendly', true,
    'color',       '#6B8E4E',
    'character_id', null,
    'placed',      false,
    'stats', jsonb_build_object(
      'ac', 13,
      'speed_squares', 8,
      'attacks', jsonb_build_array(
        jsonb_build_object('name','Bite','bonus',4,'damage','2d6+2')
      )
    )
  )
)
WHERE current_scene_id = 'blackthorn.s1.old-mill'
  AND NOT (tokens @> '[{"id":"briar"}]');
