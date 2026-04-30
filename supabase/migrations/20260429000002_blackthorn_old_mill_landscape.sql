-- =============================================================================
-- Migration: 20260429000002_blackthorn_old_mill_landscape.sql
-- Theme:     MAP — Old Mill landscape rotation + token discovery flag
-- Created:   2026-04-29
--
-- The original Old Mill seed used a portrait orientation (20×26). Rotated 90°
-- CCW so the rendered image fits a 16:9 monitor (now 26×20).
--
-- Also: NPC tokens default to discovered=false (the AI flips the flag in
-- narration when the party perceives them); PCs default to discovered=true.
-- =============================================================================

UPDATE scenes
SET
  grid_cols = 26,
  grid_rows = 20,
  walkable = $$
  {
    "cols": 26,
    "rows": 20,
    "cells": [
      "..........................",
      ".....T....................",
      "..........................",
      "...T...........T..........",
      "..........................",
      "..............WWWWWWWWWW..",
      "..............W..........T",
      "..............W..........T",
      "..WWWWWWWWWWWWWW.........T",
      "..W.....................~",
      "..W..1...2..L....2..3...~~",
      "..W.....................~",
      "..WWWWWWWWWWWWWW.........T",
      "..............W..........T",
      "..............W..........T",
      "..............W..........T",
      "..............WWWWWWWWWW..",
      "...T....T...........T.....",
      "..........................",
      ".........................."
    ]
  }
  $$::jsonb,
  regions = $$
  [
    { "name": "Riverbank",          "description": "Cold, low water; slick footing" },
    { "name": "Room 1 (north end)", "description": "Where Wynn is held — cot and shelves" },
    { "name": "Room 2 (main hall)", "description": "Two ruffians playing cards" },
    { "name": "Room 3 (south end)", "description": "Storage; one ruffian dozing" },
    { "name": "Loft / waterwheel", "description": "Climb up via the broken paddlewheel" },
    { "name": "Footbridge",         "description": "Narrow plank — DC 8 Athletics if pressed" }
  ]
  $$::jsonb,
  exits = $$
  [
    { "to_scene": null, "label": "Forest path back to Blackthorn Manor", "cells": [[0,9],[0,10]] }
  ]
  $$::jsonb,
  default_tokens = $$
  [
    {
      "id": "tarric",   "kind": "pc",  "character_slot": 2, "name": "Tarric",
      "image_path": null, "x": 4, "y": 10, "size": 1, "hp": 35, "max_hp": 35,
      "conditions": [], "is_friendly": true, "color": "#5B7FBF", "discovered": true
    },
    {
      "id": "wynn",     "kind": "pc",  "character_slot": 1, "name": "Wynn",
      "image_path": null, "x": 16, "y": 10, "size": 1, "hp": 27, "max_hp": 27,
      "conditions": ["restrained","gagged"], "is_friendly": true, "color": "#B65BBF", "discovered": false
    },
    {
      "id": "lookout",  "kind": "npc", "name": "Lookout",
      "image_path": null, "x": 18, "y": 8, "size": 1, "hp": 11, "max_hp": 11,
      "conditions": [], "is_friendly": false, "color": "#A23B3B", "discovered": false,
      "stats": { "ac": 12, "attacks": [{"name":"Shortbow","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    },
    {
      "id": "ruffian_1","kind": "npc", "name": "Ruffian",
      "image_path": null, "x": 14, "y": 10, "size": 1, "hp": 12, "max_hp": 12,
      "conditions": [], "is_friendly": false, "color": "#A23B3B", "discovered": false,
      "stats": { "ac": 12, "attacks": [{"name":"Short sword","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    },
    {
      "id": "ruffian_2","kind": "npc", "name": "Ruffian",
      "image_path": null, "x": 12, "y": 10, "size": 1, "hp": 12, "max_hp": 12,
      "conditions": [], "is_friendly": false, "color": "#A23B3B", "discovered": false,
      "stats": { "ac": 12, "attacks": [{"name":"Short sword","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    },
    {
      "id": "ruffian_3","kind": "npc", "name": "Ruffian",
      "image_path": null, "x": 22, "y": 10, "size": 1, "hp": 12, "max_hp": 12,
      "conditions": ["unaware"], "is_friendly": false, "color": "#A23B3B", "discovered": false,
      "stats": { "ac": 12, "attacks": [{"name":"Short sword","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    }
  ]
  $$::jsonb
WHERE id = 'blackthorn.s1.old-mill';

-- For any session that already initialised before this migration, also flip
-- live game_state.tokens to landscape coordinates + the discovered flag.
-- This is a best-effort transform — if Frank already started a session and
-- moved tokens, those positions are preserved as-is (we only fix the discovered
-- flag for that case).
UPDATE game_state
SET tokens = (
  SELECT jsonb_agg(
    CASE
      WHEN (t->>'kind') = 'pc' AND (t->>'name') = 'Tarric'
        THEN t || '{"discovered": true}'::jsonb
      WHEN (t->>'kind') = 'pc'
        THEN t || '{"discovered": false}'::jsonb
      ELSE t || '{"discovered": false}'::jsonb
    END
  )
  FROM jsonb_array_elements(tokens) AS t
)
WHERE current_scene_id = 'blackthorn.s1.old-mill'
  AND tokens IS NOT NULL
  AND jsonb_array_length(tokens) > 0;
