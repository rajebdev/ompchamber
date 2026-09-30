/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Whether a goal turn should be re-opened automatically.
 *
 * The TUI's `#scheduleGoalContinuation` is interactive-only, so `--mode rpc-ui`
 * never continues a goal on its own — Goal mode would run exactly one turn and
 * stop, which is not what the feature promises. The LOOP therefore lives inside
 * the child (see `extensions/chamber-goal.ts`), because only the extension can
 * send a HIDDEN turn: an RPC `prompt` from here would arrive as a visible user
 * message and leave a "Continue active goal." bubble on every iteration.
 *
 * This module is the DECISION half, kept on the chamber side so the rules are
 * testable and so a future caller (a server-driven loop, a settings toggle) has
 * one place to ask. The extension applies the same three guards independently,
 * because it is the process that has to stop when the chamber is gone.
 */

export type ContinuationStopReason =
  | 'active'
  | 'auto-continue-disabled'
  | 'not-active'
  | 'budget-exhausted'
  | 'max-turns'
  | 'user-stopped';

export interface ContinuationInput {
  /** omp's `GoalModeState.enabled`. */
  enabled: boolean;
  status: string;
  tokensUsed: number;
  tokenBudget?: number;
  /** Automatic turns already taken for THIS goal. */
  turns: number;
  maxTurns: number;
  /** The spawn flag: goal mode was part of the persisted selection. */
  autoContinue: boolean;
  /** The operator pressed Stop on the turn that just ended. */
  userStopped: boolean;
}

export interface ContinuationDecision {
  continue: boolean;
  reason: ContinuationStopReason;
}

/** The guard chain, in precedence order. Stop first: it is the operator's own
 *  instruction, and re-opening the turn they just ended would make the button a
 *  lie. Then the mode flags, then the two ceilings — the token budget first,
 *  because it is the one the operator set for this goal. */
export function continuationDecision(input: ContinuationInput): ContinuationDecision {
  if (input.userStopped) return { continue: false, reason: 'user-stopped' };
  if (!input.autoContinue) return { continue: false, reason: 'auto-continue-disabled' };
  if (!input.enabled || input.status !== 'active') return { continue: false, reason: 'not-active' };
  if (input.tokenBudget !== undefined && input.tokensUsed >= input.tokenBudget) {
    return { continue: false, reason: 'budget-exhausted' };
  }
  if (input.turns >= input.maxTurns) return { continue: false, reason: 'max-turns' };
  return { continue: true, reason: 'active' };
}
