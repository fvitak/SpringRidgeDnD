-- ============================================================
-- Sprint 2 schema additions
-- Adds player-slot tracking, drink/tolerance mechanics,
-- personality traits, and shareable session join tokens.
-- No columns or tables are dropped; RLS policies are unchanged.
-- ============================================================


-- ------------------------------------------------------------
-- characters table additions
--
-- tolerance_threshold : hidden server-side stat controlling when
--   a character starts exhibiting drunk behaviour; never sent to
--   the client directly.
-- drinks_consumed     : running total of drinks taken this session;
--   reset to 0 on a long rest.
-- slot                : which of the 1-4 player seats this character
--   has claimed in its session (NULL until the player joins).
-- personality_traits  : short bullet-style strings summarising the
--   character's personality, injected into the AI DM prompt.
-- ------------------------------------------------------------
ALTER TABLE characters ADD COLUMN IF NOT EXISTS tolerance_threshold INTEGER NOT NULL DEFAULT 3;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS drinks_consumed     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS slot                INTEGER;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS personality_traits  TEXT[]  NOT NULL DEFAULT '{}';


-- ------------------------------------------------------------
-- sessions table additions
--
-- join_token   : URL-safe token embedded in the shareable invite
--   link so players can join without knowing the session UUID.
--   Must be unique across all sessions.
-- player_count : expected number of players (2-4); used by the
--   lobby UI to show open/filled seat indicators.
-- ------------------------------------------------------------
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS join_token   TEXT    UNIQUE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS player_count INTEGER NOT NULL DEFAULT 4;


-- ------------------------------------------------------------
-- Index to support fast lookups when a player arrives via a
-- shareable join link and the app resolves the token to a session.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_join_token ON sessions(join_token);


-- ------------------------------------------------------------
-- Seed the default session (created by the initial migration)
-- with a stable join token so existing development environments
-- work immediately after this migration runs.
-- ------------------------------------------------------------
UPDATE sessions
SET    join_token   = 'default-token-001',
       player_count = 4
WHERE  id = '00000000-0000-0000-0000-000000000001';
