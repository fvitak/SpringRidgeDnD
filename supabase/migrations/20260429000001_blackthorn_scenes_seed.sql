-- =============================================================================
-- Migration: 20260429000001_blackthorn_scenes_seed.sql
-- Theme:     MAP — Phase 1 seed data
-- Created:   2026-04-29
--
-- Seeds the Old Mill scene for Scenario 1. The walkable mask is a hand-traced
-- approximation of pages 76/78/80 of the source PDF; refine in playtest.
--
-- Walkable mask alphabet:
--   '.' = walkable floor (cost 1)
--   'W' = wall (impassable)
--   '~' = water (impassable for now; treat as a future swim check)
--   'T' = tree / cover (impassable)
--   'D' = difficult terrain (cost 2)
--   '>' = stair or door (walkable)
-- =============================================================================

INSERT INTO scenes (
  id,
  scenario_id,
  name,
  image_path,
  grid_cols,
  grid_rows,
  cell_px,
  origin_x_px,
  origin_y_px,
  walkable,
  regions,
  exits,
  default_tokens
) VALUES (
  'blackthorn.s1.old-mill',
  'blackthorn-clan',
  'The Old Mill — exterior',
  '/maps/blackthorn/scenes/old-mill.png',
  20, 26, 77, 0, 0,
  $$
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
      "..........WWW.1.W..~",
      "..........W.....W.~~",
      "..........W..1..W.~~",
      "..........W.....W.~~",
      "..........WW.>.WW.~~",
      "..........W.....W~~~",
      "..........W..2..W~~~",
      "..........W.....W~>~",
      "..........W..L..W~>~",
      "..........W.....W~~~",
      "..........W..2..W~~~",
      "..........W.....W~~~",
      "..........WW.>.WW.~~",
      "..........W.....W.~~",
      "..........W..3..W.~~",
      "..........W.....W.~~",
      "..........WWWWWWW.~~",
      "....................",
      ".....T.....T........",
      "...................."
    ]
  }
  $$::jsonb,
  $$
  [
    { "name": "Compass rose",       "cells": [[1,0],[2,0],[1,1],[2,1]] },
    { "name": "Riverbank",          "description": "Cold, low water; slick footing" },
    { "name": "Room 1 (north)",     "description": "Where Wynn is held — cot and shelves" },
    { "name": "Room 2 (main hall)", "description": "Two ruffians playing cards" },
    { "name": "Room 3 (south)",     "description": "Mostly storage; one ruffian dozing" },
    { "name": "Loft / waterwheel",  "description": "Climb up via the broken paddlewheel" },
    { "name": "Footbridge",         "description": "Narrow plank — DC 8 Athletics if pressed" }
  ]
  $$::jsonb,
  $$
  [
    { "to_scene": null, "label": "Forest path back to Blackthorn Manor", "cells": [[0,12],[0,13]] }
  ]
  $$::jsonb,
  $$
  [
    {
      "id": "tarric",   "kind": "pc",  "character_slot": 1, "name": "Tarric",
      "image_path": null, "x": 7, "y": 11, "size": 1, "hp": 35, "max_hp": 35,
      "conditions": [], "is_friendly": true, "color": "#5B7FBF"
    },
    {
      "id": "wynn",     "kind": "pc",  "character_slot": 2, "name": "Wynn",
      "image_path": null, "x": 14, "y": 8, "size": 1, "hp": 27, "max_hp": 27,
      "conditions": ["restrained","gagged"], "is_friendly": true, "color": "#B65BBF"
    },
    {
      "id": "lookout",  "kind": "npc", "name": "Harold (Lookout)",
      "image_path": null, "x": 14, "y": 13, "size": 1, "hp": 11, "max_hp": 11,
      "conditions": [], "is_friendly": false, "color": "#A23B3B",
      "stats": { "ac": 12, "attacks": [{"name":"Shortbow","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    },
    {
      "id": "ruffian_1","kind": "npc", "name": "Ruffian (cards)",
      "image_path": null, "x": 13, "y": 16, "size": 1, "hp": 12, "max_hp": 12,
      "conditions": [], "is_friendly": false, "color": "#A23B3B",
      "stats": { "ac": 12, "attacks": [{"name":"Short sword","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    },
    {
      "id": "ruffian_2","kind": "npc", "name": "Ruffian (cards)",
      "image_path": null, "x": 15, "y": 16, "size": 1, "hp": 12, "max_hp": 12,
      "conditions": [], "is_friendly": false, "color": "#A23B3B",
      "stats": { "ac": 12, "attacks": [{"name":"Short sword","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    },
    {
      "id": "ruffian_3","kind": "npc", "name": "Ruffian (dozing)",
      "image_path": null, "x": 14, "y": 20, "size": 1, "hp": 12, "max_hp": 12,
      "conditions": ["unaware"], "is_friendly": false, "color": "#A23B3B",
      "stats": { "ac": 12, "attacks": [{"name":"Short sword","bonus":3,"damage":"1d6+1"}], "speed_squares": 6 }
    }
  ]
  $$::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  scenario_id   = EXCLUDED.scenario_id,
  name          = EXCLUDED.name,
  image_path    = EXCLUDED.image_path,
  grid_cols     = EXCLUDED.grid_cols,
  grid_rows     = EXCLUDED.grid_rows,
  cell_px       = EXCLUDED.cell_px,
  origin_x_px   = EXCLUDED.origin_x_px,
  origin_y_px   = EXCLUDED.origin_y_px,
  walkable      = EXCLUDED.walkable,
  regions       = EXCLUDED.regions,
  exits         = EXCLUDED.exits,
  default_tokens = EXCLUDED.default_tokens;
