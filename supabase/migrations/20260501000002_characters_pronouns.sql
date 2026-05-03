-- =============================================================================
-- Migration: 20260501000002_characters_pronouns.sql
-- Theme:     PIV — Hardcode Blackthorn PC pronouns so AI narration + host UI
--            stop falling back to neutral they/them across an entire session.
-- Created:   2026-05-01
--
-- Background: per the Blackthorn PDF, Wynn is `she/her` and Tarric is `he/him`.
-- Until pronouns were stored on the character row, the per-turn scene context
-- couldn't surface them, so the AI defaulted to neutral pronouns even during
-- intimate beats — jarring across a whole session. The host-screen intake
-- gate copy hit the same problem (it had to use "they/them" because the UI
-- layer didn't know).
--
-- This migration adds a nullable `pronouns` column to `characters` and
-- backfills existing Blackthorn rows from the templates. Other characters
-- (WSC sessions, future modules without pronouns) stay NULL and the
-- module-runner prompt rule treats NULL as "default to they/them".
--
-- Forward-only, additive, idempotent. No data is destroyed; no other
-- character rows are touched.
-- =============================================================================

-- 1. Add the column. Nullable so non-romance characters / future modules
--    without pronoun data don't break.
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS pronouns text;

COMMENT ON COLUMN characters.pronouns IS
  'Optional hardcoded pronoun string for AI narration + UI copy. Typical values: ''she/her'', ''he/him'', ''they/them''. NULL ⇒ AI defaults to they/them. Public to partner (no privacy gate); romance privacy gate only fires on character_romance rows.';

-- 2. Backfill the two Blackthorn templates. Match by character_name; only
--    touch rows where pronouns is still NULL so re-runs are no-ops.
UPDATE characters
SET pronouns = 'she/her'
WHERE character_name ILIKE 'wynn'
  AND pronouns IS NULL;

UPDATE characters
SET pronouns = 'he/him'
WHERE character_name ILIKE 'tarric'
  AND pronouns IS NULL;
