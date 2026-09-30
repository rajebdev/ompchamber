/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plan- and Goal-mode state shared by both ends of the RPC bridge.
 *
 * omp owns both modes internally (`PlanModeState` / `GoalModeState`) but exposes
 * neither over RPC: the command union has no plan/goal verb, `mode_change`
 * entries are not restored by `--mode rpc-ui`, and `plan.defaultOnStartup` is
 * read by the interactive TUI alone. The chamber therefore drives both modes
 * through a chamber-owned extension (`extensions/chamber-modes/`, loaded with `-e`) that
 * reaches the live `AgentSession`, and mirrors the result back here.
 *
 * These types are the mirror. `goal_updated` is the one frame omp emits on its
 * own (session event, forwarded by the RPC host), so it is authoritative:
 * whatever the chamber last requested, the record from that frame wins.
 */

/** Goal status vocabulary, verbatim from omp's `Goal.status`. */
export type GoalStatus = 'active' | 'paused' | 'budget-limited' | 'complete' | 'dropped';

/** omp's goal record (`GoalModeState.goal`), field for field. */
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

/** The state half of omp's `goal_updated` frame. */
export interface GoalModeState {
  enabled: boolean;
  mode: 'active' | 'exiting';
  reason?: 'completed';
  goal: GoalRecord;
}

/**
 * One automatic goal turn, as the chamber's goal driver reports it.
 *
 * The chamber asks its AUDITOR after every turn and then tells the child to
 * open the next one; the child emits this with `CHAMBER_GOAL_CONTINUATION:`
 * right BEFORE it opens that turn — so the run that starts afterwards IS the
 * turn this describes, which is what lets the strip say "turn 3 of 25" without
 * inventing a state omp does not have.
 */
export interface GoalContinuation {
  /** Automatic turns taken for THIS goal, 1-based (counted in the child). */
  turn: number;
  /** The child's ceiling for one goal (`CHAMBER_GOAL_MAX_TURNS`, default 25). */
  maxTurns: number;
  /** Set once the loop has stood down, with the reason it did. */
  stopped?: GoalContinuationStop;
}

/**
 * Why the automatic continuation loop stood down, as one list so the readers
 * (markers, the persisted record) can validate against it instead of trusting a
 * string from the wire.
 *
 * `budget` and `max-turns` are enforced inside the child; `blocked`,
 * `complete` and `audit-failed` come from the chamber's auditor (the working
 * agent's own report, judged independently).
 */
export const GOAL_CONTINUATION_STOPS = ['budget', 'max-turns', 'blocked', 'complete', 'audit-failed'] as const;

export type GoalContinuationStop = (typeof GOAL_CONTINUATION_STOPS)[number];

/** omp's plan-mode state (`PlanModeState`). */
export interface PlanModeState {
  enabled: boolean;
  planFilePath: string;
  workflow?: 'parallel' | 'iterative';
  reentry?: boolean;
}

/** The five review choices the TUI offers, in its own order. */
export const PLAN_REVIEW_CHOICES = [
  'Approve and execute',
  'Approve and compact context',
  'Approve and keep context',
  'Refine plan',
  'Save and quit',
] as const;

/** A plan the model submitted through `xd://propose`, awaiting the operator. */
export interface PlanProposal {
  title: string;
  planFilePath: string;
  planContent: string;
}

/** Per-session mode flags the chamber persists and re-applies on every spawn. */
export interface ChamberModeSelection {
  plan: boolean;
  goal: boolean;
  /** Whether the goal was being PURSUED (as opposed to merely existing). Only
   *  a live goal arms automatic continuation on a cold spawn: omp pauses an
   *  active goal when a thread is resumed unattended, and overriding that would
   *  start spending tokens the moment the session is opened. */
  goalLive?: boolean;
}

export const EMPTY_MODE_SELECTION: ChamberModeSelection = { plan: false, goal: false };

/** Custom-entry type the extension appends so a reload can recover the last
 *  known goal without re-reading omp's own `mode_change` records (which rpc-ui
 *  never restores). Mirrors the constant in `extensions/chamber-modes/protocol.ts`. */
export const CHAMBER_GOAL_STATE_ENTRY = 'chamber-goal-state';

/** Custom-entry type carrying the plan-mode flag + plan path. */
export const CHAMBER_PLAN_STATE_ENTRY = 'chamber-plan-state';

/** Environment variable the spawn path uses to seed both modes. */
export const CHAMBER_MODES_ENV = 'CHAMBER_MODES';

/** Chamber-owned slash command the extension registers. */
export const CHAMBER_MODE_COMMAND = 'chamber-mode';

/** Notice markers the extension emits and the chamber parses. Each is a prefix
 *  followed by a JSON payload; an unparsed notice still renders as a notice, so
 *  a version skew degrades to a readable line rather than silence. Kept in sync
 *  with `extensions/chamber-state.ts` by `mode-types.test.ts`. */
export const CHAMBER_PLAN_STATE_MARKER = 'CHAMBER_PLAN_STATE:';
export const CHAMBER_GOAL_STATE_MARKER = 'CHAMBER_GOAL_STATE:';
export const CHAMBER_MODE_STATE_MARKER = 'CHAMBER_MODE_STATE:';
export const CHAMBER_MODE_ERROR_MARKER = 'CHAMBER_MODE_ERROR:';
export const CHAMBER_PLAN_PROPOSAL_MARKER = 'CHAMBER_PLAN_PROPOSAL:';
export const CHAMBER_PLAN_DECISION_MARKER = 'CHAMBER_PLAN_DECISION:';
export const CHAMBER_PLAN_SAVED_MARKER = 'CHAMBER_PLAN_SAVED:';
export const CHAMBER_GOAL_CONTINUATION_MARKER = 'CHAMBER_GOAL_CONTINUATION:';
/** Emitted while the child's loop is deciding whether to open another turn
 *  (`{evaluating: true}` in, `{evaluating: false}` out). The decision itself is
 *  a synchronous guard chain with no other frame, so this is what a spinner can
 *  hang off — the gap it covers is the one place the loop is doing something
 *  that is not a model turn. */
export const CHAMBER_GOAL_EVALUATING_MARKER = 'CHAMBER_GOAL_EVALUATING:';

/** Window event a `CHAMBER_*_MARKER` notice is re-dispatched on, scoped by
 *  session id. Same shape as the subagent frames: the fold converts a frame
 *  into a browser signal so a feature hook can subscribe without the timeline
 *  threading a payload it never reads through its component tree. */
export const CHAMBER_MODE_EVENT = 'omp:chamber-mode';
