-- Backfill `module_id` for Blackthorn sessions created before the column
-- was wired (migration 20260430000004 added the column nullable; the
-- session-create POST started writing it in commit e439bf1).
--
-- Without this, pre-wiring Blackthorn sessions have scenario_id =
-- 'blackthorn-clan' but module_id IS NULL, which the host UI treats as
-- "legacy WSC path" — it then has no kick template for blackthorn-clan,
-- the auto-fire effect produces no opening narration, Wynn never gets
-- discovered, and the player lands on a blank screen.
--
-- This is purely additive backfill — no schema change.

UPDATE sessions
   SET module_id = 'blackthorn'
 WHERE scenario_id = 'blackthorn-clan'
   AND module_id IS NULL;
