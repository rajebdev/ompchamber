/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parsing the chamber mode extension's notice markers.
 *
 * The extension reports every outcome through `ctx.ui.notify` with a prefixed
 * JSON payload (`CHAMBER_PLAN_STATE:{…}`), because that is the only channel
 * that reaches the chamber from inside the child without inventing a frame
 * type. Everything else about the transport is already handled: the notice
 * arrives on the same stream the transcript uses, and the fold decides whether
 * it becomes a marker or a visible notice row.
 *
 * An unrecognised or malformed marker is NOT a marker — it falls through to a
 * normal notice, so a version skew shows the user a readable line instead of
 * swallowing the message.
 */

import {
  CHAMBER_GOAL_CONTINUATION_MARKER,
  CHAMBER_GOAL_STATE_MARKER,
  CHAMBER_MODE_ERROR_MARKER,
  CHAMBER_MODE_STATE_MARKER,
  CHAMBER_PLAN_DECISION_MARKER,
  CHAMBER_PLAN_PROPOSAL_MARKER,
  CHAMBER_PLAN_SAVED_MARKER,
  CHAMBER_PLAN_STATE_MARKER,
  type GoalRecord,
} from '@/shared/lib/omp/mode/types';

/** Every marker the extension emits, longest-first so a prefix of another
 *  marker can never win the match. */
const MARKERS = [
  CHAMBER_PLAN_PROPOSAL_MARKER,
  CHAMBER_PLAN_DECISION_MARKER,
  CHAMBER_GOAL_CONTINUATION_MARKER,
  CHAMBER_PLAN_STATE_MARKER,
  CHAMBER_GOAL_STATE_MARKER,
  CHAMBER_MODE_STATE_MARKER,
  CHAMBER_PLAN_SAVED_MARKER,
  CHAMBER_MODE_ERROR_MARKER,
] as const;

export type ChamberMarker = (typeof MARKERS)[number];

export interface ParsedMarker {
  marker: ChamberMarker;
  payload: Record<string, unknown>;
}

/** Parse a notice message into a marker, or null when it is an ordinary
 *  notice (or a marker whose payload does not parse). */
export function parseChamberMarker(message: string): ParsedMarker | null {
  for (const marker of MARKERS) {
    if (!message.startsWith(marker)) continue;
    const raw = message.slice(marker.length).trim();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { marker, payload: parsed as Record<string, unknown> };
      }
    } catch {
      // A truncated payload is not a marker; render it as a notice.
    }
    return null;
  }
  return null;
}

/** The goal record a `CHAMBER_GOAL_STATE` payload carries, when it carries one. */
export function goalRecordFromMarker(payload: Record<string, unknown>): GoalRecord | null {
  const goal = payload.goal;
  if (!goal || typeof goal !== 'object' || Array.isArray(goal)) return null;
  const record = goal as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.objective !== 'string') return null;
  return record as unknown as GoalRecord;
}

/** Whether a `CHAMBER_GOAL_STATE` payload reports the mode as on. */
export function goalEnabledFromMarker(payload: Record<string, unknown>): boolean {
  return payload.enabled === true;
}
