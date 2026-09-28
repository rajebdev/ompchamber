/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The deps record `foldAgentEvent` reads, plus the two small helpers that
 * narrow it. Split out of `agent-events.ts` so that file — which is already the
 * switch over every frame omp can send — stays under the repo's per-file size
 * ceiling.
 *
 * These are pure accessors over caller-owned state: no closure of their own, no
 * module state, so importing them from either side of the fold is free.
 */

import type { Dispatch, RefObject, SetStateAction } from 'preact/compat';
import type { ChatMessageData, OmpAgentCallbacks, OmpAgentState } from '@/shared/types';
import type { ToolResultHost, ToolResultRecord } from '@/shared/lib/chat/omp/tool-results';

export interface OmpAgentFoldDeps extends ToolResultHost {
  sessionId: string;
  setState: Dispatch<SetStateAction<OmpAgentState>>;
  callbacksRef: RefObject<OmpAgentCallbacks>;
  toolResultsRef: RefObject<Map<string, ToolResultRecord>>;
  lastToolMessageRef: RefObject<ChatMessageData>;
  interruptPendingRef: RefObject<boolean>;
  /** Last activity phrase published to the indicator; guards per-token frames
   *  from re-setting identical state. */
  activityRef: RefObject<string>;
  /** Thinking level in effect for the live run (last `thinking_level_changed`
   *  frame); stamped onto assistant turns as they stream. */
  currentThinkingLevelRef: RefObject<string | undefined>;
  /** toolCallIds of in-flight file-mutating calls, cleared on `agent_start`. */
  fileMutatingCallsRef: RefObject<Set<string>>;
}

/** Publish a new indicator phrase, skipping repeats (thinking/text deltas
 *  arrive per token and would otherwise re-set state on every frame). */
export function setActivity(verb: string | undefined, deps: OmpAgentFoldDeps): void {
  if (!verb || verb === deps.activityRef.current) return;
  deps.activityRef.current = verb;
  deps.callbacksRef.current?.onActivity?.(verb);
}

/** Narrow a deps record to the tool-output host, adding the re-emit sink. */
export function toolHost(deps: OmpAgentFoldDeps): ToolResultHost {
  return { ...deps, onMessageUpdate: deps.callbacksRef.current?.onMessageUpdate };
}
