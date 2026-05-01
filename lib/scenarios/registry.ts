/**
 * Scenario registry — central index of supported adventures.
 *
 * Lets the dm-action route load the right system-prompt builder per session,
 * without hard-importing every adventure module at the call site.
 *
 * Adding a new scenario:
 *   1. Add a row to the `scenarios` table (migration).
 *   2. Drop a builder file under `lib/prompts/`.
 *   3. Import it here and add a SCENARIOS entry.
 */

import { buildSystemPrompt as buildWildSheepChase } from '@/lib/prompts/wild-sheep-chase'
import { buildSystemPrompt as buildBlackthornClan } from '@/lib/prompts/blackthorn-clan'

export type ScenarioId = 'wild-sheep-chase' | 'blackthorn-clan' | 'random-encounter'

export interface ScenarioDefinition {
  id: ScenarioId
  name: string
  playerCountMin: number
  playerCountMax: number
  supportsDateNight: boolean
  /** Builds the system prompt. Receives the merged game state. */
  buildSystemPrompt: (gameState?: unknown) => string
  /** Optional opening kick — used by the host screen to auto-fire the first DM action. */
  openingKick?: string
  /**
   * Optional adventure-module identifier under `lib/adventures/<id>/`. When
   * set, this scenario routes through the `/api/dm-action-v2` module-runner
   * code path (per DECISIONS.md 2026-04-30 "DM pivot..."). When NULL, the
   * scenario stays on the legacy `/api/dm-action` route. Written into
   * `sessions.module_id` at session-create time.
   */
  moduleId?: string
}

export const SCENARIOS: Record<ScenarioId, ScenarioDefinition> = {
  'wild-sheep-chase': {
    id: 'wild-sheep-chase',
    name: 'The Wild Sheep Chase',
    playerCountMin: 2,
    playerCountMax: 4,
    supportsDateNight: false,
    buildSystemPrompt: buildWildSheepChase,
    openingKick: '[DM]: Begin the adventure. Set the scene at The Wooly Flagon tavern in Millhaven.',
  },
  'blackthorn-clan': {
    id: 'blackthorn-clan',
    name: 'Rescue of the Blackthorn Clan',
    playerCountMin: 2,
    playerCountMax: 2,
    supportsDateNight: true,
    buildSystemPrompt: buildBlackthornClan,
    openingKick:
      "[DM]: Open Scenario 1 — from Tarric's perspective.",
    moduleId: 'blackthorn',
  },
  'random-encounter': {
    id: 'random-encounter',
    name: 'Random Encounter (Combat Test)',
    playerCountMin: 2,
    playerCountMax: 4,
    supportsDateNight: false,
    buildSystemPrompt: buildWildSheepChase,
    openingKick:
      '[DM]: Combat test mode. Invent a party of 4 adventurers — give them names and classes (Fighter, Rogue, Cleric, Wizard). They are ambushed on a forest road by 3 bandits and a bandit captain. Roll initiative for all enemies. Request initiative rolls from each player character. Begin combat.',
  },
}

/** Resolve a scenario by id, with a safe fallback to WSC for old sessions. */
export function getScenario(id: string | null | undefined): ScenarioDefinition {
  if (id && id in SCENARIOS) return SCENARIOS[id as ScenarioId]
  return SCENARIOS['wild-sheep-chase']
}

/** Resolve a scenario by display name, used as a backup when scenario_id is missing. */
export function getScenarioByName(name: string | null | undefined): ScenarioDefinition {
  if (!name) return SCENARIOS['wild-sheep-chase']
  for (const scen of Object.values(SCENARIOS)) {
    if (scen.name === name) return scen
  }
  return SCENARIOS['wild-sheep-chase']
}
