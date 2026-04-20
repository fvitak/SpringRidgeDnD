# Supabase Migrations

## How to run the migration

### Option A — Supabase SQL Editor (no CLI needed)
1. Open your project in the [Supabase dashboard](https://app.supabase.com).
2. Navigate to **SQL Editor** in the left sidebar.
3. Copy the contents of `20260419000000_initial_schema.sql` and paste them into the editor.
4. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`).

### Option B — Supabase CLI (`supabase db push`)
1. Install the CLI if you haven't already: `npm install -g supabase`
2. Log in: `supabase login`
3. Link the project: `supabase link --project-ref <your-project-ref>`
4. Push all pending migrations: `supabase db push`

---

## Tables

| Table | Purpose |
|---|---|
| `sessions` | Represents a single campaign or play session, tracking its name and lifecycle status (`active`, `paused`, `ended`). |
| `characters` | Stores each player's D&D character sheet — stats, HP, inventory, spell slots, and conditions — linked to a session. |
| `game_state` | Holds the live, mutable state of a session (current scene, combat round, active NPCs, narrative context); one row per session, upserted each turn. |
| `event_log` | Append-only ledger of every player action and the AI Dungeon Master's response, used for history and replay. |
