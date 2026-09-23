import type { Dispatch, SetStateAction } from 'preact/compat';
import { ChatInput } from '@/client/components/workspace/chat-timeline/chat-input/index';
import { BtwPanel } from '@/client/components/workspace/btw-panel/index';
import { GeneratingIndicator } from '@/client/components/workspace/chat-timeline/GeneratingIndicator';
import { QueueList } from '@/client/components/workspace/chat-timeline/QueueList';
import type { Attachment, QueuedMessage } from '@/shared/types';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';

interface ComposerDockProps {
  isMobile: boolean;
  /** Chamber session the side-question panel scopes to. */
  sessionId: string | null;
  isGenerating: boolean;
  modelName?: string;
  generatingVerb: string;
  provider?: string;
  providerNames?: Record<string, string>;
  messageQueue: QueuedMessage[];
  onRemoveQueueItem: (id: string) => void;
  onReorderQueue: (orderedIds: string[]) => void;
  onEditQueueItem: (item: QueuedMessage) => void;
  onSendNowQueueItem: (item: QueuedMessage) => void;
  steeringQueue: QueuedMessage[];
  setSteeringQueue: Dispatch<SetStateAction<QueuedMessage[]>>;
  inputValue: string;
  setInputValue: Dispatch<SetStateAction<string>>;
  rootPath: string | null;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  onSend: (attachments: Attachment[], options?: { steering?: boolean }) => void;
  onStop: () => void;
  appSettings: Record<string, unknown>;
  onThinkingLevelChange: (level: string) => void;
  onModelChange: (provider: string, modelId: string) => void;
  accessMode: ApprovalMode;
  onAccessModeChange: (mode: ApprovalMode) => void;
  composerModelRef: { current: { provider: string; modelId: string; thinkingLevel: string } | null };
  deferredComposerPickRef: { current: { provider?: string; modelId?: string; thinkingLevel?: string } | null };
  sessionModel: { provider: string; modelId: string } | null;
  sessionThinkingLevel?: string | null;
  variant: 'desktop' | 'mobile';
}

/**
 * Docked composer footer: the generating indicator, the queued/steering
 * delivery lists, and the input itself. Split out of ChatTimeline so the
 * parent stays a pure layout shell.
 */
export function ComposerDock({
  isMobile,
  sessionId,
  isGenerating,
  modelName,
  generatingVerb,
  provider,
  providerNames,
  messageQueue,
  onRemoveQueueItem,
  onReorderQueue,
  onEditQueueItem,
  onSendNowQueueItem,
  steeringQueue,
  setSteeringQueue,
  inputValue,
  setInputValue,
  rootPath,
  attachments,
  setAttachments,
  onSend,
  onStop,
  appSettings,
  onThinkingLevelChange,
  onModelChange,
  accessMode,
  onAccessModeChange,
  composerModelRef,
  deferredComposerPickRef,
  sessionModel,
  sessionThinkingLevel,
  variant,
}: ComposerDockProps) {
  return (
    <div
      className={`bg-transparent border-t-0 flex-shrink-0 space-y-2 ${isMobile ? 'px-3 pt-1' : 'p-4 pt-1'}`}
      style={isMobile ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' } : undefined}
    >
      {/* `relative` is the side-question panel's containing block: it floats
          above the whole dock stack (`bottom-full`), so it never covers the
          composer it is opened from. */}
      <div className="relative mx-auto w-full max-w-[970px]">
        <BtwPanel sessionId={sessionId} appSettings={appSettings} />
        {isGenerating && (
          <GeneratingIndicator
            modelName={modelName}
            generatingVerb={generatingVerb}
            provider={provider}
            providerNames={providerNames}
          />
        )}
        <QueueList
          queue={messageQueue}
          onRemove={onRemoveQueueItem}
          onReorder={onReorderQueue}
          onEdit={onEditQueueItem}
          onSendNow={onSendNowQueueItem}
        />
        <QueueList
          queue={steeringQueue}
          onRemove={(id) => setSteeringQueue((q) => q.filter((i) => i.id !== id))}
          onReorder={(orderedIds) => setSteeringQueue((prev) => {
            const byId = new Map(prev.map((i) => [i.id, i]));
            return orderedIds.map((id) => byId.get(id)).filter((i): i is QueuedMessage => Boolean(i));
          })}
          isSteering
        />
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          rootPath={rootPath}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onSend={onSend}
          isGenerating={isGenerating}
          onStop={onStop}
          appSettings={appSettings}
          onThinkingLevelChange={onThinkingLevelChange}
          onModelChange={onModelChange}
          accessMode={accessMode}
          onAccessModeChange={onAccessModeChange}
          composerModelRef={composerModelRef}
          deferredComposerPickRef={deferredComposerPickRef}
          sessionModel={sessionModel}
          sessionThinkingLevel={sessionThinkingLevel}
          variant={variant}
        />
      </div>
    </div>
  );
}
