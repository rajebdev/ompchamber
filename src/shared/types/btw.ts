/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BTW (side question) domain types.
 *
 * A BTW topic is an independent question plus its explicit follow-ups, run
 * against the parent session's context but never appended to its transcript —
 * the same contract omp's own `/btw` implements in the TUI. The server is the
 * source of truth for a session's topics; the panel renders the state it is
 * sent and streams answer text through `btw_delta` frames.
 */

/** Lifecycle of one question/answer pair inside a topic. */
export type BtwTurnStatus = 'running' | 'complete' | 'cancelled' | 'failed' | 'interrupted';

/** Model a topic's side conversation runs on — the parent session's model,
 *  captured when the topic was created (omp's `/btw` uses the active model). */
export interface BtwModel {
  provider: string;
  id: string;
  /** Display name reported by the running side session (`DeepSeek-V4.1-Flash`). */
  name?: string;
}

/** One question and its answer inside a topic. */
export interface BtwTurn {
  index: number;
  question: string;
  answer: string;
  status: BtwTurnStatus;
  createdAt: number;
  updatedAt: number;
}

/** A side conversation scoped to one chamber session. */
export interface BtwTopic {
  id: string;
  sessionId: string;
  /** The first question, used as the topic's label in history. */
  title: string;
  createdAt: number;
  updatedAt: number;
  model?: BtwModel;
  /** Set once the topic was promoted into the chat as a session of its own. */
  promotedSessionId?: string;
  turns: BtwTurn[];
}

/** A session's whole BTW view. */
export interface BtwState {
  topics: BtwTopic[];
  /** Topic with a question in flight; at most one per session, because a
   *  session runs one side conversation at a time. */
  runningTopicId: string | null;
}

/** Server → client frames on `/api/btw/:sessionId/*` (WS and SSE alike). */
export type BtwFrame =
  | { type: 'connected'; sessionId: string }
  | { type: 'btw_state'; state: BtwState }
  | { type: 'btw_delta'; topicId: string; turnIndex: number; text: string }
  | { type: 'btw_error'; topicId: string | null; message: string };
