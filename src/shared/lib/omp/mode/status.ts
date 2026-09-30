/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which goal statuses are still the composer's business.
 *
 * Status is the durable answer, and the `enabled` flag is not: omp clears it
 * when a goal is PAUSED (`status: "paused"`, `enabled: false`), so a composer
 * that keys off `enabled` loses a goal that still exists — the strip vanished,
 * the toolbar's Goal button read as off, and the modal offered to CREATE a goal
 * over the paused one. Measured against the live child: pausing reported
 * `goal: false` with `goalRecord.status: "paused"`.
 *
 * `complete` and `dropped` are excluded on purpose: they keep their record in
 * the transcript — that is what the timeline's goal card is for — but the chat
 * is no longer in goal mode.
 */

import type { GoalStatus } from '@/shared/lib/omp/mode/types';

export function isGoalOpen(status: GoalStatus): boolean {
  return status === 'active' || status === 'paused' || status === 'budget-limited';
}
