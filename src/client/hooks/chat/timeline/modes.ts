/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The composer's Plan/Goal mode state.
 *
 * ## Why per session, not global
 *
 * The access mode is a GLOBAL preference (`useChatTimelineAccessMode`): it
 * describes how the user wants tools approved, and they want the same answer
 * everywhere. Plan and Goal mode are the opposite — they describe what THIS
 * conversation is doing. A global toggle would put every other open chat into
 * plan mode as a side effect, and two tabs on two sessions would fight.
 *
 * ## Where the truth lives
 *
 * The child process is authoritative: omp owns both modes, and every transition
 * it makes arrives as a `goal_updated` frame or a `CHAMBER_*_STATE` marker from
 * the chamber's own extension. The client mirrors that and sends intents. A
 * reload re-reads the mirror from the session's JSONL
 * (`GET /api/sessions/:id/modes`), so a chat reopened in another tab shows the
 * modes it is actually in rather than the last thing this tab requested.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  CHAMBER_MODE_EVENT,
  EMPTY_MODE_SELECTION,
  type ChamberModeSelection,
  type GoalContinuation,
  type GoalRecord,
} from '@/shared/lib/omp/mode/types';
import {
  continuationFromMarker,
  goalEnabledFromMarker,
  goalRecordFromMarker,
  type ParsedMarker,
} from '@/shared/lib/omp/mode/markers';
import { isGoalOpen } from '@/shared/lib/omp/mode/status';

export interface ChatTimelineModes {
  plan: boolean;
  /** omp's own `enabled` flag: the agent is working toward the goal right now.
   *  False for a PAUSED goal, which still exists (see `goalOpen`). */
  goal: boolean;
  /** A goal this chat still owns — omp's `enabled` OR an open record. This is
   *  the flag every surface should gate on: pausing clears `enabled` while the
   *  record stays resumable, so gating on `goal` alone made the goal vanish
   *  from the composer (strip gone, button off, modal offering to create a
   *  second goal over the paused one). */
  goalOpen: boolean;
  goalRecord: GoalRecord | null;
  /**
   * The child's last automatic goal turn (`CHAMBER_GOAL_CONTINUATION`), or
   * null when the loop has not reported one for the current goal. Cleared when
   * the goal itself changes: a counter from the previous goal names a turn this
   * one never took.
   */
  goalContinuation: GoalContinuation | null;
  /**
   * True while the child's loop is deciding whether to open another automatic
   * turn. The decision is a synchronous guard chain with no other frame, so
   * this is the only signal for the window in which the goal is neither
   * streaming nor idle.
   */
  goalEvaluating: boolean;
  /** True while a mode command is in flight; the toggle shows a pending state
   *  rather than flipping optimistically and snapping back. */
  pending: boolean;
  /** omp refuses to enter one mode while the other is active, so Plan is not
   *  offered while Goal is on — a button whose only outcome is a refusal is
   *  worse than an absent one. */
  planAvailable: boolean;
  onTogglePlan: (enabled: boolean) => void;
  /** Goal needs an objective, so the toggle opens a modal instead of sending a
   *  bare enable — see `GoalModal`. */
  onGoalAction: (action: GoalAction) => void;
  error: string | null;
}

export type GoalAction =
  | { kind: 'create'; objective: string; tokenBudget?: number; maxTurns?: number }
  | { kind: 'guided'; rough: string }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'drop' }
  | { kind: 'budget'; value: number | 'off' };

interface ModesResponse {
  modes?: ChamberModeSelection & { goalRecord?: GoalRecord | null; goalContinuation?: GoalContinuation | null };
}

/**
 * Subscribe to this session's mode markers. A marker for another session is
 * ignored: two chats can be open at once and only one of them owns the process
 * that emitted it.
 */
function useModeMarkers(sessionId: string | null, handler: (marker: ParsedMarker) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; marker?: ParsedMarker }>).detail;
      if (!detail?.marker) return;
      if (sessionId && detail.sessionId && detail.sessionId !== sessionId) return;
      handlerRef.current(detail.marker);
    };
    window.addEventListener(CHAMBER_MODE_EVENT, listener);
    return () => window.removeEventListener(CHAMBER_MODE_EVENT, listener);
  }, [sessionId]);
}

