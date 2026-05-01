-- =============================================================================
-- Migration: 20260430000004_sessions_module_id_and_drunkenness_deprecation.sql
-- Theme:     PIV-02b follow-up — wire module_id onto sessions; deprecate
--            drunkenness columns (annotation-only, no destructive change).
-- Created:   2026-04-30
--
-- Closes two loose ends from PIV-02b:
--
--   1. The /api/dm-action-v2 route currently requires `module_id` in the
--      request body. After this migration, the route resolves `module_id`
--      from the session row instead. Existing sessions backfill as NULL,
--      which is the documented back-compat marker meaning
--      "use the legacy WSC code path."
--
--   2. The drunkenness mechanic (`tolerance_threshold`, `drinks_consumed`)
--      is WSC-only post-pivot. The columns remain (in-flight WSC sessions
--      need them) but are formally annotated as deprecated so any future
--      engineer touching the schema sees the intent.
--
-- Forward-only and additive — no rows changed, no columns dropped.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. SESSIONS — module_id (PIV-02b)
-- ---------------------------------------------------------------------------

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS module_id TEXT;

COMMENT ON COLUMN sessions.module_id IS
  'Identifies which adventure module this session is running. NULL for legacy WSC sessions (those still resolve via the old hardcoded path).';

-- ---------------------------------------------------------------------------
-- 2. CHARACTERS — formal deprecation of drunkenness columns
-- ---------------------------------------------------------------------------
--
-- These columns stay in the schema. WSC continues to read/write them. New
-- modules (post-2026-04-30 pivot) do not. Removing them would be a
-- destructive migration and break in-flight WSC sessions, which violates
-- the additive-only rule (DECISIONS.md "One environment only").
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN characters.tolerance_threshold IS
  'DEPRECATED 2026-04-30: WSC-only mechanic. Do not reference in new modules.';

COMMENT ON COLUMN characters.drinks_consumed IS
  'DEPRECATED 2026-04-30: WSC-only mechanic. Do not reference in new modules.';
