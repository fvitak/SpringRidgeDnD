-- =============================================================================
-- Migration: 20260419000000_initial_schema.sql
-- Project:   SpringRidge D&D AI Dungeon Master
-- Story:     INF-03 (Sprint 1)
-- Created:   2026-04-19
--
-- Creates the four core tables: sessions, characters, game_state, event_log.
-- RLS is enabled on all tables with a permissive allow-all policy.
-- Auth will be introduced in a later sprint.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

-- Sessions table
-- Represents a single D&D campaign/play session.
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Characters table
-- One row per player character; linked to a session.
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  character_name TEXT NOT NULL,
  class TEXT NOT NULL,
  race TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  ac INTEGER NOT NULL,
  stats JSONB NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
  saving_throws JSONB NOT NULL DEFAULT '{}',
  skills JSONB NOT NULL DEFAULT '{}',
  inventory JSONB NOT NULL DEFAULT '[]',
  spell_slots JSONB NOT NULL DEFAULT '{}',
  conditions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Game state table (one row per session, upserted each turn)
-- Tracks the live state of a session: current scene, combat status, active NPCs, etc.
CREATE TABLE game_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  scene TEXT NOT NULL DEFAULT 'start',
  round INTEGER NOT NULL DEFAULT 0,
  combat_active BOOLEAN NOT NULL DEFAULT false,
  active_npcs JSONB NOT NULL DEFAULT '[]',
  narrative_context TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event log table (append-only, one row per player turn)
-- Immutable record of every player input and corresponding AI response.
CREATE TABLE event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL DEFAULT 0,
  player_input TEXT NOT NULL,
  ai_response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX idx_characters_session_id  ON characters(session_id);
CREATE INDEX idx_game_state_session_id  ON game_state(session_id);
CREATE INDEX idx_event_log_session_id   ON event_log(session_id);
CREATE INDEX idx_event_log_created_at   ON event_log(created_at);

-- ---------------------------------------------------------------------------
-- 3. UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------------

-- Generic trigger function: sets updated_at to now() on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_characters_updated_at
  BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_game_state_updated_at
  BEFORE UPDATE ON game_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

ALTER TABLE sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log  ENABLE ROW LEVEL SECURITY;

-- Permissive allow-all policies (private app; auth added in a later sprint).
CREATE POLICY "allow_all" ON sessions   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON characters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON game_state FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON event_log  FOR ALL USING (true) WITH CHECK (true);
