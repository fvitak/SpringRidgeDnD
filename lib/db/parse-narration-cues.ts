/**
 * POL-15-21-22c — Server-side narration parser.
 *
 * Tier-1 patterns (auto-emit) and tier-2 patterns (warn only) extracted
 * from AI narration. The apply step calls `parseNarrationCues` after the
 * AI returns, then splices tier-1 cues into `state_changes` whenever no
 * matching change was already emitted, and emits a console.warn for tier-2
 * cues so Frank can survey drift in production logs.
 *
 * Pure function — no DB writes from inside the parser. The apply path
 * owns persistence. See `apply-state-changes.ts → applyStateChangesWithCues`.
 *
 * Per the 2026-05-03 ADR ("server is the bookkeeper"):
 *   - Tier 1 = unambiguous quantified events: "X takes N damage", explicit
 *     death cues with a name + prior damage, named PC attacks/casts.
 *   - Tier 2 = ambiguous events: spell-slot inference, movement, vague
 *     condition cues without an explicit condition word.
 *   - Tier 3 = don't try.
 *
 * The Charm Person playtest case is intentionally tier-2 because the AI's
 * narration was cooperative-prose without an explicit condition word. The
 * fix for that case is the prompt rule (POL-15-21-22d). The parser does
 * not backstop ambiguity.
 *
 * Test corpus: scripts/test-narration-parser.ts.
 */

export type CueField =
  | 'hp'
  | 'hp_delta'
  | 'condition'
  | 'spell_slots'
  | 'action_used'
  | 'movement_used'

export interface ParsedCue {
  /** 1 = auto-emit by the apply step. 2 = warn only. */
  tier: 1 | 2
  field: CueField
  /** Entity name extracted from narration (case as found). */
  entity: string
  /** Value to emit if tier 1. `null` for tier 2 (warn-only). */
  value: unknown
  /** 0..1 — purely advisory; gate is the tier, not the score. */
  confidence: number
  /** Human-readable explanation surfaced in logs. */
  reason: string
  /** Substring of `narration` that matched. Useful for warn logs. */
  source_text: string
}

