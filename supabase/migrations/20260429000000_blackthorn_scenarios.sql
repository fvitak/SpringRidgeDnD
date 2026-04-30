-- =============================================================================
-- Migration: 20260429000000_blackthorn_scenarios.sql
-- Theme:     MAP / Date Night — Phase 1 schema
-- Created:   2026-04-29
--
-- Adds: scenarios + scenes registry, sessions.scenario_id, game_state token
-- positions + current scene, characters movement / rating columns, sessions
-- date-night mode + computed rating.
--
-- Forward-only. Existing WSC sessions backfill scenario_id = 'wild-sheep-chase'.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. SCENARIOS REGISTRY
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scenarios (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  player_count_min  INTEGER NOT NULL DEFAULT 2,
  player_count_max  INTEGER NOT NULL DEFAULT 4,
  prompt_module     TEXT NOT NULL,
  supports_date_night BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO scenarios (id, name, player_count_min, player_count_max, prompt_module, supports_date_night)
VALUES
  ('wild-sheep-chase', 'The Wild Sheep Chase', 2, 4, 'lib/prompts/wild-sheep-chase', false),
  ('blackthorn-clan',  'Rescue of the Blackthorn Clan', 2, 2, 'lib/prompts/blackthorn-clan', true),
  ('random-encounter', 'Random Encounter (Combat Test)', 2, 4, 'lib/prompts/wild-sheep-chase', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON scenarios FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. SCENES — one row per map within a scenario
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scenes (
  id           TEXT PRIMARY KEY,
  scenario_id  TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  image_path   TEXT NOT NULL,
  grid_cols    INTEGER NOT NULL,
  grid_rows    INTEGER NOT NULL,
  cell_px      INTEGER NOT NULL,
  origin_x_px  INTEGER NOT NULL DEFAULT 0,
  origin_y_px  INTEGER NOT NULL DEFAULT 0,
  walkable     JSONB NOT NULL DEFAULT '{}',
  regions      JSONB NOT NULL DEFAULT '[]',
  exits        JSONB NOT NULL DEFAULT '[]',
  default_tokens JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenes_scenario ON scenes(scenario_id);

ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON scenes FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. SESSIONS — scenario routing + Date Night controls
-- ---------------------------------------------------------------------------

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scenario_id TEXT
  REFERENCES scenarios(id) ON DELETE SET NULL;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS date_night_mode BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_rating TEXT NOT NULL DEFAULT 'PG'
  CHECK (current_rating IN ('G', 'PG', 'PG-13', 'R', 'NC-17'));

-- Backfill scenario_id for any in-flight sessions created before this migration
UPDATE sessions
SET scenario_id = CASE
  WHEN name ILIKE '%blackthorn%'        THEN 'blackthorn-clan'
  WHEN name ILIKE '%random encounter%'  THEN 'random-encounter'
  ELSE 'wild-sheep-chase'
END
WHERE scenario_id IS NULL;

-- ---------------------------------------------------------------------------
-- 4. GAME_STATE — current scene + token positions
-- ---------------------------------------------------------------------------

ALTER TABLE game_state ADD COLUMN IF NOT EXISTS current_scene_id TEXT
  REFERENCES scenes(id) ON DELETE SET NULL;

ALTER TABLE game_state ADD COLUMN IF NOT EXISTS tokens JSONB NOT NULL DEFAULT '[]';
-- token shape:
-- {
--   "id":          "<unique within session>",
--   "kind":        "pc" | "npc",
--   "character_id": "<uuid>" | null,
--   "name":        "Tarric",
--   "image_path":  "/maps/blackthorn/tokens/tarric.png",
--   "x":           3,
--   "y":           12,
--   "size":        1,                  -- 1×1, 2×2 for Large
--   "hp":          35,
--   "max_hp":      35,
--   "conditions":  [],
--   "is_friendly": true                -- determines opportunity-attack threats
-- }

-- ---------------------------------------------------------------------------
-- 5. CHARACTERS — movement budget + content rating preference
-- ---------------------------------------------------------------------------

ALTER TABLE characters ADD COLUMN IF NOT EXISTS speed_squares INTEGER NOT NULL DEFAULT 6;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS movement_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS dash_used     BOOLEAN NOT NULL DEFAULT false;

-- Per-player rating preference (used to compute sessions.current_rating).
-- Initial value is 'PG' to match the session default.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS rating_preference TEXT NOT NULL DEFAULT 'PG'
  CHECK (rating_preference IN ('G', 'PG', 'PG-13', 'R', 'NC-17'));

-- ---------------------------------------------------------------------------
-- 6. INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sessions_scenario_id ON sessions(scenario_id);
CREATE INDEX IF NOT EXISTS idx_game_state_current_scene_id ON game_state(current_scene_id);
