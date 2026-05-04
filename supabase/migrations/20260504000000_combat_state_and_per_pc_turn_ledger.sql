-- =============================================================================
-- Migration: 20260504000000_combat_state_and_per_pc_turn_ledger.sql
-- Theme:     POL-15-21-22a (Cluster B) — combat-state schema + per-PC turn ledger
-- Created:   2026-05-04
--
-- Background: Cluster B's "server is the bookkeeper" architecture (see
-- DECISIONS.md 2026-05-03 + ARCHITECTURE.md §9) needs a place to write
-- authoritative per-PC per-round action-economy state and a place to
-- carry the initiative pointer / idempotency nonce / snapshot counter
-- for the per-turn state-truth block.
--
-- Two changes in this migration:
--
--   1. NEW TABLE `character_combat_turn` — one row per character per
--      combat round. Stores action_used, bonus_action_used,
--      reaction_used, movement_used, legendary_actions_used. Read by
--      buildSceneContextBlock + the mobile sheet's action-economy
--      strip. Written by apply-state-changes (Cluster B) when combat
--      is active, and reset / new-row by the initiative advance
--      helper at turn-start (POL-15-21-22b).
--
--   2. NO SCHEMA CHANGE FOR `combat_state` — the new fields
--      (`active_initiative_index`, `snapshot_seq`,
--      `last_advance_event_log_id`) extend the existing JSONB shape
--      in code only. Documented here for traceability.
--
-- Forward-only, additive, idempotent. Safe to re-run.
--
-- Nothing is migrated INTO the new table — combat hasn't happened on
-- the new system yet. The legacy `characters.action_used` /
-- `bonus_action_used` / `reaction_used` columns stay populated by the
-- apply step (dual-write) for one release per the LE plan; reads
-- prefer the new table when combat is active. The legacy columns drop
-- in a follow-up migration after one Blackthorn playtest verifies
-- the new path.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. character_combat_turn — per-PC per-round action-economy ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS character_combat_turn (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID         NOT NULL REFERENCES sessions(id)   ON DELETE CASCADE,
  character_id            UUID         NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  round                   INTEGER      NOT NULL CHECK (round >= 1),
  action_used             BOOLEAN      NOT NULL DEFAULT false,
  bonus_action_used       BOOLEAN      NOT NULL DEFAULT false,
  reaction_used           BOOLEAN      NOT NULL DEFAULT false,
  movement_used           INTEGER      NOT NULL DEFAULT 0 CHECK (movement_used >= 0),
  legendary_actions_used  INTEGER      NOT NULL DEFAULT 0 CHECK (legendary_actions_used >= 0),
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT character_combat_turn_unique_per_round
    UNIQUE (session_id, character_id, round)
);

COMMENT ON TABLE character_combat_turn IS
  'Per-PC action economy ledger. One row per character per combat round. Read by buildSceneContextBlock to show the AI what each PC has and hasn''t used. Reset / new-row by the initiative advance helper at turn-start (POL-15-21-22b). Authoritative — the AI reads from here, not from its own memory.';

COMMENT ON COLUMN character_combat_turn.round IS
  'Combat round this row covers. Starts at 1; bumps each round cycle. Unique with session_id + character_id.';

COMMENT ON COLUMN character_combat_turn.action_used IS
  'PC has used their action this turn. Resets when a new row is created at the start of the next round.';

COMMENT ON COLUMN character_combat_turn.bonus_action_used IS
  'PC has used their bonus action this turn. Resets in next round''s row.';

COMMENT ON COLUMN character_combat_turn.reaction_used IS
  'PC has used their reaction. Reaction is per-round (not per-turn) — the new round''s row starts with reaction_used = false.';

COMMENT ON COLUMN character_combat_turn.movement_used IS
  'Feet of movement consumed this turn. Resets in next round''s row.';

COMMENT ON COLUMN character_combat_turn.legendary_actions_used IS
  'Reserved for NPC legendary-action tracking. Most NPCs (and all PCs) leave this at 0.';

-- Fast scoped fetches for the per-turn payload assembly: "give me every
-- combatant's row for this session at this round."
CREATE INDEX IF NOT EXISTS idx_character_combat_turn_session_round
  ON character_combat_turn (session_id, round);

-- Fast lookup for the mobile sheet's Realtime subscription scoped to a
-- character.
CREATE INDEX IF NOT EXISTS idx_character_combat_turn_character_round
  ON character_combat_turn (character_id, round);

-- ---------------------------------------------------------------------------
-- 2. (no SQL) combat_state JSONB shape extension — code-only
-- ---------------------------------------------------------------------------
-- The following fields are added to the JSONB shape stored in
-- `game_state.combat_state` by Cluster B code paths. No SQL change is
-- required because the column already exists as JSONB.
--
--   active_initiative_index    INT   — zero-based pointer into
--                                       combat_state.initiative[] for
--                                       whose turn it is RIGHT NOW.
--                                       Server-maintained.
--   snapshot_seq               INT   — monotonic counter, bumped each
--                                       time the runtime injects a
--                                       state-truth checkpoint.
--   last_advance_event_log_id  UUID  — idempotency nonce for the
--                                       initiative advance helper
--                                       (POL-15-21-22b) so retries
--                                       cannot double-advance.
--
-- The Zod extension lives in lib/schemas/dm-response.ts (combatStateSchema).
-- The TS interface lives in lib/db/combat-turn.ts.
