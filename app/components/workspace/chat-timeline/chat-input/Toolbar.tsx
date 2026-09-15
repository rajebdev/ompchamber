import { Send, Square } from 'lucide-react';
import type { AIModelOption } from '@/types';
import { ModelDropdown } from '@/components/workspace/model-dropdown/index';
import { ThinkingLevelDropdown } from '@/components/workspace/chat-timeline/chat-input/ThinkingLevelDropdown';
import { AccessDropdown } from '@/components/workspace/chat-timeline/chat-input/AccessDropdown';

export interface ComposerToolbarProps {
  isMobile: boolean;
  selectedModel: AIModelOption;
  onSelectModel: (model: AIModelOption) => void;
  thinkingLevels: string[];
  currentThinking: string;
  onSelectThinking: (level: string) => void;
  /** Thinking pill inside the model dropdown; mirrors onSelectThinking so both
   *  entry points reach the live session. */
  onThinkingLevelChange?: (level: string) => void;
  isGenerating: boolean;
  onStop?: () => void;
  onSend: () => void;
  /** Send is blocked while no workspace context is selected or nothing is typed. */
  sendDisabled: boolean;
}

/**
 * Bottom config row of the composer: model + thinking + access selectors on the
 * left, Stop/Send on the right.
 *
 * Stop never displaces Send on mobile: a touch keyboard has no Enter-to-send
 * (see ComposerTextarea `variant`), so hiding Send mid-run would leave no way to
 * submit a follow-up — queued or steering.
 */
export function ComposerToolbar({
  isMobile,
  selectedModel,
  onSelectModel,
  thinkingLevels,
  currentThinking,
  onSelectThinking,
  onThinkingLevelChange,
  isGenerating,
  onStop,
  onSend,
  sendDisabled,
}: ComposerToolbarProps) {
  const showStop = isGenerating && (isMobile ? Boolean(onStop) : true);

  return (
    <div className={`flex items-center justify-between border-t border-ink/5 bg-canvas/50 rounded-b-md ${isMobile ? 'px-2 py-2' : 'px-3 py-2'}`}>
      <div className={`flex items-center min-w-0 ${isMobile ? 'space-x-1' : 'space-x-2'}`}>
        <ModelDropdown
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          onThinkingLevelChange={onThinkingLevelChange}
          className={isMobile ? 'min-w-0 max-w-[58%]' : undefined}
        />

        <div className="w-[1px] h-3 bg-ink/10" />

        <ThinkingLevelDropdown
          thinkingLevels={thinkingLevels}
          currentThinking={currentThinking}
          onSelect={onSelectThinking}
        />

        <div className="w-[1px] h-3 bg-ink/10" />

        <AccessDropdown />
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {showStop && (
          <button
            type="button"
            onClick={onStop}
            className={`flex items-center justify-center rounded transition-colors cursor-pointer shadow-xs animate-in zoom-in-90 duration-150 flex-shrink-0 ${
              isMobile
                ? 'w-10 h-10 rounded-lg border border-ink/25 text-ink hover:bg-error hover:text-canvas hover:border-error'
                : 'w-7 h-7 bg-ink text-canvas hover:bg-error hover:text-canvas'
            }`}
            title="Stop generation"
          >
            <Square size={isMobile ? 14 : 10} className="fill-current" />
          </button>
        )}

        {(!isGenerating || isMobile) && (
          <button
            type="button"
            onClick={onSend}
            disabled={sendDisabled}
            className={`flex items-center justify-center rounded bg-ink text-canvas hover:bg-ink/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0 ${
              isMobile ? 'w-10 h-10 rounded-lg' : 'w-7 h-7'
            }`}
            title={isGenerating ? 'Queue follow-up message' : 'Send message'}
          >
            <Send size={isMobile ? 16 : 12} className="ml-px" />
          </button>
        )}
      </div>
    </div>
  );
}
