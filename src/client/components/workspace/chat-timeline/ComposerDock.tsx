import type { Dispatch, SetStateAction } from 'preact/compat';
import { ChatInput } from '@/client/components/workspace/chat-timeline/chat-input/index';
import { GeneratingIndicator } from '@/client/components/workspace/chat-timeline/GeneratingIndicator';
import { QueueList } from '@/client/components/workspace/chat-timeline/QueueList';
import type { Attachment, QueuedMessage } from '@/shared/types';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';

interface ComposerDockProps {
  isMobile: boolean;
  isGenerating: boolean;
  modelName?: string;
  generatingVerb: string;
  provider?: string;
  providerNames?: Record<string, string>;
  messageQueue: QueuedMessage[];
  setMessageQueue: Dispatch<SetStateAction<QueuedMessage[]>>;
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
  isGenerating,
  modelName,
  generatingVerb,
  provider,
  providerNames,
  messageQueue,
  setMessageQueue,
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
  sessionModel,
  sessionThinkingLevel,
  variant,
}: ComposerDockProps) {
  return (
    <div
      className={`bg-transparent border-t-0 flex-shrink-0 space-y-2 ${isMobile ? 'px-3 pt-1' : 'p-4 pt-1'}`}
      style={isMobile ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' } : undefined}
    >
      <div className="mx-auto w-full max-w-[970px]">
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
          setQueue={setMessageQueue}
          onEdit={onEditQueueItem}
          onSendNow={onSendNowQueueItem}
        />
        <QueueList
          queue={steeringQueue}
          setQueue={setSteeringQueue}
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
          sessionModel={sessionModel}
          sessionThinkingLevel={sessionThinkingLevel}
          variant={variant}
        />
      </div>
    </div>
  );
}
