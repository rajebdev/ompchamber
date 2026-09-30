/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Handing a chamber mode signal to whoever listens for it.
 *
 * Two producers reach the same consumer: the extension's notice markers (which
 * the fold parses out of `extension_ui_request` frames) and the chamber's own
 * auditor frames (`goal_evaluating`). Both are composer state rather than
 * conversation, so neither goes through the timeline's callbacks — they are
 * re-dispatched as a scoped window event, the same shape the subagent frames
 * use, and the mode hook subscribes once.
 */

import { CHAMBER_MODE_EVENT } from '@/shared/lib/omp/mode/types';

export interface ChamberModeSignal {
  marker: string;
  payload: Record<string, unknown>;
}

export function emitChamberModeSignal(sessionId: string | undefined, signal: ChamberModeSignal): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAMBER_MODE_EVENT, { detail: { sessionId, marker: signal } }));
}
