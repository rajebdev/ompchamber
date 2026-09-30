/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Types, entry names and notice markers the chamber's mode extension shares
 * with the console.
 *
 * Deliberately a SECOND copy of `src/shared/lib/omp/mode/types.ts` rather than
 * an import of it. This directory is loaded by the omp CHILD process with `-e`,
 * outside the chamber's module graph: `@/` is the chamber's tsconfig alias and
 * resolving it from an extension would couple the child's module loader to the
 * host's path mapping. Relative imports between extension files are verified to
 * work (`-e <dir>/index.ts` resolves `./session` from the extension's own
 * directory), so the extension stays self-contained plain TypeScript — the one
 * exception is the TEST's import of the shared module, which runs in the
 * chamber's own test process and therefore may use a relative path out.
 *
 * `protocol.test.ts` asserts the two copies agree, so a constant added on one
 * side and not the other fails the suite instead of silently disagreeing.
 */

export type GoalStatus = 'active' | 'paused' | 'budget-limited' | 'complete' | 'dropped';

export interface GoalRecord {
  id: string;
  objective: string;
  status: GoalStatus;
  tokenBudget?: number;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export const PLAN_REVIEW_CHOICES = [
  'Approve and execute',
  'Approve and compact context',
  'Approve and keep context',
  'Refine plan',
  'Save and quit',
] as const;

/** Why the auto-continuation loop stood down. `budget` and `max-turns` are the
 *  two the child enforces; the rest come from the chamber's auditor. */
export type GoalContinuationStop = 'budget' | 'max-turns' | 'blocked' | 'complete' | 'audit-failed';

/** One automatic goal turn, as the loop reports and persists it. */
export interface GoalContinuation {
  /** Automatic turns taken for this goal, 1-based. */
  turn: number;
  /** The process's ceiling for one goal (`CHAMBER_GOAL_MAX_TURNS`). */
  maxTurns: number;
  stopped?: GoalContinuationStop;
}

export const CHAMBER_GOAL_STATE_ENTRY = 'chamber-goal-state';
export const CHAMBER_PLAN_STATE_ENTRY = 'chamber-plan-state';
export const CHAMBER_MODE_COMMAND = 'chamber-mode';
export const CHAMBER_MODES_ENV = 'CHAMBER_MODES';

/** Notice markers the extension emits and the chamber parses. Each is a prefix
 *  followed by a JSON payload; an unparsed notice still renders as a notice, so
 *  a version skew degrades to a readable line rather than silence. */
export const CHAMBER_PLAN_STATE_MARKER = 'CHAMBER_PLAN_STATE:';
export const CHAMBER_GOAL_STATE_MARKER = 'CHAMBER_GOAL_STATE:';
export const CHAMBER_MODE_STATE_MARKER = 'CHAMBER_MODE_STATE:';
export const CHAMBER_MODE_ERROR_MARKER = 'CHAMBER_MODE_ERROR:';
export const CHAMBER_PLAN_PROPOSAL_MARKER = 'CHAMBER_PLAN_PROPOSAL:';
export const CHAMBER_PLAN_DECISION_MARKER = 'CHAMBER_PLAN_DECISION:';
export const CHAMBER_PLAN_SAVED_MARKER = 'CHAMBER_PLAN_SAVED:';
export const CHAMBER_GOAL_CONTINUATION_MARKER = 'CHAMBER_GOAL_CONTINUATION:';
export const CHAMBER_GOAL_EVALUATING_MARKER = 'CHAMBER_GOAL_EVALUATING:';
