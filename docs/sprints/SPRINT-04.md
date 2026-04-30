# Sprint 4 — Gameplay Polish

**Weeks 7–8** · **Status:** ▶ IN PROGRESS · **Planned points:** ~44

## Sprint goal

The game feels complete and polished for a real friend-group session. Roll
modifiers are shown in narration, mobile combat actions are visible,
sessions persist across weeks, and narrative depth is consistent.

## Committed stories

See `docs/BACKLOG.md` "Active — Sprint 4" for the authoritative list.
Summary by theme:

- **Narrative polish** — POL-01 (modifier display), POL-02 (action panel),
  POL-03 (ambiguous-action clarification), POL-04 (inactive-player
  check-in), POL-05 (stat adjuster copy).
- **Session persistence** — PER-01 (auto-save completeness), PER-02
  (resume flow), PER-03 (session history view).
- **Progression** — XP-01/02/03 (award, level-up flow, 5e level-up rules).
- **Loot** — INV-01 (AI-awarded loot → DB), INV-02 (mobile inventory).

## Known risks at planning time

- Point total (~44) exceeds original target (~35). Lead Engineer to flag
  at planning; PM to pick a drop candidate if not resolved by mid-sprint.
- PER-02 (resume flow) is the biggest unknown — touches prompt assembly,
  event-log truncation, and game_state rehydration. Spike before commit.
- XP-01/02/03 are interlocked. Ship all three or none.

## Working agreements (specific to this sprint)

- Any change to the Zod schema in `lib/schemas/dm-response.ts` needs an
  ADR entry in `docs/DECISIONS.md` before merge.
- PER-01 is listed as "Partial" — first task is to write a test that
  demonstrates the gap, then close it. No blind "also saving X" commits.

## Retro placeholder

_Filled in at end of sprint by PM agent._

- What shipped:
- What slipped:
- Scope expansions picked up in-sprint:
- Carry-forward to Sprint 5:

---

## Technical plan — MAP-ADM-01: Scene alignment editor

**Story ID:** MAP-ADM-01
**Added in-sprint:** 2026-04-29 (scope expansion; not in original committed stories)
**Estimated size:** M (half-day) — UI is self-contained; no schema migration required
**Depends on:** none (scenes table and image assets already exist in prod)

### Goal

Give Frank a browser-based tool to visually align the grid overlay to a
scene's map image without touching SQL. Today every tweak to `grid_cols`,
`grid_rows`, `cell_px`, `origin_x_px`, or `origin_y_px` requires writing
and running a migration. The editor makes this a drag-slider operation.

### Acceptance criteria

1. Navigating to `/admin/scenes` (or `/admin/scenes?secret=<token>`) renders
   a list of all rows in the `scenes` table (id, name, scenario_id).
2. Clicking a scene loads a detail view that shows the map image at its
   natural pixel size (or scaled to fit the viewport) with a semi-transparent
   SVG grid overlay drawn on top.
3. Five controls — `grid_cols`, `grid_rows`, `cell_px`, `origin_x_px`,
   `origin_y_px` — update the overlay in real time (no page reload, no save
   required to preview). Number inputs or range sliders; both are acceptable.
4. A "Save" button sends `PATCH /api/admin/scenes/[id]` with only those five
   fields. On 200 the button shows a brief "Saved" confirmation; on error it
   shows the error message.
5. The route is protected by a `?secret=` query-param gate. The secret is
   read from `process.env.ADMIN_SECRET`. If the env var is absent the route
   is open (dev convenience). If the param does not match the route returns
   a plain 401. No auth infrastructure needed.
6. The page must not appear in Next.js navigation or be linked from any
   player-facing route.

### API changes

#### New route: `PATCH /api/admin/scenes/[id]`

File: `app/api/admin/scenes/[id]/route.ts`

Request body (JSON):
```ts
{
  grid_cols?:   number   // integer >= 1
  grid_rows?:   number   // integer >= 1
  cell_px?:     number   // integer >= 8
  origin_x_px?: number   // integer, may be negative
  origin_y_px?: number   // integer, may be negative
}
```

Behaviour:
- Parse and validate with Zod (all fields optional but at least one required).
  Use `z.number().int()` for each. `cell_px` minimum is 8; cols/rows minimum
  is 1.
- Do NOT accept or touch `walkable`, `regions`, `exits`, `default_tokens`, or
  any other column. Strip unknown keys before the DB write.
- `UPDATE scenes SET ... WHERE id = $id RETURNING id, name, grid_cols,
  grid_rows, cell_px, origin_x_px, origin_y_px`.
- Return the updated row on 200, or a `{ error: string }` on 400/500.
- No auth on the API route itself — the page gate is sufficient for this
  internal tool (the supabase key is already server-side).

#### No new migration

