// Build updated roadmap DOCX
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, LevelFormat
} = require('C:/Users/fvita/AppData/Roaming/npm/node_modules/docx')
const fs = require('fs')

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GRAY   = 'E8E8E8'
const GREEN  = 'D4EDDA'
const AMBER  = 'FFF3CD'
const BLUE   = 'D0E8F8'
const DARK   = '2C2C2C'

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const borders = { top: border, bottom: border, left: border, right: border }
const cellPad = { top: 80, bottom: 80, left: 120, right: 120 }

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, bold: true, size: 32, font: 'Arial' })]
  })
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, bold: true, size: 26, font: 'Arial' })]
  })
}
function h3(text) {
  return new Paragraph({
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, bold: true, size: 24, font: 'Arial', color: '444444' })]
  })
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 20, font: 'Arial', ...opts })]
  })
}
function bullet(text, opts = {}) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 20, after: 20 },
    children: [new TextRun({ text, size: 20, font: 'Arial', ...opts })]
  })
}
function rule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } },
    spacing: { before: 160, after: 160 },
    children: []
  })
}
function spacer() {
  return new Paragraph({ spacing: { before: 80, after: 80 }, children: [] })
}

function cell(text, { fill, bold, width, color } = {}) {
  return new TableCell({
    borders,
    width: { size: width || 2000, type: WidthType.DXA },
    margins: cellPad,
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: text || '', size: 18, font: 'Arial', bold: bold || false, color: color || '000000' })]
    })]
  })
}

function storyRow(id, story, pts, status) {
  const statusColors = { DONE: GREEN, PARTIAL: AMBER, PENDING: 'FFFFFF', NEW: BLUE }
  const fill = statusColors[status] || 'FFFFFF'
  const tick = status === 'DONE' ? '✓ ' : status === 'PARTIAL' ? '~ ' : ''
  return new TableRow({ children: [
    cell(id,            { width: 1080, bold: true }),
    cell(tick + story,  { width: 6480, fill }),
    cell(String(pts),   { width: 720, }),
    cell(status === 'DONE' ? 'Done' : status === 'PARTIAL' ? 'Partial' : status === 'NEW' ? 'New' : 'Pending', { width: 1080, fill }),
  ]})
}

function storyTable(rows) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1080, 6480, 720, 1080],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell('ID', { fill: DARK, bold: true, width: 1080, color: 'FFFFFF' }),
          cell('User Story', { fill: DARK, bold: true, width: 6480, color: 'FFFFFF' }),
          cell('Pts', { fill: DARK, bold: true, width: 720, color: 'FFFFFF' }),
          cell('Status', { fill: DARK, bold: true, width: 1080, color: 'FFFFFF' }),
        ]
      }),
      ...rows
    ]
  })
}