export function useChatTimelineModes(sessionId: string | null): ChatTimelineModes {
  const [plan, setPlanState] = useState(false);
  const [goal, setGoalState] = useState(false);
  const [goalRecord, setGoalRecord] = useState<GoalRecord | null>(null);
  const [goalContinuation, setGoalContinuation] = useState<GoalContinuation | null>(null);
  /** True while the child's loop is deciding (marker-driven, see
   *  `CHAMBER_GOAL_EVALUATING_MARKER`). */
  const [goalEvaluating, setGoalEvaluating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;
  // Mirrors the record's id so a goal transition can be detected OUTSIDE a
  // state updater. Comparing inside `setGoalRecord` would put the reset in an
  // updater that React may run twice.
  const goalIdRef = useRef<string | null>(null);

  // Hydrate from the session's own record. A fresh session answers the empty
  // selection, so a brand-new chat renders both toggles off without a request
  // having to distinguish "unknown" from "off".
  //
  // The reset happens BEFORE the read, not only from its answer: a session whose
  // record cannot be read at all (a pending `new-…` chat, a deleted session —
  // the route answers 404) would otherwise keep the PREVIOUS session's modes,
  // and the composer would show another chat's goal banner and a pressed Goal
  // button. Measured: switching to a pending chat rendered the last session's
  // objective in the goal strip.
  useEffect(() => {
    const current = sessionId;
    setPlanState(false);
    setGoalState(false);
    setGoalRecord(null);
    setGoalContinuation(null);
    setGoalEvaluating(false);
    goalIdRef.current = null;
    if (!current) return;
    let cancelled = false;
    fetch(`/api/sessions/${encodeURIComponent(current)}/modes`)
      .then((res) => (res.ok ? (res.json() as Promise<ModesResponse>) : null))
      .then((data) => {
        if (cancelled || !data?.modes) return;
        setPlanState(data.modes.plan === true);
        setGoalState(data.modes.goal === true);
        setGoalRecord(data.modes.goalRecord ?? null);
        // The loop's last verdict rides the same record, so a reload shows
        // "stopped at N turns" (and its Resume) instead of an active-looking
        // goal the child has already given up on. A verdict never reported is
        // null: the child's own counter cannot be reconstructed from a file.
        setGoalContinuation(data.modes.goalContinuation ?? null);
        goalIdRef.current = data.modes.goalRecord?.id ?? null;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Live transitions. omp's own `goal_updated` and the extension's markers both
  // arrive through this one channel, so the toggles follow the CHILD — including
  // a goal the model created itself during a guided interview, and one paused
  // by an interrupt.
  useModeMarkers(sessionId, (marker) => {
      if (marker.marker === 'CHAMBER_GOAL_STATE:') {
        const record = goalRecordFromMarker(marker.payload);
        // A different goal owns a different turn count — including no goal at
        // all (Drop reports `goal: null`), which must not leave the last
        // counter standing.
        if ((record?.id ?? null) !== goalIdRef.current) {
          goalIdRef.current = record?.id ?? null;
          setGoalContinuation(null);
        }
        // A verdict written by the child (a stand-down it reported before this
        // tab attached) travels with the state record.
        if ('continuation' in marker.payload) {
          setGoalContinuation(continuationFromMarker(marker.payload.continuation));
        }
        setGoalRecord(record);
        setGoalState(goalEnabledFromMarker(marker.payload));
        if (!record || record.status !== 'active') setGoalEvaluating(false);
        return;
      }
      if (marker.marker === 'CHAMBER_GOAL_EVALUATING:') {
        // The child's loop is deciding whether to open another turn. It has no
        // other frame (the decision is a synchronous guard chain), so this is
        // what the strip's spinner hangs off.
        setGoalEvaluating(marker.payload.evaluating === true);
        return;
      }
      if (marker.marker === 'CHAMBER_GOAL_CONTINUATION:') {
        // The loop's own per-turn report: emitted just before it opens an
        // automatic turn, so the run that follows is the turn it names.
        const continuation = continuationFromMarker(marker.payload);
        if (continuation) setGoalContinuation(continuation);
        // The decision that produced this frame is over; a lost
        // `evaluating: false` must not leave the strip spinning.
        setGoalEvaluating(false);
        return;
      }
      if (marker.marker === 'CHAMBER_PLAN_STATE:') {
        setPlanState(marker.payload.enabled === true);
        return;
      }
      if (marker.marker === 'CHAMBER_MODE_ERROR:') {
        setError(typeof marker.payload.reason === 'string' ? marker.payload.reason : 'Mode command failed');
      }
  });

  const send = useCallback(
    async (scope: 'plan' | 'goal', action: string, payload?: Record<string, unknown>) => {
      const sessionId = sessionRef.current;
      if (!sessionId) return false;
      setPending(true);
      setError(null);
      try {
        const res = await fetch(`/api/agent/${encodeURIComponent(sessionId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'chamber_mode', scope, action, ...(payload ? { payload } : {}) }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? 'Mode command failed');
          return false;
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Mode command failed');
        return false;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const onTogglePlan = useCallback(
    (enabled: boolean) => {
      // The child answers with a marker that re-sets this; the optimistic flip
      // exists only so the button responds to the press.
      setPlanState(enabled);
      void send('plan', enabled ? 'on' : 'off');
    },
    [send],
  );

  const onGoalAction = useCallback(
    (action: GoalAction) => {
      // Every branch below mirrors the transition it asked for LOCALLY, and the
      // child's own marker overwrites that mirror when it lands. The mirror is
      // not cosmetic: the mark returns over the session's event stream, and the
      // strip's controls are the only feedback the user gets — measured after a
      // dev-server restart (which kills the child and the client's socket), a
      // Resume answered 200 and the goal went active in the child while the row
      // kept reading "paused" indefinitely, because nothing re-attached the
      // stream. Same rule the Plan toggle already follows.
      //
      // Pause and Resume also drop the last turn's verdict: the loop's ceiling
      // count starts over in the child (`resetGoalContinuationTurns`), and omp's
      // own resume opens no turn, so a "stopped at 25 turns" row left standing
      // would describe a state the operator just left.
      if (action.kind === 'create') {
        void send('goal', 'create', {
          objective: action.objective,
          tokenBudget: action.tokenBudget,
          maxTurns: action.maxTurns,
        }).then(
          (ok) => { if (ok) setGoalContinuation(null); },
        );
        return;
      }
      if (action.kind === 'guided') {
        void send('goal', 'guided', { rough: action.rough }).then((ok) => { if (ok) setGoalContinuation(null); });
        return;
      }
      if (action.kind === 'budget') {
        void send('goal', 'budget', { value: action.value });
        return;
      }
      void send('goal', action.kind).then((ok) => {
        if (!ok) return;
        if (action.kind === 'pause') {
          setGoalState(false);
          setGoalRecord((prev) => (prev ? { ...prev, status: 'paused' } : prev));
        } else if (action.kind === 'resume') {
          setGoalState(true);
          setGoalRecord((prev) => (prev ? { ...prev, status: 'active' } : prev));
          setGoalContinuation(null);
        } else if (action.kind === 'drop') {
          setGoalState(false);
          setGoalRecord(null);
          setGoalContinuation(null);
        }
      });
    },
    [send],
  );

  // omp's own mutual exclusion (`#enterGoalMode` refuses while plan mode is
  // active and vice versa), surfaced as an availability rule rather than as a
  // refusal the user has to read.
  return {
    plan,
    goal,
    goalOpen: goal || Boolean(goalRecord && isGoalOpen(goalRecord.status)),
    goalRecord,
    goalContinuation,
    goalEvaluating,
    pending,
    planAvailable: !goal,
    onTogglePlan,
    onGoalAction,
    error,
  };
}

export { EMPTY_MODE_SELECTION };
