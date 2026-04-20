-- Add position tracking to characters so the party sidebar can show where each player is.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS position TEXT;