// ─── Document ─────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
    }]
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial', color: '1A3A5C' },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: '2E5C8A' },
        paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    children: [

      // ── Title
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: 'AI Dungeon Master', bold: true, size: 52, font: 'Arial', color: '1A3A5C' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: 'Product Roadmap & Backlog', size: 28, font: 'Arial', color: '444444' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 240 },
        children: [new TextRun({ text: 'A D&D 5e AI-powered tabletop companion  ·  Updated April 2026  ·  Sprint 4 Starting', size: 20, font: 'Arial', color: '888888' })]
      }),
      rule(),

      // ── 1. Product Overview
      h1('1. Product Overview'),
      p('A web application that serves as an AI Dungeon Master for a party of 3–4 players using D&D 5th Edition rules. The DM screen runs on a single PC; players join via mobile devices to see their character sheets update in real time. The AI (powered by Claude) handles narration, rules enforcement, NPC behavior, and combat.'),
      spacer(),
      p('Launch scenario: The Wild Sheep Chase (Winghorn Press) — a free, well-documented 3–4 hour one-shot ideal for new players. It serves as the test bed for all app features before multi-scenario support is added.'),
      spacer(),

      // Tech stack table
      h2('Tech Stack'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2000, 3000, 4360],
        rows: [
          new TableRow({ tableHeader: true, children: [
            cell('Layer',        { fill: DARK, bold: true, width: 2000, color: 'FFFFFF' }),
            cell('Technology',   { fill: DARK, bold: true, width: 3000, color: 'FFFFFF' }),
            cell('Rationale',    { fill: DARK, bold: true, width: 4360, color: 'FFFFFF' }),
          ]}),
          new TableRow({ children: [
            cell('Frontend',     { width: 2000 }),
            cell('Next.js 16 + React + Tailwind CSS', { width: 3000 }),
            cell('Single repo, App Router, API routes, fast Vercel deploy', { width: 4360 }),
          ]}),
          new TableRow({ children: [
            cell('Database',     { width: 2000 }),
            cell('Supabase (Postgres)', { width: 3000 }),
            cell('Game state, characters, sessions, event log', { width: 4360 }),
          ]}),
          new TableRow({ children: [
            cell('Real-time Sync', { width: 2000 }),
            cell('Supabase Realtime', { width: 3000 }),
            cell('Mobile character sheets update live — HP, conditions, death saves', { width: 4360 }),
          ]}),
          new TableRow({ children: [
            cell('AI DM Brain',  { width: 2000 }),
            cell('Anthropic Claude API (claude-sonnet-4-6)', { width: 3000 }),
            cell('Narration, rules engine, NPC logic, combat — with prompt caching', { width: 4360 }),
          ]}),
          new TableRow({ children: [
            cell('Dice Engine',  { width: 2000 }),
            cell('Deterministic JS (crypto.getRandomValues)', { width: 3000 }),
            cell('lib/dice.ts — fast, auditable, reproducible rolls', { width: 4360 }),
          ]}),
          new TableRow({ children: [
            cell('Deployment',   { width: 2000 }),
            cell('Vercel + Supabase Cloud', { width: 3000 }),
            cell('Zero-ops, auto-deploy from main branch, single prod env (no staging)', { width: 4360 }),
          ]}),
        ]
      }),
      spacer(),
      rule(),

      // ── 2. Sprint Status Overview
      h1('2. Sprint Status Overview'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1200, 2400, 2400, 1560, 1800],
        rows: [
          new TableRow({ tableHeader: true, children: [
            cell('Sprint',        { fill: DARK, bold: true, width: 1200, color: 'FFFFFF' }),
            cell('Goal',          { fill: DARK, bold: true, width: 2400, color: 'FFFFFF' }),
            cell('Weeks',         { fill: DARK, bold: true, width: 2400, color: 'FFFFFF' }),
            cell('Points',        { fill: DARK, bold: true, width: 1560, color: 'FFFFFF' }),
            cell('Status',        { fill: DARK, bold: true, width: 1800, color: 'FFFFFF' }),
          ]}),
          new TableRow({ children: [
            cell('Sprint 1', { width: 1200, bold: true }),
            cell('The Foundation — DM screen, AI narration, persistence', { width: 2400 }),
            cell('Wks 1–2', { width: 2400 }),
            cell('34 pts', { width: 1560 }),
            cell('✓ COMPLETE', { width: 1800, fill: GREEN, bold: true }),
          ]}),
          new TableRow({ children: [
            cell('Sprint 2', { width: 1200, bold: true }),
            cell('Sessions, Players & Characters — mobile sheets, char creator', { width: 2400 }),
            cell('Wks 3–4', { width: 2400 }),
            cell('42 pts', { width: 1560 }),
            cell('✓ COMPLETE', { width: 1800, fill: GREEN, bold: true }),
          ]}),
          new TableRow({ children: [
            cell('Sprint 3', { width: 1200, bold: true }),
            cell('Combat Engine — initiative, rolls, death saves, conditions', { width: 2400 }),
            cell('Wks 5–6', { width: 2400 }),
            cell('45 pts', { width: 1560 }),
            cell('✓ COMPLETE', { width: 1800, fill: GREEN, bold: true }),
          ]}),
          new TableRow({ children: [
            cell('Sprint 4', { width: 1200, bold: true }),
            cell('Gameplay Polish — UX fixes from first playtests, narrative depth', { width: 2400 }),
            cell('Wks 7–8', { width: 2400 }),
            cell('~35 pts', { width: 1560 }),
            cell('▶ IN PROGRESS', { width: 1800, fill: AMBER, bold: true }),
          ]}),
          new TableRow({ children: [
            cell('Sprint 5', { width: 1200, bold: true }),
            cell('Campaign & Progression — XP, leveling, inventory, session resume', { width: 2400 }),
            cell('Wks 9–11', { width: 2400 }),
            cell('~40 pts', { width: 1560 }),
            cell('Planned', { width: 1800 }),
          ]}),
          new TableRow({ children: [
            cell('Sprint 6', { width: 1200, bold: true }),
            cell('Voice Input — speech-to-text, TTS narration, mobile roll prompts', { width: 2400 }),
            cell('Wks 12–14', { width: 2400 }),
            cell('28 pts', { width: 1560 }),
            cell('Planned', { width: 1800 }),
          ]}),
          new TableRow({ children: [
            cell('Sprint 7', { width: 1200, bold: true }),
            cell('Polish, AI Images & Multi-scenario', { width: 2400 }),
            cell('Wks 15+', { width: 2400 }),
            cell('~30 pts', { width: 1560 }),
            cell('TBD', { width: 1800 }),
          ]}),
        ]
      }),
      spacer(),
      rule(),

      // ── 3. Completed Sprints
      h1('3. Completed Sprints'),

      // Sprint 1
      h2('Sprint 1 · Weeks 1–2 · The Foundation  ✓ COMPLETE'),
      p('Goal: A working DM screen where a player can type an action and receive AI narration, grounded in the Wild Sheep Chase scenario. Infrastructure deployed.'),
      spacer(),
      storyTable([
        storyRow('INF-01', 'Scaffold Next.js 16 + Tailwind CSS + ESLint + TypeScript + Vercel pipeline', 5, 'DONE'),
        storyRow('INF-02', 'Supabase project, env vars, client wired into Next.js', 2, 'DONE'),
        storyRow('INF-03', 'DB schema — sessions, characters, game_state, event_log with FK and RLS', 3, 'DONE'),
        storyRow('AI-01', '/api/dm-action route — player input → Claude API → structured JSON (SSE streaming)', 5, 'DONE'),
        storyRow('AI-02', 'Wild Sheep Chase DM system prompt — NPC roster, locations, narrator persona', 5, 'DONE'),
        storyRow('AI-03', 'Zod schema for AI response JSON (narration, actions_required, state_changes, dm_rolls)', 3, 'DONE'),
        storyRow('DM-01', 'DM screen at / — scrolling narration log, text input, submit, full round-trip', 5, 'DONE'),
        storyRow('DM-02', 'Loading state + SSE token streaming with typewriter animation', 3, 'DONE'),
        storyRow('DM-03', 'Persist each exchange to event_log; survives page refresh', 3, 'DONE'),
      ]),
      spacer(),
      p('Also shipped beyond original scope:', { bold: true }),
      bullet('Prompt caching (ephemeral cache on system prompt) to reduce API costs'),
      bullet('Full JSON history — prior turns passed as complete JSON assistant messages (not just narration text) to prevent Claude drifting from schema after turn 2–3'),
      spacer(),

      // Sprint 2
      h2('Sprint 2 · Weeks 3–4 · Sessions, Players & Characters  ✓ COMPLETE'),
      p('Goal: 4 players can join a named session, create a character, and see their sheet update in real time.'),
      spacer(),
      storyTable([
        storyRow('SES-01', 'Host creates a named session from DM screen; written to sessions table', 3, 'DONE'),
        storyRow('SES-02', '/join page — list of active sessions; player taps session name', 3, 'DONE'),
        storyRow('SES-03', 'Session slot picker — 4 slots; player claims slot; QR code join flow', 3, 'DONE'),
        storyRow('SES-04', 'Session state (lobby/active) managed by DM; game state persisted to DB', 3, 'DONE'),
        storyRow('CHR-01', 'Step 1 — Class picker: Fighter, Cleric, Rogue, Wizard with card UI', 3, 'DONE'),
        storyRow('CHR-02', 'Step 2 — Race picker: Human, Elf, Dwarf, Halfling; racial bonuses auto-applied', 2, 'DONE'),
        storyRow('CHR-03', 'Step 3 — Stat assignment: +/- swap UI pre-loaded with class archetype defaults', 3, 'DONE'),
        storyRow('CHR-04', 'Step 4 — Name entry + character saved to DB', 2, 'DONE'),
        storyRow('CHR-05', 'Full 5e character computed on save (HP, AC, saves, skills, equipment, spell list)', 5, 'DONE'),
        storyRow('MOB-01', 'Mobile character sheet /player/[id] — HP bar, AC, stats, saves, skills, equipment', 5, 'DONE'),
        storyRow('MOB-02', 'Supabase Realtime on character sheet — HP, conditions, death saves update live', 5, 'DONE'),
        storyRow('MOB-03', 'Party overview sidebar on DM screen — HP bars, conditions per character', 5, 'DONE'),
      ]),
      spacer(),
      p('Also shipped beyond original scope:', { bold: true }),
      bullet('Adventure name dropdown replacing text field — "The Wild Sheep Chase" and "Random Encounter (Combat Test)"'),
      bullet('Random Encounter auto-trigger — fires self-contained combat prompt on session load (no characters needed)'),
      bullet('Stat adjuster uses +/- swap from class archetype defaults (house rule; Sprint 4 backlog has UX copy to explain this)'),
      spacer(),

      // Sprint 3
      h2('Sprint 3 · Weeks 5–6 · Combat Engine  ✓ COMPLETE'),
      p('Goal: Full 5e combat from start to finish — initiative, turns, attacks, saving throws, conditions, death saves — managed by the AI DM.'),
      spacer(),
      storyTable([
        storyRow('CMB-01', 'Combat trigger; players roll own initiative via roll prompts; DM rolls enemies', 3, 'DONE'),
        storyRow('CMB-02', 'Initiative tracker on DM sidebar — HP bar, conditions, current turn highlighted', 5, 'DONE'),
        storyRow('CMB-03', 'Turn progression managed by AI narration; round counter in combat_state', 2, 'DONE'),
        storyRow('CMB-04', 'lib/dice.ts — d4–d100, advantage/disadvantage, modifiers, crits (crypto.getRandomValues)', 3, 'DONE'),
        storyRow('CMB-05', 'Roll prompt modal on DM screen — typewriter completes first, then modal appears', 5, 'DONE'),
        storyRow('CMB-06', 'NPC rolls handled by AI in dm_rolls array; fed back as context', 3, 'DONE'),
        storyRow('CMB-07', 'Action economy: action/bonus action/reaction tracked via state_changes; AI enforces', 3, 'DONE'),
        storyRow('CMB-08', '5e conditions tracked in character state and shown as badges on sheet and sidebar', 5, 'DONE'),
        storyRow('CMB-09', 'Death saves: d20 rolls on mobile when HP = 0; 3 successes = stable, 3 fails = dead', 5, 'DONE'),
        storyRow('CMB-10', 'Combat end: AI sets active: false; transitions back to exploration mode', 3, 'DONE'),
        storyRow('CMB-11', 'Concentration flagged in state; AI prompts CON save on damage', 3, 'DONE'),
        storyRow('CMB-12', 'Spell slots shown on mobile sheet; decremented via state_changes', 5, 'DONE'),
      ]),
      spacer(),
      p('Also shipped beyond original scope (from first playtests):', { bold: true }),
      bullet('Bug bash from first full playtest session — 14 fixes committed in single session'),
      bullet('Drunkenness tracking: drinks_consumed state per character; tolerance thresholds; Buzzed/Drunk/Hammered levels with mechanical effects; shown as icon on party sidebar'),
      bullet('"In the Scene" sidebar hides during active combat — avoids duplicate character listings'),
      bullet('Restart Encounter button for Random Encounter mode'),
      bullet('WSC auto-starts tavern scene on session load — no "start" command needed'),
      bullet('Cursor auto-focuses text input after character selection'),
      bullet('Prompt: collect all initiative rolls before narrating order'),
      bullet('Prompt: roll modal instruction — stop narration at decision point, do not resolve before roll'),
      bullet('Prompt: social interactions (flirt, persuade, deceive) trigger skill roll requests'),
      bullet('Prompt: NPC only added to scene sidebar after introduction in narration'),
      bullet('Prompt: split-party position tracking per character'),
      bullet('Prompt: metaphor frequency dialed back; plain description preferred'),
      bullet('Prompt: spoiler protection — never reveal archmage identity before player discovery'),
      spacer(),
      rule(),

      // ── 4. Sprint 4 (Active)
      h1('4. Sprint 4 · Weeks 7–8 · Gameplay Polish  ▶ ACTIVE'),
      p('Goal: The game feels complete and polished for a real friend group session. Roll modifiers shown in narration, mobile combat actions visible, session persistence works across weeks, and narrative depth is consistent.'),
      spacer(),
      p('Legend:', { bold: true }),
      bullet('NEW = not in original roadmap; added from playtest feedback'),
      bullet('CARRIED = was in original Sprint 4 roadmap'),
      spacer(),
      storyTable([
        storyRow('POL-01', '[NEW] Roll modifier display in narration — "you rolled 12, +2 DEX = 14, that hits" — friendly for new players', 2, 'PENDING'),
        storyRow('POL-02', '[NEW] Spell / action reference panel on mobile during combat — available spells, range, action cost', 5, 'PENDING'),
        storyRow('POL-03', '[NEW] Pop-up clarification when player action is ambiguous (wrong character, unclear intent) — does not interrupt narrative', 3, 'PENDING'),
        storyRow('POL-04', '[NEW] DM checks in with inactive player after N turns — ask in narration what they are doing', 2, 'PENDING'),
        storyRow('POL-05', '[NEW] Stat adjuster UX copy — explain +/- swaps standard array values (not free points); note odd numbers give same modifier as even below', 1, 'PENDING'),
        storyRow('PER-01', '[CARRIED] Auto-save: full game state saved every turn and on End Session (already partially done — verify completeness)', 3, 'PARTIAL'),
        storyRow('PER-02', '[CARRIED] Resume flow: DM reopens session; full event log + game state re-injected into Claude context for coherent narration', 5, 'PENDING'),
        storyRow('PER-03', '[CARRIED] Session history view on DM screen — scrollable prior session log with timestamps', 3, 'PENDING'),
        storyRow('XP-01', '[CARRIED] AI awards XP after combat and milestones; DM can manually adjust', 3, 'PENDING'),
        storyRow('XP-02', '[CARRIED] Level-up flow on mobile: notification when XP threshold reached; guided HP roll + new features', 5, 'PENDING'),
        storyRow('XP-03', '[CARRIED] 5e level-up rules per class: HP, ability score improvements at 4/8/12, class feature unlocks', 5, 'PENDING'),
        storyRow('INV-01', '[CARRIED] AI awards loot in narration; structured item data written to character inventory in DB', 3, 'PENDING'),
        storyRow('INV-02', '[CARRIED] Mobile inventory panel — items with weight, value, description; use/equip with stat effect applied', 4, 'PENDING'),
      ]),
      spacer(),
      rule(),

      // ── 5. Future Sprints
      h1('5. Future Sprints'),

      h2('Sprint 5 · Weeks 9–11 · Notebook, Voice & Multi-player Polish'),
      p('Goal: Players can speak actions aloud. A notebook system lets them click names/locations in narration to save notes. Multi-player balance (inactive player check-ins) feels natural.'),
      spacer(),
      storyTable([
        storyRow('NB-01', '[NEW] Notebook system — names and locations in narration rendered as clickable blue links; click adds to a notebook panel; already-saved items shown in light gray', 5, 'PENDING'),
        storyRow('NB-02', '[NEW] Notebook panel on DM screen — list of saved names/locations with short notes; DM can edit', 3, 'PENDING'),
        storyRow('VOI-01', 'Web Speech API on DM screen; always-on listening with mic toggle; transcription shown before submit', 5, 'PENDING'),
        storyRow('VOI-02', 'Player identification via voice — DM assigns speaker or player says character name', 5, 'PENDING'),
        storyRow('VOI-03', 'Push-to-talk fallback; visual waveform indicator', 3, 'PENDING'),
        storyRow('VOI-04', 'TTS for DM narration — Web Speech API or ElevenLabs; configurable voice', 5, 'PENDING'),
        storyRow('VOI-05', 'Auto-read toggle — narration read aloud after each AI response', 3, 'PENDING'),
        storyRow('MOB-04', 'Mobile roll prompts — when AI requests a roll, dice prompt appears on relevant player mobile; result feeds back to DM screen', 5, 'PENDING'),
        storyRow('MOB-05', 'Visual dice roll animation on mobile; haptic feedback on submit', 2, 'PENDING'),
      ]),
      spacer(),

      h2('Sprint 6 · Weeks 12+ · Polish, Images & Multi-Scenario'),
      p('Goal: App is ready for friends to use. Visually polished, error-resilient, optionally enriched with AI scene images. Multi-scenario opens the game beyond Wild Sheep Chase.'),
      spacer(),
      storyTable([
        storyRow('IMG-01', 'AI scene image at major narrative moments — displayed full-width on DM screen', 3, 'PENDING'),
        storyRow('IMG-02', 'Character portrait generated during creation — shown on mobile sheet header', 3, 'PENDING'),
        storyRow('SCN-01', 'Scenario selection on session creation; Wild Sheep Chase default; extensible for new adventures', 5, 'PENDING'),
        storyRow('SCN-02', 'DM generates homebrew scenario by describing premise; AI builds scenario data as reusable template', 8, 'PENDING'),
        storyRow('XXX-01', '[FUTURE] Adult/mature content mode — for private sessions; requires Anthropic API usage policy compliance; design TBD', 0, 'PENDING'),
        storyRow('SEC-01', 'Passphrase protection on session join page — keeps it private before sharing', 2, 'PENDING'),
        storyRow('POL-10', 'Error handling — graceful fallbacks for Claude API failures, Supabase disconnects, mid-session network drops', 3, 'PENDING'),
        storyRow('POL-11', 'API cost monitoring — token usage per session; alert DM if approaching budget', 2, 'PENDING'),
      ]),
      spacer(),
      rule(),

      // ── 6. Architecture
      h1('6. Architecture & Key File Reference'),
      p('This section is written for Claude Code sessions. Reference it at the start of each session for current system state.'),
      spacer(),

      h2('AI Response Schema'),
      p('Every Claude call returns structured JSON. Validated with Zod at lib/schemas/dm-response.ts.'),
      new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [new TextRun({
          text: '{ "narration": "...", "actions_required": [...], "state_changes": [...], "dm_rolls": [...], "combat_state": { "active": bool, "round": int, "initiative": [...] }, "pending_roll": {...} }',
          size: 18, font: 'Courier New', color: '333333'
        })]
      }),
      spacer(),

      h2('Key Files'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3200, 6160],
        rows: [
          new TableRow({ tableHeader: true, children: [
            cell('File', { fill: DARK, bold: true, width: 3200, color: 'FFFFFF' }),
            cell('Purpose', { fill: DARK, bold: true, width: 6160, color: 'FFFFFF' }),
          ]}),
          new TableRow({ children: [cell('app/page.tsx', { width: 3200 }), cell('DM screen — main game UI, session/log/combat state, typewriter, roll modal, sidebar', { width: 6160 })]}),
          new TableRow({ children: [cell('app/api/dm-action/route.ts', { width: 3200 }), cell('Claude API call — builds messages, streams SSE, parses response, applies state changes. max_tokens: 4096', { width: 6160 })]}),
          new TableRow({ children: [cell('lib/prompts/wild-sheep-chase.ts', { width: 3200 }), cell('Full system prompt — narrator persona, adventure lore, all rules instructions, combat, rolls, drunkenness, spoiler protection', { width: 6160 })]}),
          new TableRow({ children: [cell('lib/schemas/dm-response.ts', { width: 3200 }), cell('Zod schema + parseDMResponse() helper — validates all AI responses at runtime', { width: 6160 })]}),
          new TableRow({ children: [cell('lib/dice.ts', { width: 3200 }), cell('Deterministic dice engine — rollDie, roll(NdS), rollCheck, rollDamage', { width: 6160 })]}),
          new TableRow({ children: [cell('lib/db/apply-state-changes.ts', { width: 3200 }), cell('Applies state_changes array to DB — routes to game_state or characters table by field name', { width: 6160 })]}),
          new TableRow({ children: [cell('lib/db/event-log.ts', { width: 3200 }), cell('getEventLog / appendEventLog — last 6 entries used as Claude conversation history', { width: 6160 })]}),
          new TableRow({ children: [cell('lib/db/game-state.ts', { width: 3200 }), cell('getGameState — returns full game_state JSONB for current session', { width: 6160 })]}),
          new TableRow({ children: [cell('app/character-create/page.tsx', { width: 3200 }), cell('4-step character creation — class, race, stat adjuster (+/- swap with archetype defaults), name', { width: 6160 })]}),
          new TableRow({ children: [cell('app/player/[id]/page.tsx', { width: 3200 }), cell('Mobile character sheet — live via Supabase Realtime; death saves UI when HP=0', { width: 6160 })]}),
          new TableRow({ children: [cell('supabase/migrations/', { width: 3200 }), cell('3 migration files — initial schema, Sprint 2 additions, Sprint 3 combat fields (combat_state, pending_roll, death saves, action economy, drunkenness)', { width: 6160 })]}),
        ]
      }),
      spacer(),

      h2('Database Schema Highlights'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2000, 2000, 5360],
        rows: [
          new TableRow({ tableHeader: true, children: [
            cell('Table', { fill: DARK, bold: true, width: 2000, color: 'FFFFFF' }),
            cell('Key Fields', { fill: DARK, bold: true, width: 2000, color: 'FFFFFF' }),
            cell('Notes', { fill: DARK, bold: true, width: 5360, color: 'FFFFFF' }),
          ]}),
          new TableRow({ children: [cell('sessions', { width: 2000 }), cell('id, name, status, join_token, player_count', { width: 2000 }), cell('status: lobby | active | paused | ended', { width: 5360 })]}),
          new TableRow({ children: [cell('game_state', { width: 2000 }), cell('session_id, state JSONB, combat_state JSONB, pending_roll JSONB', { width: 2000 }), cell('combat_state holds initiative array; pending_roll holds queued roll prompt', { width: 5360 })]}),
          new TableRow({ children: [cell('characters', { width: 2000 }), cell('session_id, slot, name, class, race, stats, hp, max_hp, conditions, drinks_consumed, tolerance_threshold, death saves, action economy', { width: 2000 }), cell('tolerance_threshold is hidden from players; used for drunkenness level calculation', { width: 5360 })]}),
          new TableRow({ children: [cell('event_log', { width: 2000 }), cell('session_id, player_input, ai_response JSONB, created_at', { width: 2000 }), cell('Last 6 entries passed to Claude as conversation history (full JSON, not just narration)', { width: 5360 })]}),
        ]
      }),
      spacer(),

      h2('Important Implementation Notes'),
      bullet('Next.js version is 16 — breaking changes from v14. Read node_modules/next/dist/docs/ before writing any Next.js code.'),
      bullet('Claude history: always pass ai_response as JSON.stringify(entry.ai_response) — NOT just the narration text. Narration-only history causes Claude to drift from JSON schema after 2–3 turns.'),
      bullet('Drunkenness: tolerance_threshold is a hidden character attribute (1–9). Never mention it in narration. drinks_consumed is the running count. Compare to threshold multiples for Buzzed/Drunk/Hammered levels.'),
      bullet('Roll modal timing: pendingRoll is stored in typewriterRef.pendingRoll and fired only after typewriter completes its last character. Do not call setPendingRoll directly from the done handler.'),
      bullet('Production is the only environment (no staging). Push to main = live immediately via Vercel auto-deploy.'),
      bullet('Prompt caching: system prompt uses cache_control: ephemeral. 5-min TTL. Token efficiency matters.'),
      bullet('Repo: https://github.com/fvitak/SpringRidgeDnD  |  Deploy: https://spring-ridge-dnd.vercel.app'),
      spacer(),
      rule(),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 0 },
        children: [new TextRun({ text: 'AI Dungeon Master  ·  Confidential  ·  April 2026  ·  Sprint 4 Active', size: 16, font: 'Arial', color: 'AAAAAA' })]
      }),
    ]
  }]
})

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('DnD_AI_DM_Roadmap_and_Backlog.docx', buf)
  console.log('Written: DnD_AI_DM_Roadmap_and_Backlog.docx')
})
