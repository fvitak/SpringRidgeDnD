-- =============================================================================
-- Migration: 20260429000003_revert_portrait.sql
-- Theme:     MAP — Revert Old Mill to portrait orientation (20×26)
-- Created:   2026-04-29
--
-- Migration 000002 rotated the grid to landscape (26×20) to "fit a 16:9
-- monitor" but forgot to rotate the actual PNG — object-cover then crops the
-- top and bottom of the portrait image, hiding the full exterior.
-- This migration restores the original portrait layout (20 cols × 26 rows)
-- that matches the old-mill.png image orientation.
-- =============================================================================

UPDATE scenes
SET
  grid_cols = 20,
  grid_rows  = 26,
  cell_px    = 77,
  walkable   = $$
  {
    "cols": 20,
    "rows": 26,
    "cells": [
      "....................",
      "..T.................",
      "....................",
      ".......T............",
      "....................",
      "....TT......WWWWW...",
      "..........WWW...W..~",
      "..........W.....W.~~",
      "..........W.....W.~~",
      "..........W.....W.~~",
      "..........WW.>.WW.~~",
      "..........W.....W~~~",
      "..........W.....W~~~",
      "..........W.....W~>~",
      "..........W.....W~>~",
      "..........W.....W~~~",
      "..........W.....W~~~",
      "..........W.....W~~~",
      "..........WW.>.WW.~~",
      "..........W.....W.~~",
      "..........W.....W.~~",
      "..........W.....W.~~",
      "..........WWWWWWW.~~",
      "....................",
      ".....T.....T........",
      "...................."
    ]
  }
  $$::jsonb,
  regions    = $$
  [
    { "name": "Riverbank",          "description": "Cold, low water; slick footing" },
    { "name": "Room 1 (north)",     "description": "Where Wynn is held — cot and shelves" },
    { "name": "Room 2 (main hall)", "description": "Two ruffians playing cards" },
    { "name": "Room 3 (south)",     "description": "Mostly storage; one ruffian dozing" },
    { "name": "Loft / waterwheel",  "description": "Climb up via the broken paddlewheel" },
    { "name": "Footbridge",         "description": "Narrow plank — DC 8 Athletics if pressed" }
  ]
  $$::jsonb,
  exits      = $$
  [
    { "to_scene": null, "label": "Forest path back to Blackthorn Manor", "cells": [[0,12],[0,13]] }
  ]
  $$::jsonb,
  default_tokens = $$
  [
    {
      "id": "tarric",   "kind": "pc",  "character_slot": 2, "name": "Tarric",
      "image_path": null, "x": 7, "y": 11, "size": 1, "hp": 35, "max_hp": 35,
      "conditions": [], "is_friendly": true, "color": "#5B7FBF", "discovered": true
    },
    {
      "id": "wynn",     "kind": "pc",  "character_slot": 1, "name": "Wynn",
      "image_path": null, "x": 14, "y": 8, "size": 1, "hp": 27, "max_hp": 27,
      "conditions": ["restrained","gagged"], "is_friendly": true, "color": "#B65BBF", "discovered": false
    },
    {
      "id": "lookout",  "kind": "npc", "name": "Lookout",
      "image_path": null, "x": 14, "y": 13, "size": 1, "hp": 11, "max_hp": 11,
      "conditions": [], "is_friendly": false, "color": "#A23B3B", "discovered": false,
      "stats": { "ac": 12, "attacks": [{"name":"Shortbow","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    },
    {
      "id": "ruffian_1","kind": "npc", "name": "Ruffian",
      "image_path": null, "x": 13, "y": 16, "size": 1, "hp": 12, "max_hp": 12,
      "conditions": [], "is_friendly": false, "color": "#A23B3B", "discovered": false,
      "stats": { "ac": 12, "attacks": [{"name":"Short sword","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    },
    {
      "id": "ruffian_2","kind": "npc", "name": "Ruffian",
      "image_path": null, "x": 15, "y": 16, "size": 1, "hp": 12, "max_hp": 12,
      "conditions": [], "is_friendly": false, "color": "#A23B3B", "discovered": false,
      "stats": { "ac": 12, "attacks": [{"name":"Short sword","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    },
    {
      "id": "ruffian_3","kind": "npc", "name": "Ruffian",
      "image_path": null, "x": 14, "y": 20, "size": 1, "hp": 12, "max_hp": 12,
      "conditions": ["unaware"], "is_friendly": false, "color": "#A23B3B", "discovered": false,
      "stats": { "ac": 12, "attacks": [{"name":"Short sword","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    }
  ]
  $$::jsonb
WHERE id = 'blackthorn.s1.old-mill';

-- Reset live game_state token positions to portrait coordinates.
-- Uses jsonb merge (||) to update only x/y so HP, conditions, and
-- discovered flags from any prior play session are preserved.
UPDATE game_state
SET tokens = (
  SELECT jsonb_agg(
    CASE
      WHEN t->>'id' = 'tarric'    THEN t || '{"x":7,"y":11}'::jsonb
      WHEN t->>'id' = 'wynn'      THEN t || '{"x":14,"y":8}'::jsonb
      WHEN t->>'id' = 'lookout'   THEN t || '{"x":14,"y":13}'::jsonb
      WHEN t->>'id' = 'ruffian_1' THEN t || '{"x":13,"y":16}'::jsonb
      WHEN t->>'id' = 'ruffian_2' THEN t || '{"x":15,"y":16}'::jsonb
      WHEN t->>'id' = 'ruffian_3' THEN t || '{"x":14,"y":20}'::jsonb
      ELSE t
    END
  )
  FROM jsonb_array_elements(tokens) AS t
)
WHERE current_scene_id = 'blackthorn.s1.old-mill'
  AND tokens IS NOT NULL
  AND jsonb_array_length(tokens) > 0;
