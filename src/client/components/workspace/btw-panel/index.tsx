/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The BTW (side question) panel: a floating card that sits above the chat's
 * composer, asks an independent question against the current session's
 * context, streams the answer, and keeps its own list of topics.
 *
 * Two entries land here, both deliberate: `/btw [question]` typed into the main
 * composer (which opens the panel and asks), and this panel's own input for
 * follow-ups. Nothing it produces enters the chat transcript — that is the
 * whole point of a side question — and promotion is the one explicit action
 * that moves an answer into the chat, as a session branched from it.
 */

import { useEffect, useState } from 'preact/hooks';
import { useBtwSession } from '@/client/hooks/chat/btw';
import type { BtwImage } from '@/client/hooks/chat/btw';
import { useChamberEvent } from '@/client/hooks/ui/window-event';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { useSearchParams } from '@/client/lib/router/search-params';
import { BtwHeader } from '@/client/components/workspace/btw-panel/Header';
import { BtwMessages } from '@/client/components/workspace/btw-panel/Messages';
import { BtwComposer } from '@/client/components/workspace/btw-panel/Composer';
import { btwImagesFrom, readBtwAttachments, type BtwAttachment } from '@/client/components/workspace/btw-panel/attachments';
import { readStreamTransport } from '@/shared/lib/chat/omp/transport';

/** Placeholder question when an image is attached without any text. */
const ATTACHMENT_ONLY_QUESTION = 'Describe the attached image.';

export interface BtwPanelProps {
  sessionId: string | null;
  appSettings: Record<string, unknown>;
}

export function BtwPanel({ sessionId, appSettings }: BtwPanelProps) {
  const [open, setOpen] = useSessionState<boolean>('chat.btwPanelOpen', false);
  const [draft, setDraft] = useSessionState<string>('chat.btwDraft', '');
  const [selectedTopicId, setSelectedTopicId] = useSessionState<string | null>('chat.btwTopicId', null);
  const [pendingQuestion, setPendingQuestion] = useState<{ question: string; images?: BtwImage[] } | null>(null);
  const [attachments, setAttachments] = useState<BtwAttachment[]>([]);
  // A new topic is an explicit choice (⟳, or a `/btw` from the main composer).
  // Without this, the composer's submit would silently follow up on the newest
  // topic instead of starting the question the user just asked for.
  const [newTopicPending, setNewTopicPending] = useState(false);
  const [, setSearchParams] = useSearchParams();

  const btw = useBtwSession(open ? sessionId : null, {
    enabled: open && Boolean(sessionId),
    transport: readStreamTransport(appSettings),
  });

  // `/btw` in the main composer: open the panel, and ask when a question came
  // with it. Bare `/btw` just opens — that is the history view.
  useChamberEvent('omp:btw', (event) => {
    const detail = (event as CustomEvent<{ question?: string; images?: BtwImage[] }>).detail;
    const question = detail?.question?.trim();
    setOpen(true);
    // `/btw <question>` is always an independent question, like omp's own.
    setNewTopicPending(true);
    setPendingQuestion(question || detail?.images?.length ? { question: question ?? '', images: detail?.images } : null);
  });

  useEffect(() => {
    if (!open || !pendingQuestion) return;
    const { question, images } = pendingQuestion;
    setPendingQuestion(null);
    void btw.ask(question || ATTACHMENT_ONLY_QUESTION, images).then((next) => {
      if (next) setSelectedTopicId(next.topics[next.topics.length - 1]?.id ?? null);
    });
  }, [open, pendingQuestion, btw, setSelectedTopicId]);

  if (!open || !sessionId) return null;

  const topics = btw.state?.topics ?? [];
  const activeTopic = topics.find((topic) => topic.id === selectedTopicId) ?? topics[topics.length - 1] ?? null;
  const runningTopicId = btw.state?.runningTopicId ?? null;
  const liveAnswer = btw.live && btw.live.topicId === activeTopic?.id ? btw.live.text : '';
  const canPromote =
    Boolean(activeTopic) &&
    !runningTopicId &&
    activeTopic !== null &&
    activeTopic.turns.length > 0 &&
    activeTopic.turns[activeTopic.turns.length - 1].status === 'complete';

  const send = (question: string) => {
    const images = btwImagesFrom(attachments);
    if (!question.trim() && images.length === 0) return;
    const topicId = newTopicPending ? undefined : activeTopic?.id;
    setAttachments([]);
    setNewTopicPending(false);
    void btw.ask(question.trim() || ATTACHMENT_ONLY_QUESTION, images, topicId).then((next) => {
      if (!next || topicId !== undefined) return;
      // Pin the panel to the topic just created rather than to whichever is last.
      setSelectedTopicId(next.topics[next.topics.length - 1]?.id ?? null);
    });
  };

  const handleSubmit = () => {
    const question = draft;
    setDraft('');
    send(question);
  };

  // Promote is navigation: the answer becomes a session branched from this
  // chat, so the panel closes and the timeline follows the new session.
  const handlePromote = async () => {
    if (!activeTopic) return;
    const created = await btw.promote(activeTopic.id);
    if (!created) return;
    setOpen(false);
    setSelectedTopicId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('sessionId', created);
      if (next.has('subagent')) next.delete('subagent');
      return next;
    });
    window.dispatchEvent(new CustomEvent('omp:session-updated', { detail: { sessionId: created } }));
  };

  const handleDeleteTopic = (topicId: string) => {
    if (topicId === selectedTopicId) setSelectedTopicId(null);
    void btw.remove(topicId);
  };

  return (
    <div className="absolute bottom-full inset-x-0 mb-2 z-40 flex flex-col gap-2 max-h-[70vh]">
      {/* The card does not clip: the topic dropdown opens past the header and
          `overflow-hidden` would cut it off on a short panel. */}
      <div className="relative bg-paper border border-ink/15 rounded-2xl shadow-2xl flex flex-col flex-1 min-h-0">
        <BtwHeader
          topics={topics}
          activeTopicId={activeTopic?.id ?? null}
          running={Boolean(runningTopicId)}
          canPromote={canPromote}
          onNewTopic={() => {
            setNewTopicPending(true);
            setSelectedTopicId(null);
            btw.clearError();
          }}
          onSelectTopic={(id) => {
            setNewTopicPending(false);
            setSelectedTopicId(id);
            btw.clearError();
          }}
          onDeleteTopic={handleDeleteTopic}
          onPromote={() => void handlePromote()}
          onClose={() => setOpen(false)}
        />
        <BtwMessages topic={activeTopic} liveAnswer={liveAnswer} error={btw.error} />
      </div>

      <BtwComposer
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        onStop={() => {
          if (runningTopicId) void btw.abort(runningTopicId);
        }}
        running={Boolean(runningTopicId)}
        modelLabel={activeTopic?.model?.name ?? btw.state?.topics[btw.state.topics.length - 1]?.model?.name}
        provider={activeTopic?.model?.provider}
        attachments={attachments}
        onFilesSelected={(files) => {
          void readBtwAttachments(files).then((next) => setAttachments((prev) => [...prev, ...next]));
        }}
        onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))}
      />
    </div>
  );
}
