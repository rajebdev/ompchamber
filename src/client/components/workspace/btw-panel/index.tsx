/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The side-question form — what the chat composer becomes while BTW mode is on.
 *
 * Stacked cards, top to bottom: the topic's turns (only once there is something
 * to show, or an error to explain), the ask card (a question of its own), and
 * the side session's composer (follow-ups, attachments, model chip). Nothing it
 * produces enters the chat transcript — that is the point of a side question —
 * and promotion is the one explicit action that moves an answer into the chat,
 * as a session branched from it.
 */

import { useState } from 'preact/hooks';
import type { BtwMode } from '@/client/hooks/chat/btw/mode';
import { BtwAskCard } from '@/client/components/workspace/btw-panel/AskCard';
import { BtwMessages } from '@/client/components/workspace/btw-panel/Messages';
import { BtwComposer } from '@/client/components/workspace/btw-panel/Composer';
import { btwImagesFrom, readBtwAttachments, type BtwAttachment } from '@/client/components/workspace/btw-panel/attachments';

export interface BtwFormProps {
  mode: BtwMode;
  /** The chat's own model, shown until the topic reports the one it ran on. */
  modelName?: string;
  provider?: string;
}

export function BtwForm({ mode, modelName, provider }: BtwFormProps) {
  const [attachments, setAttachments] = useState<BtwAttachment[]>([]);
  const lastTurn = mode.activeTopic?.turns[mode.activeTopic.turns.length - 1];
  const canPromote = Boolean(mode.activeTopic) && !mode.runningTopicId && lastTurn?.status === 'complete';
  const showTurns = (mode.activeTopic?.turns.length ?? 0) > 0 || Boolean(mode.error);

  return (
    <div className="flex flex-col gap-2">
      {showTurns && (
        <div className="bg-paper border border-ink/15 rounded-2xl shadow-xl flex flex-col max-h-[45vh] overflow-hidden">
          <BtwMessages topic={mode.activeTopic} liveAnswer={mode.liveAnswer} error={mode.error} />
        </div>
      )}

      <BtwAskCard
        value={mode.askDraft}
        onChange={mode.setAskDraft}
        onSubmit={mode.submitAsk}
        onNewQuestion={mode.resetQuestion}
        onClose={mode.exit}
        running={Boolean(mode.runningTopicId)}
        topics={mode.topics}
        activeTopicId={mode.activeTopic?.id ?? null}
        onSelectTopic={mode.selectTopic}
        onDeleteTopic={mode.removeTopic}
        canPromote={canPromote}
        onPromote={() => void mode.promote()}
      />

      <BtwComposer
        value={mode.followUpDraft}
        onChange={mode.setFollowUpDraft}
        onSubmit={() => mode.submitFollowUp(mode.followUpDraft, btwImagesFrom(attachments))}
        onStop={mode.abort}
        running={Boolean(mode.runningTopicId)}
        modelLabel={mode.activeTopic?.model?.name ?? modelName}
        provider={mode.activeTopic?.model?.provider ?? provider}
        attachments={attachments}
        onFilesSelected={(files) => {
          void readBtwAttachments(files).then((next) => setAttachments((prev) => [...prev, ...next]));
        }}
        onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))}
      />
    </div>
  );
}
