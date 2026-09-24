/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The side-question panel — what the chat composer becomes while BTW mode is on.
 *
 * TWO cards, and the split is what keeps it unambiguous:
 *
 *  1. the panel card — the ask card as its HEADER (the field that starts a new
 *     topic, plus `⟳` start over / `⌄` topic history / `⧉` promote / `✕` leave),
 *     the topic's turns as its body, and the running turn's indicator pinned at
 *     the BOTTOM, where it reports the answer being streamed above it;
 *  2. the composer — the chat's own `ChatInput`, for follow-ups to the topic on
 *     screen.
 *
 * The ask field used to be a free-standing card directly above that composer,
 * and users typed a follow-up into it. As a header it belongs to the answers
 * card it sits on, and only one input continues the topic in view.
 *
 * Nothing here enters the chat transcript — that is the point of a side
 * question — and promotion is the one explicit action that moves an answer into
 * the chat, as a session branched from it.
 *
 * The composer card is the CHAT's own `ChatInput`, not a look-alike: a side
 * question runs a child with tools and an access mode, so it offers the same
 * model / thinking / access controls, the same attachments, drop targets and
 * keybindings. Only the autocomplete is off (`enablePicker`) — a side question
 * has no file tree, commands or skills to complete against.
 */

import { useState } from 'preact/hooks';
import type { Attachment } from '@/shared/types';
import type { BtwMode } from '@/client/hooks/chat/btw/mode';
import { BtwAskCard } from '@/client/components/workspace/btw-panel/AskCard';
import { BtwMessages } from '@/client/components/workspace/btw-panel/Messages';
import { ChatInput } from '@/client/components/workspace/chat-timeline/chat-input/index';
import { GeneratingIndicator } from '@/client/components/workspace/chat-timeline/GeneratingIndicator';
import { ExtensionDialog } from '@/client/components/workspace/chat-timeline/tool-renderers/extension-dialog/Lazy';

/** Tallest the answer card grows before its own scrollbar takes over. */
const ANSWERS_MAX_HEIGHT_PX = 520;

export interface BtwFormProps {
  mode: BtwMode;
  appSettings: Record<string, unknown>;
  composerModelRef: { current: { provider: string; modelId: string; thinkingLevel: string } | null };
  rootPath: string | null;
  variant: 'desktop' | 'mobile';
  /** Chat model/provider, shown until the topic reports the one it ran on. */
  modelName?: string;
  provider?: string;
  providerNames?: Record<string, string>;
}

export function BtwForm({
  mode,
  appSettings,
  composerModelRef,
  rootPath,
  variant,
  modelName,
  provider,
  providerNames,
}: BtwFormProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const lastTurn = mode.activeTopic?.turns[mode.activeTopic.turns.length - 1];
  // `busy` is the command in flight (a promote POST, say): promoting again from
  // the same click burst would be a second request for work already running.
  // An already-promoted topic needs no second button either — its branch
  // session exists, and the server hands that id back on a repeat promote.
  const canPromote =
    Boolean(mode.activeTopic) && !mode.runningTopicId && !mode.busy && !mode.activeTopic?.promotedSessionId && lastTurn?.status === 'complete';
  const dialog = mode.dialogs[0];
  const running = Boolean(mode.runningTopicId);

  return (
    <div className="flex flex-col gap-2">
      {/* ONE card, so the header's field and the body's answers read as one
          panel — and the composer below it as the other. The ask card is that
          header: a second free-standing input beside the composer is what made
          users type a follow-up into the new-question field. */}
      <div
        className="bg-paper border border-ink/15 rounded-2xl shadow-xl flex flex-col overflow-hidden"
        style={{ maxHeight: ANSWERS_MAX_HEIGHT_PX }}
      >
        <BtwAskCard
          value={mode.askDraft}
          onChange={mode.setAskDraft}
          onSubmit={mode.submitAsk}
          onNewQuestion={mode.resetQuestion}
          onClose={mode.exit}
          running={running}
          topics={mode.topics}
          activeTopicId={mode.activeTopic?.id ?? null}
          onSelectTopic={mode.selectTopic}
          onDeleteTopic={mode.removeTopic}
          canPromote={canPromote}
          onPromote={() => void mode.promote()}
        />

        <BtwMessages
          topic={mode.activeTopic}
          liveMessages={mode.liveMessages}
          error={mode.error}
          provider={mode.activeTopic?.model?.provider ?? provider}
          providerNames={providerNames}
          modelName={mode.activeTopic?.model?.name ?? modelName}
          thinkingLevel={mode.thinkingLevel}
          isMobile={variant === 'mobile'}
        />

        {/* The turn in flight reports itself HERE, at the bottom of the card and
            below the answer it is streaming — not above it, and not as the
            "Thinking…" line the transcript used to draw under the answer. */}
        {running && (
          <GeneratingIndicator
            id="btw-generating-indicator"
            generatingVerb={mode.liveVerb}
            modelName={mode.activeTopic?.model?.name ?? modelName}
            provider={mode.activeTopic?.model?.provider ?? provider}
            providerNames={providerNames}
          />
        )}
      </div>

      <ChatInput
        value={mode.followUpDraft}
        onChange={mode.setFollowUpDraft}
        onSend={(outgoing) => {
          // Hand the attachments over and clear them: leaving them staged would
          // re-send the same file with every later follow-up.
          mode.submitFollowUp(mode.followUpDraft, outgoing);
          setAttachments([]);
        }}
        isGenerating={running}
        onStop={mode.abort}
        appSettings={appSettings}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        rootPath={rootPath}
        variant={variant}
        enablePicker={false}
        placeholder="Ask in this btw session..."
        accessMode={mode.accessMode}
        onAccessModeChange={mode.setAccessMode}
        onThinkingLevelChange={mode.setThinkingLevel}
        onModelChange={mode.setModel}
        sessionModel={mode.activeTopic?.model ? { provider: mode.activeTopic.model.provider, modelId: mode.activeTopic.model.id } : null}
        sessionThinkingLevel={mode.thinkingLevel}
        composerModelRef={composerModelRef}
      />

      {/* A side child runs with tools, so a gated call parks its turn on an
          approval dialog. There is no tool card here to host one inline (unlike
          the chat's `ask`), so every answerable request is a modal — and the
          dialog brings its own backdrop. */}
      {dialog && (
        <ExtensionDialog
          request={dialog.request}
          onRespond={(_, response) => mode.respondToDialog(dialog.request.id, response)}
        />
      )}
    </div>
  );
}
