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
import { CHAMBER_MODE_EVENT, EMPTY_MODE_SELECTION, type ChamberModeSelection, type GoalRecord } from '@/shared/lib/omp/mode/types';
import { goalEnabledFromMarker, goalRecordFromMarker, type ParsedMarker } from '@/shared/lib/omp/mode/markers';

export interface ChatTimelineModes {
  plan: boolean;
  goal: boolean;
  goalRecord: GoalRecord | null;
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
  | { kind: 'create'; objective: string; tokenBudget?: number }
  | { kind: 'guided'; rough: string }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'drop' }
  | { kind: 'budget'; value: number | 'off' };

interface ModesResponse {
  modes?: ChamberModeSelection & { goalRecord?: GoalRecord | null };
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  // Hydrate from the session's own record. A fresh session answers the empty
  // selection, so a brand-new chat renders both toggles off without a request
  // having to distinguish "unknown" from "off".
  useEffect(() => {
    const current = sessionId;
    if (!current) {
      setPlanState(false);
      setGoalState(false);
      setGoalRecord(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/sessions/${encodeURIComponent(current)}/modes`)
      .then((res) => (res.ok ? (res.json() as Promise<ModesResponse>) : null))
      .then((data) => {
        if (cancelled || !data?.modes) return;
        setPlanState(data.modes.plan === true);
        setGoalState(data.modes.goal === true);
        setGoalRecord(data.modes.goalRecord ?? null);
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
        setGoalRecord(record);
        setGoalState(goalEnabledFromMarker(marker.payload));
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
      if (!sessionId) return;
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
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Mode command failed');
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
      if (action.kind === 'create') {
        void send('goal', 'create', { objective: action.objective, tokenBudget: action.tokenBudget });
        return;
      }
      if (action.kind === 'guided') {
        void send('goal', 'guided', { rough: action.rough });
        return;
      }
      if (action.kind === 'budget') {
        void send('goal', 'budget', { value: action.value });
        return;
      }
      void send('goal', action.kind);
    },
    [send],
  );

  // omp's own mutual exclusion (`#enterGoalMode` refuses while plan mode is
  // active and vice versa), surfaced as an availability rule rather than as a
  // refusal the user has to read.
  return { plan, goal, goalRecord, pending, planAvailable: !goal, onTogglePlan, onGoalAction, error };
}

export { EMPTY_MODE_SELECTION };