export interface KnownEntities {
  /** PC names (case as stored in `characters.character_name`). */
  pcs: string[]
  /** NPC names from `combat_state.initiative[]` (the active combat). */
  npcs: string[]
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Build a regex-safe alternation of names. Empty arrays produce a
 * never-match pattern so the parser still runs cleanly.
 */
function escapeForRegex(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildNameAlternation(names: string[]): string | null {
  const cleaned = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    // Sort longer names first so "Briar the Wolf" matches before "Briar".
    .sort((a, b) => b.length - a.length)
  if (cleaned.length === 0) return null
  return cleaned.map(escapeForRegex).join('|')
}

/**
 * Normalize-compare two entity strings (case-insensitive trim).
 */
function nameMatches(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Resolve a name found in narration back to its canonical form (PC or NPC
 * name as stored). Returns null if not in `knownEntities`.
 */
function resolveCanonical(
  found: string,
  knownEntities: KnownEntities,
): { canonical: string; isPC: boolean } | null {
  for (const pc of knownEntities.pcs) {
    if (nameMatches(found, pc)) return { canonical: pc, isPC: true }
  }
  for (const npc of knownEntities.npcs) {
    if (nameMatches(found, npc)) return { canonical: npc, isPC: false }
  }
  return null
}

// ---------------------------------------------------------------------------
// Tier-1 patterns
// ---------------------------------------------------------------------------

/**
 * "X takes N damage", "N damage to X", "X takes N cold damage", etc.
 * Returns one cue per match.
 *
 * We deliberately use the union of both "subject takes N" and "N to X"
 * shapes because the playtest narration mixes them ("Arnie takes 7 damage"
 * and "deals 6 damage to Arnie"). The narration is high-fidelity for
 * damage numbers — this is the safe place to be aggressive.
 */
function extractDamageCues(narration: string, entities: KnownEntities): ParsedCue[] {
  const cues: ParsedCue[] = []
  const namePattern = buildNameAlternation([...entities.pcs, ...entities.npcs])
  if (!namePattern) return cues

  // "<Name> takes <N> [adjective] damage|dmg|points"
  // - allows optional damage-type adjective before "damage" ("cold damage", "fire damage")
  // - the adjective is bounded to a single word for safety
  const subjectFirst = new RegExp(
    `\\b(${namePattern})\\s+takes?\\s+(\\d+)(?:\\s+\\w+)?\\s+(?:damage|dmg|points?)\\b`,
    'gi',
  )
  for (const match of narration.matchAll(subjectFirst)) {
    const found = match[1]
    const amount = Number.parseInt(match[2], 10)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const resolved = resolveCanonical(found, entities)
    if (!resolved) continue
    cues.push({
      tier: 1,
      field: 'hp_delta',
      entity: resolved.canonical,
      value: -amount,
      confidence: 0.95,
      reason: `damage cue: "${found} takes ${amount} damage"`,
      source_text: match[0],
    })
  }

  // "deals <N> damage to <Name>" / "<N> damage to <Name>"
  const targetLast = new RegExp(
    `\\b(\\d+)(?:\\s+\\w+)?\\s+(?:damage|dmg|points?)\\s+(?:to|on)\\s+(${namePattern})\\b`,
    'gi',
  )
  for (const match of narration.matchAll(targetLast)) {
    const amount = Number.parseInt(match[1], 10)
    const found = match[2]
    if (!Number.isFinite(amount) || amount <= 0) continue
    const resolved = resolveCanonical(found, entities)
    if (!resolved) continue
    // Don't double-emit: skip if subjectFirst already produced a cue for
    // the same source_text or for an overlapping window.
    const overlap = cues.some(
      (c) =>
        c.field === 'hp_delta' &&
        nameMatches(c.entity, resolved.canonical) &&
        c.value === -amount &&
        narration.indexOf(c.source_text) <= match.index! &&
        match.index! < narration.indexOf(c.source_text) + c.source_text.length,
    )
    if (overlap) continue
    cues.push({
      tier: 1,
      field: 'hp_delta',
      entity: resolved.canonical,
      value: -amount,
      confidence: 0.9,
      reason: `damage cue: "${amount} damage to ${found}"`,
      source_text: match[0],
    })
  }

  return cues
}

/**
 * Death cues with an explicit name. Emits BOTH a condition='dead' cue
 * AND an hp=0 cue.
 *
 * Per the brief, tier-1 death requires the name AND prior damage in the
 * same response. We approximate "prior damage" as: any damage cue exists
 * for the same entity earlier in the text. The Arnie kill in the playtest
 * is the canonical case ("Tarric drives the shortsword up...into Arnie's
 * midsection. The man folds over the sill...slides back inside and hits
 * the floor in a heap.") — this returns 2 cues for Arnie.
 *
 * Bare death-verb without a named subject is tier-2 (handled below).
 */
function extractDeathCues(
  narration: string,
  entities: KnownEntities,
  damageCues: ParsedCue[],
): ParsedCue[] {
  const cues: ParsedCue[] = []
  const namePattern = buildNameAlternation([...entities.pcs, ...entities.npcs])
  if (!namePattern) return cues

  // Death verbs allowed for tier-1 auto-emit. Tightly scoped — anything
  // ambiguous ("falls back", "drops his sword") would over-trigger.
  const deathVerbs = [
    'is dead',
    'is slain',
    'dies',
    'falls dead',
    'drops dead',
    'crumples',
    'hits the floor in a heap',
    'hits the floor',
    'slumps to the floor',
    'collapses',
    'drops',
    'falls',
  ]
  const verbAlt = deathVerbs.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')

  // "<Name> ... <death verb>" — within 80 chars to keep matches tight.
  const re = new RegExp(`\\b(${namePattern})\\b[^.!?\\n]{0,80}?(${verbAlt})\\b`, 'gi')
  for (const match of narration.matchAll(re)) {
    const found = match[1]
    const resolved = resolveCanonical(found, entities)
    if (!resolved) continue

    const verb = match[2].toLowerCase()
    // Bare "drops" / "falls" — only tier-1 if there's a prior damage cue
    // for the same entity. Otherwise it could be flavor ("falls back",
    // "drops his sword").
    const isAmbiguousVerb = verb === 'drops' || verb === 'falls'
    const hasPriorDamage = damageCues.some((c) => nameMatches(c.entity, resolved.canonical))
    if (isAmbiguousVerb && !hasPriorDamage) continue

    cues.push({
      tier: 1,
      field: 'condition',
      entity: resolved.canonical,
      value: 'dead',
      confidence: hasPriorDamage ? 0.95 : 0.85,
      reason: `death cue: "${found} ${verb}"${hasPriorDamage ? ' (prior damage in same response)' : ''}`,
      source_text: match[0],
    })
    cues.push({
      tier: 1,
      field: 'hp',
      entity: resolved.canonical,
      value: 0,
      confidence: hasPriorDamage ? 0.95 : 0.85,
      reason: `death cue (hp=0): "${found} ${verb}"`,
      source_text: match[0],
    })
  }

  return cues
}

/**
 * Action consumed by a named PC. PCs only — NPCs use the explicit
 * `advance_to_next_turn` flag.
 *
 * Verbs limited to ones that consume an action in 5e: attacks, casts,
 * throws, swings, fires, shoots. We do NOT match "moves" or "steps" —
 * those are movement (tier 2).
 */
function extractActionUsedCues(narration: string, entities: KnownEntities): ParsedCue[] {
  const cues: ParsedCue[] = []
  const pcPattern = buildNameAlternation(entities.pcs)
  if (!pcPattern) return cues

  // Common action verbs. Past + present forms.
  const verbs = [
    'attacks',
    'attacked',
    'casts',
    'cast',
    'throws',
    'threw',
    'swings',
    'swung',
    'fires',
    'fired',
    'shoots',
    'shot',
    'strikes',
    'struck',
    'lunges',
    'lunged',
    'stabs',
    'stabbed',
    'slashes',
    'slashed',
  ]
  const verbAlt = verbs.join('|')

  const re = new RegExp(`\\b(${pcPattern})\\s+(${verbAlt})\\b`, 'gi')
  for (const match of narration.matchAll(re)) {
    const found = match[1]
    const verb = match[2].toLowerCase()
    const resolved = resolveCanonical(found, entities)
    if (!resolved || !resolved.isPC) continue

    cues.push({
      tier: 1,
      field: 'action_used',
      entity: resolved.canonical,
      value: true,
      confidence: 0.85,
      reason: `action cue: "${found} ${verb}"`,
      source_text: match[0],
    })
  }

  // Deduplicate: one action_used per PC per response (max).
  const seen = new Set<string>()
  return cues.filter((c) => {
    const key = c.entity.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ---------------------------------------------------------------------------
// Tier-2 patterns (warn only)
// ---------------------------------------------------------------------------

/**
 * Spell-slot consumption inferred from "casts <SpellWord>". We cannot
 * reliably know slot level (upcast / which slot), so this is warn only.
 *
 * Matches "<Name> casts <Word>" where Word starts with a capital letter
 * (stand-in for a spell name). Doesn't try to validate against a list.
 */
function extractSpellSlotCues(narration: string, entities: KnownEntities): ParsedCue[] {
  const cues: ParsedCue[] = []
  const pcPattern = buildNameAlternation(entities.pcs)
  if (!pcPattern) return cues

  const re = new RegExp(`\\b(${pcPattern})\\s+casts?\\s+([A-Z][a-zA-Z'\\- ]{2,40})`, 'g')
  for (const match of narration.matchAll(re)) {
    const found = match[1]
    const spell = match[2].trim()
    const resolved = resolveCanonical(found, entities)
    if (!resolved || !resolved.isPC) continue

    cues.push({
      tier: 2,
      field: 'spell_slots',
      entity: resolved.canonical,
      value: null,
      confidence: 0.5,
      reason: `spell-slot cue: "${found} casts ${spell}" — slot level ambiguous, no auto-emit`,
      source_text: match[0],
    })
  }

  return cues
}

/**
 * Movement narration. Direction and distance are too ambiguous to
 * auto-emit. Warn only.
 */
function extractMovementCues(narration: string, entities: KnownEntities): ParsedCue[] {
  const cues: ParsedCue[] = []
  const namePattern = buildNameAlternation([...entities.pcs, ...entities.npcs])
  if (!namePattern) return cues

  const verbs = [
    'closes the distance',
    'steps back',
    'steps forward',
    'moves to',
    'moves toward',
    'moves away',
    'walks to',
    'runs to',
    'sprints to',
    'rushes to',
    'dashes to',
    'retreats',
  ]
  const verbAlt = verbs.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')

  const re = new RegExp(`\\b(${namePattern})\\s+(${verbAlt})\\b`, 'gi')
  for (const match of narration.matchAll(re)) {
    const found = match[1]
    const verb = match[2].toLowerCase()
    const resolved = resolveCanonical(found, entities)
    if (!resolved) continue

    cues.push({
      tier: 2,
      field: 'movement_used',
      entity: resolved.canonical,
      value: null,
      confidence: 0.4,
      reason: `movement cue: "${found} ${verb}" — distance ambiguous, no auto-emit`,
      source_text: match[0],
    })
  }

  return cues
}

/**
 * Bare condition-style cues — the bandit "goes down", "she goes still",
 * "his sword arm drops". No prior damage anchor, no explicit name in the
 * tier-1 death verb set. Warn only.
 *
 * We catch bare "the bandit goes down" — sounds like death but lacks the
 * name+verb tightness of tier-1. The state-truth block on next turn
 * forces reconciliation.
 */
function extractAmbiguousConditionCues(
  narration: string,
  entities: KnownEntities,
): ParsedCue[] {
  const cues: ParsedCue[] = []

  const namePattern = buildNameAlternation([...entities.pcs, ...entities.npcs])
  if (!namePattern) return cues

  // Phrases that suggest a condition but where we can't tell which one.
  const phrases = [
    'goes down',
    'goes still',
    'goes limp',
    'goes silent',
    "stops moving",
  ]
  const phraseAlt = phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')

  const re = new RegExp(`\\b(${namePattern})\\s+(${phraseAlt})\\b`, 'gi')
  for (const match of narration.matchAll(re)) {
    const found = match[1]
    const phrase = match[2].toLowerCase()
    const resolved = resolveCanonical(found, entities)
    if (!resolved) continue

    cues.push({
      tier: 2,
      field: 'condition',
      entity: resolved.canonical,
      value: null,
      confidence: 0.45,
      reason: `ambiguous condition cue: "${found} ${phrase}" — no explicit condition word`,
      source_text: match[0],
    })
  }

  return cues
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Scan AI narration for high-confidence (tier 1) and medium-confidence
 * (tier 2) cues. Pure function — no DB I/O. The apply step splices tier-1
 * cues into the state_changes list when no matching change was already
 * emitted, and console.warn's tier-2 cues for drift surveillance.
 *
 * Order of cue extraction matters slightly:
 *   1. Damage cues come first because death cues consult them to decide
 *      whether an ambiguous death verb ("drops") qualifies for tier 1.
 *   2. Death cues second.
 *   3. Action/spell/movement/ambiguous-condition cues are independent.
 */
export function parseNarrationCues(
  narration: string,
  knownEntities: KnownEntities,
): ParsedCue[] {
  if (typeof narration !== 'string' || narration.trim().length === 0) return []
  if (
    !Array.isArray(knownEntities.pcs) ||
    !Array.isArray(knownEntities.npcs)
  ) {
    return []
  }

  const damage = extractDamageCues(narration, knownEntities)
  const death = extractDeathCues(narration, knownEntities, damage)
  const action = extractActionUsedCues(narration, knownEntities)
  const spell = extractSpellSlotCues(narration, knownEntities)
  const movement = extractMovementCues(narration, knownEntities)
  const ambiguous = extractAmbiguousConditionCues(narration, knownEntities)

  return [...damage, ...death, ...action, ...spell, ...movement, ...ambiguous]
}

// ---------------------------------------------------------------------------
// Helpers used by apply-state-changes.ts to dedupe against AI-emitted changes.
// ---------------------------------------------------------------------------

/**
 * True if `emittedChanges` already contains a state_change covering the
 * same entity+field combination as `cue`. Used by the apply step to skip
 * auto-emit when the AI already did the right thing.
 *
 * Special cases:
 *   - cue.field 'hp_delta' is satisfied by an AI-emitted 'hp' (the AI gave
 *     us a post-damage absolute, no need to apply the delta).
 *   - cue.field 'hp' (from death cues) is satisfied by an AI-emitted 'hp'
 *     for the same entity, regardless of value.
 *   - cue.field 'condition' is satisfied by ANY AI-emitted condition for
 *     the same entity (the AI's specific condition wins).
 */
export function isCueAlreadyEmitted(
  cue: ParsedCue,
  emittedChanges: Array<{ entity: string; field: string; value: unknown }>,
): boolean {
  for (const ec of emittedChanges) {
    if (!nameMatches(ec.entity, cue.entity)) continue
    if (cue.field === 'hp_delta') {
      if (ec.field === 'hp' || ec.field === 'hp_delta') return true
    } else if (cue.field === ec.field) {
      return true
    }
  }
  return false
}