The five geometry columns (`grid_cols`, `grid_rows`, `cell_px`, `origin_x_px`,
`origin_y_px`) already exist on the `scenes` table
(migration `20260429000000_blackthorn_scenarios.sql`). Nothing to migrate.

### Files to create or touch

| File | Action | Notes |
|------|--------|-------|
| `app/admin/scenes/page.tsx` | Create | Scene list + secret gate. Server Component that fetches all scenes rows; passes list to a Client Component for navigation. |
| `app/admin/scenes/[id]/page.tsx` | Create | Detail editor. Client Component — controls live here so state is local. Fetches initial scene data via a server action or direct Supabase call on load. |
| `app/admin/scenes/[id]/SceneAlignEditor.tsx` | Create | The canvas/SVG grid overlay + control panel. Pure client component; receives initial values as props and owns local state for the five params. |
| `app/api/admin/scenes/[id]/route.ts` | Create | `PATCH` handler only. See spec above. |
| `docs/ARCHITECTURE.md` | Update | Add the two new paths to the directory map table. |

No changes to `lib/schemas/dm-response.ts`, no changes to `lib/db/`, no
changes to any existing API route.

### Implementation notes for the Engineer

**Grid overlay rendering.** Render the grid as an SVG `<svg>` element
absolutely positioned over a `<div>` that contains the map `<img>`. The SVG
should be the same dimensions as the rendered image. Draw `grid_cols + 1`
vertical lines and `grid_rows + 1` horizontal lines, each offset by
`origin_x_px` / `origin_y_px`, spaced `cell_px` apart. Keep the stroke
semi-transparent (`rgba(255,0,0,0.4)` or similar) so the map beneath is
readable.

Do NOT use `<canvas>` for the overlay — SVG is simpler to position correctly
without a pixel-ratio scaling step, and the grid is just lines.

**Image loading.** Use the Next.js `<Image>` component with `fill` layout
inside a `position: relative` container. Check
`node_modules/next/dist/docs/` for the current `<Image>` API before writing
— Next.js 16 conventions may differ from training data. Do not use a bare
`<img>` tag.

**Secret gate.** In `app/admin/scenes/page.tsx` (Server Component), read
`searchParams.secret` and compare to `process.env.ADMIN_SECRET`. If the
env var is set and the param does not match, return a `<p>Forbidden</p>`
with no other content (not a redirect — keeps the implementation trivial).
Mirror the same check in `app/admin/scenes/[id]/page.tsx`.

**Supabase client in Server Components.** Use `getSupabase()` from
`lib/supabase.ts` (the existing shared client). Do not instantiate a new
Supabase client inline.

**PATCH endpoint file layout.** The path
`app/api/admin/scenes/[id]/route.ts` is a new directory tree — the Engineer
will need to create both the `admin/scenes/[id]/` folder and the
`route.ts` file. There is no existing `app/api/admin/` directory.

**No walkable editing.** The `walkable` JSONB column is intentionally
excluded. It is still edited via SQL migration. Do not add a mask editor
or any affordance that could inadvertently overwrite it.

### Test plan

1. Run `next dev`. Navigate to `/admin/scenes` with no secret env var set
   — scene list renders without error.
2. Add `ADMIN_SECRET=test123` to `.env.local`. Navigate to `/admin/scenes`
   — see Forbidden. Navigate to `/admin/scenes?secret=test123` — see list.
3. Click a scene. Adjust `cell_px` slider — grid lines should move
   immediately without any network request.
4. Adjust `origin_x_px` — grid shifts horizontally over the image.
5. Click Save. Open the Supabase Table Editor and verify the updated values
   are stored on the row. Confirm `walkable` is unchanged.
6. Pass an invalid value (e.g. `cell_px = 0`) and verify the API returns 400.

### Risks and unknowns

- **Image natural size vs rendered size.** The map images may be larger than
  the viewport. If the Engineer scales the image via CSS, the SVG overlay
  must scale identically. The simplest approach is `object-fit: contain`
  on the image and matching dimensions on the SVG; if the image is
  unreasonably large this may need a `max-w` constraint. The Engineer
  should verify with the actual Blackthorn map file before choosing an
  approach.
- **No auth on the PATCH endpoint.** Acceptable for a private single-tenant
  app (per the "one env, Frank's call" ADRs), but if the route is ever
  exposed to a wider audience the missing auth is a write-access gap on the
  scenes table. Flag in a future LAUNCH.md item.
- **origin offsets can go negative.** The DB column is `INTEGER NOT NULL
  DEFAULT 0` with no CHECK constraint on sign — negative values are valid
  (the grid origin can be off-image). The Zod schema should allow negative
  integers; the slider min should be approximately `-cell_px` to cover that
  case.

**Proposed spike?** No — the implementation is straightforward and all
dependencies are already in place.
