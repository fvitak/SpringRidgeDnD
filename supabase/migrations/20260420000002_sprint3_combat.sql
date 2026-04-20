-- Sprint 3 – Combat system schema additions
-- Adds live combat tracking columns to game_state and death-save / action-economy
-- columns to characters.

-- ---------------------------------------------------------------------------
-- game_state: live combat tracking
-- ---------------------------------------------------------------------------

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS combat_state JSONB;

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS pending_roll JSONB;

-- ---------------------------------------------------------------------------
-- characters: death saves
-- ---------------------------------------------------------------------------

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS death_saves_successes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS death_saves_failures INTEGER NOT NULL DEFAULT 0;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS is_stable BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- characters: per-turn action economy
-- ---------------------------------------------------------------------------

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS action_used BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS bonus_action_used BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS reaction_used BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- characters: concentration spell tracking
-- ---------------------------------------------------------------------------

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS concentration TEXT;
