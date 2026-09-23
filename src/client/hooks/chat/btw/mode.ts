/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BTW mode: the state behind the side-question form.
 *
 * Entering the mode replaces the chat composer with the form itself — an ask
 * card ("Ask your question", always a new topic) above the side session's
 * composer (follow-ups to the topic in view). The mode flag, both drafts and
 * the selected topic live in per-session state, so a reload lands back in the
 * form the user left and leaving the mode loses nothing.
 *
 * `/btw [question]` in the main composer is the entry point; a question that
 * arrived with the command is asked immediately, which is what the TUI does.
 */

import { useCallback } from 'preact/hooks';
import type { BtwState, BtwTopic } from '@/shared/types';
import { useBtwSession, type BtwImage, type BtwLiveAnswer } from '@/client/hooks/chat/btw';
import { useChamberEvent } from '@/client/hooks/ui/window-event';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { useSearchParams } from '@/client/lib/router/search-params';
import { readStreamTransport } from '@/shared/lib/chat/omp/transport';

/** Question sent when a question arrived carrying only images. */
const ATTACHMENT_ONLY_QUESTION = 'Describe the attached image.';

export interface BtwMode {
  open: boolean;
  topics: BtwTopic[];
  activeTopic: BtwTopic | null;
  /** Topic with a turn in flight, if any. */
  runningTopicId: string | null;
  /** Partial answer of the running turn, when it belongs to the active topic. */
  liveAnswer: string;
  error: string | null;
  askDraft: string;
  followUpDraft: string;
  setAskDraft: (value: string) => void;
  setFollowUpDraft: (value: string) => void;
  /** Open the form on the current history (bare `/btw`). */
  enter: () => void;
  /** Leave the form; drafts and history stay. */
  exit: () => void;
  /** ⟳ — clear the question in flight and let the newest topic show. */
  resetQuestion: () => void;
  /** Submit the ask card: a question of its own. */
  submitAsk: () => void;
  /** Submit the side session's composer: a follow-up to the active topic. */
  submitFollowUp: (question: string, images?: BtwImage[]) => void;
  abort: () => void;
  /** Returns the session id to open, or null when promotion was refused. */
  promote: () => Promise<string | null>;
  removeTopic: (topicId: string) => void;
  selectTopic: (topicId: string) => void;
  clearError: () => void;
}

export function useBtwMode(sessionId: string | null, appSettings: Record<string, unknown>): BtwMode {
  const [open, setOpen] = useSessionState<boolean>('chat.btwOpen', false);
  const [askDraft, setAskDraft] = useSessionState<string>('chat.btwAsk', '');
  const [followUpDraft, setFollowUpDraft] = useSessionState<string>('chat.btwFollowUp', '');
  const [selectedTopicId, setSelectedTopicId] = useSessionState<string | null>('chat.btwTopicId', null);
  const [, setSearchParams] = useSearchParams();

  // `enabled` only gates the stream: the commands must work the moment the form
  // opens, which is before the stream has attached.
  const session = useBtwSession(sessionId, {
    enabled: open && Boolean(sessionId),
    transport: readStreamTransport(appSettings),
  });

  const topics = session.state?.topics ?? [];
  const activeTopic = topics.find((topic) => topic.id === selectedTopicId) ?? topics[topics.length - 1] ?? null;
  const runningTopicId = session.state?.runningTopicId ?? null;
  const live: BtwLiveAnswer | null = session.live && session.live.topicId === activeTopic?.id ? session.live : null;

  const selectNewest = useCallback(
    (next: BtwState | null) => {
      if (!next) return;
      setSelectedTopicId(next.topics[next.topics.length - 1]?.id ?? null);
    },
    [setSelectedTopicId],
  );

  // `/btw [question]` hands the question over; a bare `/btw` only opens the
  // form, which is the history view.
  useChamberEvent('omp:btw', (event) => {
    const detail = (event as CustomEvent<{ question?: string; images?: BtwImage[] }>).detail;
    const question = detail?.question?.trim();
    setOpen(true);
    if (question || detail?.images?.length) {
      setAskDraft('');
      void session.ask(question || ATTACHMENT_ONLY_QUESTION, detail?.images).then(selectNewest);
    }
  });

  const submitAsk = useCallback(() => {
    const question = askDraft.trim();
    if (!question) return;
    setAskDraft('');
    void session.ask(question).then(selectNewest);
  }, [askDraft, session, setAskDraft, selectNewest]);

  const submitFollowUp = useCallback(
    (question: string, images?: BtwImage[]) => {
      const text = question.trim();
      if (!text && !images?.length) return;
      setFollowUpDraft('');
      // With no topic in view yet, the side session's first question is the
      // topic — there is nothing to follow up on.
      void session.ask(text || ATTACHMENT_ONLY_QUESTION, images, activeTopic?.id).then((next) => {
        if (!activeTopic) selectNewest(next);
      });
    },
    [activeTopic, session, setFollowUpDraft, selectNewest],
  );

  const promote = useCallback(async () => {
    if (!activeTopic) return null;
    const created = await session.promote(activeTopic.id);
    if (!created) return null;
    setOpen(false);
    setSelectedTopicId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('sessionId', created);
      if (next.has('subagent')) next.delete('subagent');
      return next;
    });
    window.dispatchEvent(new CustomEvent('omp:session-updated', { detail: { sessionId: created } }));
    return created;
  }, [activeTopic, session, setOpen, setSelectedTopicId, setSearchParams]);

  const removeTopic = useCallback(
    (topicId: string) => {
      if (topicId === selectedTopicId) setSelectedTopicId(null);
      void session.remove(topicId);
    },
    [selectedTopicId, session, setSelectedTopicId],
  );

  return {
    open,
    topics,
    activeTopic,
    runningTopicId,
    liveAnswer: live ? live.text : '',
    error: session.error,
    askDraft,
    followUpDraft,
    setAskDraft,
    setFollowUpDraft,
    enter: () => setOpen(true),
    exit: () => setOpen(false),
    resetQuestion: () => {
      setAskDraft('');
      setSelectedTopicId(null);
      session.clearError();
    },
    submitAsk,
    submitFollowUp,
    abort: () => {
      if (runningTopicId) void session.abort(runningTopicId);
    },
    promote,
    removeTopic,
    selectTopic: (topicId: string) => {
      setSelectedTopicId(topicId);
      session.clearError();
    },
    clearError: session.clearError,
  };
}
