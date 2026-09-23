/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live BTW state for one session: the topic list, the answer streaming right
 * now, and the commands that drive them.
 *
 * The server owns the state — every frame is a full snapshot or a delta, and
 * every command answers with the canonical state — so this hook keeps no
 * merge logic of its own and a reload can never disagree with the server.
 * The stream is attached only while the panel is open: a side question is a
 * deliberate action, not background traffic.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { BtwState, StreamTransport } from '@/shared/types';
import { BtwRequestError, abortBtwQuestion, askBtwQuestion, connectBtwStream, deleteBtwTopic, fetchBtwState, promoteBtwTopic } from '@/shared/lib/chat/btw/client';
import type { StreamConnection } from '@/shared/lib/chat/omp/transport';

/** Images the side session accepts, already read as base64. */
export type BtwImage = { data: string; mimeType: string };

/** The turn streaming right now; `text` accumulates its deltas. */
export interface BtwLiveAnswer {
  topicId: string;
  turnIndex: number;
  text: string;
}

export interface BtwSessionHandle {
  state: BtwState | null;
  live: BtwLiveAnswer | null;
  error: string | null;
  /** A command is in flight — the panel disables its actions meanwhile. */
  busy: boolean;
  /** Resolves with the canonical state the command produced, or null when it
   *  was refused (the reason is then in `error`). */
  ask: (question: string, images?: BtwImage[], topicId?: string) => Promise<BtwState | null>;
  abort: (topicId: string) => Promise<void>;
  /** Returns the new session id to open, or null when it was refused. */
  promote: (topicId: string) => Promise<string | null>;
  remove: (topicId: string) => Promise<void>;
  clearError: () => void;
}

export interface BtwSessionOptions {
  /** Attach the frame stream (the panel is open). */
  enabled: boolean;
  transport: StreamTransport;
}

export function useBtwSession(sessionId: string | null, options: BtwSessionOptions): BtwSessionHandle {
  const [state, setState] = useState<BtwState | null>(null);
  const [live, setLive] = useState<BtwLiveAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { enabled, transport } = options;

  // Commands must not be bound to the render that produced them: `/btw <q>`
  // asks from the same tick that opens the form, before the stream attached and
  // before this hook re-rendered with a session — a captured `sessionId` there
  // would be null and the question would silently go nowhere.
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const connection: StreamConnection = connectBtwStream(sessionId, transport, {
      onOpen: () => {},
      onFrame: (frame) => {
        switch (frame.type) {
          case 'btw_state':
            setState(frame.state);
            // A settled turn's text is in the snapshot now; holding the live
            // buffer any longer would keep painting the partial answer.
            setLive((current) => {
              if (!current) return null;
              const topic = frame.state.topics.find((candidate) => candidate.id === current.topicId);
              const turn = topic?.turns.find((candidate) => candidate.index === current.turnIndex);
              return turn && turn.status === 'running' ? current : null;
            });
            break;
          case 'btw_delta':
            setLive((current) =>
              current && current.topicId === frame.topicId && current.turnIndex === frame.turnIndex
                ? { ...current, text: current.text + frame.text }
                : { topicId: frame.topicId, turnIndex: frame.turnIndex, text: frame.text },
            );
            break;
          case 'btw_error':
            setError(frame.message);
            break;
          default:
            break;
        }
      },
      onClose: () => {},
    });

    void fetchBtwState(sessionId)
      .then(setState)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));

    return () => connection.close();
  }, [enabled, sessionId, transport]);

  const run = useCallback(
    async (operation: (id: string) => Promise<BtwState>): Promise<BtwState | null> => {
      const id = sessionIdRef.current;
      if (!id) return null;
      setBusy(true);
      try {
        const next = await operation(id);
        setState(next);
        return next;
      } catch (cause) {
        setError(cause instanceof BtwRequestError || cause instanceof Error ? cause.message : String(cause));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const ask = useCallback(
    async (question: string, images?: BtwImage[], topicId?: string): Promise<BtwState | null> => {
      setError(null);
      const next = await run((id) => askBtwQuestion(id, { question, images, topicId }));
      setLive(null);
      if (next && !next.runningTopicId) {
        setError('The side question was accepted but did not start running.');
      }
      return next;
    },
    [run],
  );

  const abort = useCallback(
    async (topicId: string) => {
      setError(null);
      await run((id) => abortBtwQuestion(id, topicId));
    },
    [run],
  );

  const remove = useCallback(
    async (topicId: string) => {
      setError(null);
      await run((id) => deleteBtwTopic(id, topicId));
    },
    [run],
  );

  const promote = useCallback(
    async (topicId: string): Promise<string | null> => {
      const id = sessionIdRef.current;
      if (!id) return null;
      setError(null);
      setBusy(true);
      try {
        const created = await promoteBtwTopic(id, topicId);
        return created.sessionId;
      } catch (cause) {
        setError(cause instanceof BtwRequestError || cause instanceof Error ? cause.message : String(cause));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return { state, live, error, busy, ask, abort, promote, remove, clearError };
}
