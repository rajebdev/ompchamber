/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The plan a model submitted for review.
 *
 * Plan mode's approval path is a `write` to `xd://propose`, which the chamber's
 * extension intercepts and parks — the model's tool call stays open until an
 * answer arrives. The proposal therefore reaches the client as a
 * `CHAMBER_PLAN_PROPOSAL` marker carrying the plan body, and the client's answer
 * travels back as a second mode command. Nothing polls: both directions ride the
 * stream the transcript already uses.
 *
 * A proposal marked `deciding` is deliberately kept on screen until the child
 * confirms or refuses, because a decision that silently failed would leave the
 * operator looking at a blank panel while the agent stayed parked.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { CHAMBER_MODE_EVENT, type PlanProposal } from '@/shared/lib/omp/mode/types';
import type { ParsedMarker } from '@/shared/lib/omp/mode/markers';

export interface PlanReviewState {
  proposal: PlanProposal | null;
  /** A decision is in flight; the panel disables its actions. */
  deciding: boolean;
  error: string | null;
  decide: (choice: string, feedback: string) => Promise<void>;
  dismiss: () => void;
}

export function proposalFromMarkerPayload(payload: Record<string, unknown>): PlanProposal | null {
  const title = payload.title;
  const planFilePath = payload.planFilePath;
  if (typeof title !== 'string' || typeof planFilePath !== 'string') return null;
  const planContent = typeof payload.planContent === 'string' ? payload.planContent : '';
  return { title, planFilePath, planContent };
}

export function usePlanReview(sessionId: string | null): PlanReviewState {
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  // A proposal belongs to the process that raised it. Carrying it into another
  // session would offer a decision the new child never asked for.
  useEffect(() => {
    setProposal(null);
    setError(null);
    setDeciding(false);
  }, [sessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; marker?: ParsedMarker }>).detail;
      const marker = detail?.marker;
      if (!marker) return;
      if (sessionId && detail.sessionId && detail.sessionId !== sessionId) return;
      if (marker.marker === 'CHAMBER_PLAN_PROPOSAL:') {
        const next = proposalFromMarkerPayload(marker.payload);
        if (next) {
          setProposal(next);
          setError(null);
        }
        return;
      }
      // A decision reported by the child: the parked promise is resolved, so
      // the review surface has done its job.
      if (marker.marker === 'CHAMBER_PLAN_DECISION:') {
        setProposal(null);
        setDeciding(false);
        return;
      }
      if (marker.marker === 'CHAMBER_PLAN_SAVED:') {
        setProposal(null);
        setDeciding(false);
        return;
      }
      if (marker.marker === 'CHAMBER_MODE_ERROR:') {
        setDeciding(false);
        setError(typeof marker.payload.reason === 'string' ? marker.payload.reason : 'Mode command failed');
      }
    };
    window.addEventListener(CHAMBER_MODE_EVENT, listener);
    return () => window.removeEventListener(CHAMBER_MODE_EVENT, listener);
  }, [sessionId]);

  const decide = useCallback(async (choice: string, feedback: string) => {
    const current = sessionRef.current;
    if (!current) return;
    setDeciding(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/${encodeURIComponent(current)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'chamber_mode',
          scope: 'plan',
          action: 'decide',
          payload: { choice, feedback },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'The plan decision could not be sent.');
        setDeciding(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The plan decision could not be sent.');
      setDeciding(false);
    }
  }, []);

  const dismiss = useCallback(() => setProposal(null), []);

  return { proposal, deciding, error, decide, dismiss };
}
