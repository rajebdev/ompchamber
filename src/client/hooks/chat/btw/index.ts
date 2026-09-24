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
import type { AgentImage, Attachment, BtwState, ChatMessageData, StreamTransport } from '@/shared/types';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';
import { attachmentImage, readTextAttachments } from '@/shared/lib/chat/attachments';
import {
  BtwRequestError,
  abortBtwQuestion,
  askBtwQuestion,
  connectBtwStream,
  deleteBtwTopic,
  fetchBtwState,
  promoteBtwTopic,
  respondBtwDialog,
  setBtwAccessMode,
  setBtwModel,
  setBtwThinkingLevel,
} from '@/shared/lib/chat/btw/client';
import type { StreamConnection } from '@/shared/lib/chat/omp/transport';

/** Images the side session accepts, already read as base64. */
export type BtwImage = AgentImage;

/**
 * The turn streaming right now. `messages` is the turn's conversation in the
 * chat's own shape, upserted by `message.id` exactly as the chat stream does —
 * so the panel renders a live side answer through the same components the chat
 * uses, tool calls included.
 */
export interface BtwLiveAnswer {
  topicId: string;
  turnIndex: number;
  messages: ChatMessageData[];
  /** Activity phrase for the panel's indicator, from the side child's frames. */
  activity: string;
}

/**
 * Composer picks for a topic's FIRST question. A topic that does not exist yet
 * has no row to write them to, so they ride the ask and reach the spawn; later
 * questions address an existing topic through the dedicated setters.
 */
export interface BtwFirstQuestionPicks {
  model?: { provider: string; id: string };
  thinkingLevel?: string;
  approvalMode?: ApprovalMode;
}

export interface BtwSessionHandle {
  state: BtwState | null;
  live: BtwLiveAnswer | null;
  error: string | null;
  /** A command is in flight — the panel disables its actions meanwhile. */
  busy: boolean;
  /** Resolves with the canonical state the command produced, or null when it
   *  was refused (the reason is then in `error`). */
  ask: (question: string, attachments?: Attachment[], topicId?: string, picks?: BtwFirstQuestionPicks) => Promise<BtwState | null>;
  abort: (topicId: string) => Promise<void>;
  setModel: (topicId: string, provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (topicId: string, level: string) => Promise<void>;
  setAccessMode: (topicId: string, mode: ApprovalMode) => Promise<void>;
  respondToDialog: (topicId: string, id: string, response: { value: string } | { confirmed: boolean } | { cancelled: true }) => Promise<void>;
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
            // The snapshot carries the running turn's conversation, so a client
            // attaching mid-turn (a reload, a second tab) shows the answer the
            // child already produced instead of an empty bubble. A snapshot with
            // no live turn ends the local buffer — the persisted rows own it now.
            setLive(frame.state.live
              ? {
                  topicId: frame.state.live.topicId,
                  turnIndex: frame.state.live.turnIndex,
                  messages: frame.state.live.messages,
                  activity: frame.state.live.activity,
                }
              : null);
            break;
          case 'btw_message':
            // Same upsert the chat stream performs: omp emits one frame per
            // segment carrying that segment's full accumulated content, so a
            // same-id frame replaces in place and a new id appends.
            setLive((current) => {
              const base =
                current && current.topicId === frame.topicId && current.turnIndex === frame.turnIndex
                  ? current
                  : { topicId: frame.topicId, turnIndex: frame.turnIndex, messages: [], activity: '' };
              const existing = base.messages.findIndex((message) => message.id === frame.message.id);
              const messages =
                existing === -1
                  ? [...base.messages, frame.message]
                  : [...base.messages.slice(0, existing), frame.message, ...base.messages.slice(existing + 1)];
              return { ...base, messages };
            });
            break;
          case 'btw_activity':
            setLive((current) =>
              current && current.topicId === frame.topicId ? { ...current, activity: frame.verb } : current,
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
    async (
      question: string,
      attachments: Attachment[] = [],
      topicId?: string,
      picks?: BtwFirstQuestionPicks,
    ): Promise<BtwState | null> => {
      setError(null);
      // Same split the chat send path makes: images travel as provider payloads,
      // text files are inlined into the prompt. Both are read here, from the
      // attachments the composer already filled in at attach time.
      const images = attachments
        .map((attachment) => attachmentImage(attachment))
        .filter((image): image is NonNullable<typeof image> => image !== null);
      const textFiles = (await readTextAttachments(attachments)).filter((file) => !file.missing);
      const next = await run((id) => askBtwQuestion(id, {
        question,
        topicId,
        ...(images.length ? { images } : {}),
        ...(textFiles.length ? { textFiles } : {}),
        // Only a first question carries picks; a follow-up addresses a topic
        // that already owns them.
        ...(topicId ? {} : picks ?? {}),
      }));
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

  const setModel = useCallback(
    async (topicId: string, provider: string, modelId: string) => {
      setError(null);
      await run((id) => setBtwModel(id, topicId, provider, modelId));
    },
    [run],
  );

  const setThinkingLevel = useCallback(
    async (topicId: string, level: string) => {
      setError(null);
      await run((id) => setBtwThinkingLevel(id, topicId, level));
    },
    [run],
  );

  const setAccessMode = useCallback(
    async (topicId: string, mode: ApprovalMode) => {
      setError(null);
      await run((id) => setBtwAccessMode(id, topicId, mode));
    },
    [run],
  );

  const respondToDialog = useCallback(
    async (topicId: string, id: string, response: { value: string } | { confirmed: boolean } | { cancelled: true }) => {
      setError(null);
      await run((requestId) => respondBtwDialog(requestId, topicId, id, response));
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

  return {
    state,
    live,
    error,
    busy,
    ask,
    abort,
    setModel,
    setThinkingLevel,
    setAccessMode,
    respondToDialog,
    promote,
    remove,
    clearError,
  };
}
