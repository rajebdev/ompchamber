/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The wrapper's mirror of omp's plan/goal modes.
 *
 * Two facts make a mirror necessary rather than a passthrough:
 *
 *  - `get_state` does not carry either mode, so a reattaching client (a reload,
 *    a second tab) has nothing to read the mode from;
 *  - and the mode is not a client preference — it decides whether the child is
 *    running a goal the chamber must keep feeding, and whether a plan is parked
 *    waiting for a human.
 *
 * The mirror is fed by omp's own `goal_updated` session event, which is
 * authoritative: whatever the chamber last asked for, the frame reports what
 * the child actually did.
 */

import type { AgentEvent } from '@/server/lib/omp/rpc/constants';

/** Statuses that mean the goal is still being pursued. `budget-limited` counts:
 *  it is a resumable state omp returns to `active` when the budget is raised. */
const LIVE_STATUSES = new Set(['active', 'budget-limited']);

export class ModeMirror {
  /** True only while a goal is live. A paused or completed goal keeps its
   *  record in the transcript but is not work in progress. */
  goalEnabled = false;
  goalStatus: string | undefined;

  /** Apply one `goal_updated` frame. */
  observe(event: AgentEvent): void {
    const state = event.state as { enabled?: boolean; goal?: { status?: string } } | undefined;
    const goal = event.goal as { status?: string } | null | undefined;
    const status = state?.goal?.status ?? goal?.status;
    this.goalStatus = status;
    this.goalEnabled = state?.enabled === true && status !== undefined && LIVE_STATUSES.has(status);
  }
}
