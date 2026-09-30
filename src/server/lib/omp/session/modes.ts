/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reading the chamber's persisted mode selection back off a session.
 *
 * The extension appends one `custom` entry per mode transition
 * (`chamber-plan-state`, `chamber-goal-state`), so the session's own JSONL is
 * the durable record — and it is the only one that survives a chamber restart,
 * a second chamber instance, and a session the CLI itself has been driving.
 *
 * Reading it is a full parse of the same records the transcript loader already
 * walks (`loadSessionMessages`), so this module shares the lenient JSONL
 * reader rather than opening a second, differently-behaved one. Only the LAST
 * record of each type matters: the entries are a transition log, and the newest
 * one is the state the session was left in.
 */

import { parseJsonlLenient } from '@/shared/lib/omp/session/jsonl';
import { CHAMBER_GOAL_STATE_ENTRY, CHAMBER_PLAN_STATE_ENTRY, type GoalRecord } from '@/shared/lib/omp/mode/types';

export interface PersistedModes {
  plan: boolean;
  goal: boolean;
  /**
   * Whether the goal was being PURSUED when the session stopped — as opposed to
   * merely existing (paused, complete, dropped).
   *
   * The distinction is what decides whether a cold spawn arms automatic
   * continuation. omp pauses an active goal when a thread is resumed
   * unattended, so arming the loop from `goal: true` alone would override that
   * decision and start spending tokens the moment someone opened the tab.
   */
  goalLive: boolean;
  /** The last goal record, when the session carries one. */
  goalRecord: GoalRecord | null;
}

const NONE: PersistedModes = { plan: false, goal: false, goalLive: false, goalRecord: null };

function isGoalRecord(value: unknown): value is GoalRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.objective === 'string' && typeof record.status === 'string';
}

/** A goal counts as "on" only while it is still being pursued. A completed or
 *  dropped goal keeps its record in the transcript but must not make the
 *  composer's toggle read as active — and `budget-limited` stays on, because
 *  that state is explicitly resumable. */
function goalIsLive(status: string | undefined): boolean {
  return status === 'active' || status === 'paused' || status === 'budget-limited';
}

/**
 * Extract the persisted mode selection from a session file's contents.
 *
 * Split from the file read so it is testable without a filesystem.
 */
export function readPersistedModes(body: string): PersistedModes {
  let plan: boolean | undefined;
  let goal: boolean | undefined;
  let goalLive = false;
  let goalRecord: GoalRecord | null = null;

  for (const record of parseJsonlLenient<Record<string, unknown>>(body)) {
    if (record?.type !== 'custom') continue;
    const data = record.data;
    if (!data || typeof data !== 'object') continue;
    const payload = data as Record<string, unknown>;

    if (record.customType === CHAMBER_PLAN_STATE_ENTRY) {
      plan = payload.enabled === true;
      continue;
    }
    if (record.customType === CHAMBER_GOAL_STATE_ENTRY) {
      const candidate = payload.goal;
      goalRecord = isGoalRecord(candidate) ? candidate : null;
      goalLive = payload.enabled === true && goalRecord?.status === 'active';
      goal = payload.enabled === true && goalIsLive(goalRecord?.status);
    }
  }

  if (plan === undefined && goal === undefined) return NONE;
  return { plan: plan === true, goal: goal === true, goalLive, goalRecord };
}

/** Read the persisted selection for a session file, or the empty selection when
 *  the file is missing or unreadable — a session with no history simply has no
 *  modes on. */
export async function loadPersistedModes(filePath: string): Promise<PersistedModes> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return NONE;
    return readPersistedModes(await file.text());
  } catch {
    return NONE;
  }
}
