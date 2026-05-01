-- =============================================================================
-- Migration: 20260430000005_character_romance.sql
-- Theme:     PIV-04 — Romance subsystem state model.
-- Created:   2026-04-30
--
-- Adds the `character_romance` table that holds per-character romance state
-- for couples-focused modules (e.g. Date Night Dungeons / Blackthorn). Empty
-- for characters in modules without a romance layer.
--
-- Privacy is enforced at the API layer (see DECISIONS.md 2026-04-30
-- "Romance subsystem schema + privacy enforcement at the API layer").
-- RLS is intentionally NOT used here — GRAIL has no per-player auth, so
-- the privacy gate ("Pet Peeves never leak across the partner") is the
-- responsibility of `app/api/characters/[id]/romance/...` route handlers.
--
-- Forward-only and additive — no existing rows touched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS character_romance (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id                UUID NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE,

  -- Authored by the player at session start. Each int is a d20 roll that
  -- selects an entry in the module's romance-tables.json `turn_ons` array.
  -- Length is enforced as 3 in the API layer; NULL means "not yet chosen".
  chosen_turn_on_rolls        INTEGER[] NOT NULL DEFAULT '{}',

  -- Server-rolled at the player's request. Length 2 once populated.
  rolled_pet_peeve_rolls      INTEGER[] NOT NULL DEFAULT '{}',

  -- First-impression starting AP. NULL means "not yet rolled".
  first_impression_total      INTEGER,

  -- Audit log of which preconception rolls produced what deltas.
  -- Shape: [{ preconception_id, d20, delta }]. Stored as a flat array for
  -- query simplicity; never read by the AI prompt.
  first_impression_components JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- The hidden running total. NEVER returned by any GET endpoint.
  -- Bands ("smitten", "guarded") map from this number server-side and are
  -- the only AP-derived value exposed in API responses.
  current_ap                  INTEGER NOT NULL DEFAULT 0,

  -- Append-only audit of AP changes. Shape:
  --   [{ ts: ISO8601, delta: int, reason: string, source: string }]
  -- Where `source` is one of: 'first_impression' | 'turn_on_fire' |
  -- 'pet_peeve_fire' | 'combat_crit' | 'combat_fumble' | 'aid_action' |
  -- 'roleplay' | 'intimacy_outcome' | 'rule_of_cool'.
  ap_history                  JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_character_romance_character_id
  ON character_romance(character_id);

COMMENT ON TABLE character_romance IS
  'Romance state for couples-focused modules (e.g. Date Night Dungeons). Empty for characters in modules without a romance layer. Privacy is enforced at the API layer; RLS deliberately not used because GRAIL has no per-player auth.';

COMMENT ON COLUMN character_romance.current_ap IS
  'HIDDEN from all API responses. Only the band label (mapped server-side) is ever exposed.';

COMMENT ON COLUMN character_romance.rolled_pet_peeve_rolls IS
  'PRIVATE to the owning character. The /api/characters/[id]/romance GET handler strips this whenever viewer != id.';

-- Permissive RLS to match the rest of the schema (auth is single-tenant).
ALTER TABLE character_romance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON character_romance FOR ALL USING (true) WITH CHECK (true);

-- updated_at is bumped at app-level (matches the existing convention in
-- game_state and other tables — no DB-side trigger).
