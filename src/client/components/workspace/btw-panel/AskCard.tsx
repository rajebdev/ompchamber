/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The ask card — the top card of the side-question form.
 *
 * It is the form's own entry, not the chat's: the question typed here is always
 * a question of its own (a new topic), which is why it carries its own `⟳`
 * (start over) and `✕` (leave the form). The topic history and promotion ride
 * along here because the form replaced the composer that used to hold them.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedKeyboardEvent } from 'preact';
import { ChevronDown, ExternalLink, RefreshCw, X } from 'lucide-preact';
import type { BtwTopic } from '@/shared/types';
import { BtwTopicMenu } from '@/client/components/workspace/btw-panel/TopicMenu';

export interface BtwAskCardProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** `⟳` — clear the question and fall back to the newest topic. */
  onNewQuestion: () => void;
  /** `✕` — leave the side-question form. */
  onClose: () => void;
  /** A side answer is streaming: starting over waits for it. */
  running: boolean;
  topics: BtwTopic[];
  activeTopicId: string | null;
  onSelectTopic: (id: string) => void;
  onDeleteTopic: (id: string) => void;
  canPromote: boolean;
  onPromote: () => void;
}

const GHOST_BUTTON =
  'p-1.5 rounded text-ink/45 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink/45';

export function BtwAskCard({
  value,
  onChange,
  onSubmit,
  onNewQuestion,
  onClose,
  running,
  topics,
  activeTopicId,
  onSelectTopic,
  onDeleteTopic,
  canPromote,
  onPromote,
}: BtwAskCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Grow with the text and collapse again once it is submitted or cleared.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const handleKeyDown = (event: TargetedKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="bg-paper border border-ink/20 rounded-2xl shadow-sm flex items-center gap-1 pl-1.5 pr-2 py-1 focus-within:border-ink transition-colors">
      <button
        type="button"
        onClick={onNewQuestion}
        disabled={running}
        className={GHOST_BUTTON}
        aria-label="New side question"
        title="New side question"
      >
        <RefreshCw size={14} strokeWidth={2} />
      </button>

      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onInput={(event) => onChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask your question"
        aria-label="Ask your question"
        className="flex-1 min-w-0 bg-transparent text-[13px] text-ink placeholder-ink/40 resize-none outline-none py-1.5 max-h-32 leading-6"
      />

      {topics.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className={GHOST_BUTTON}
            aria-label="Side question history"
            title="Side question history"
            aria-expanded={menuOpen}
            data-btw-menu-anchor=""
          >
            <ChevronDown size={14} strokeWidth={2} />
          </button>
          {menuOpen && (
            <BtwTopicMenu
              topics={topics}
              activeTopicId={activeTopicId}
              onSelectTopic={onSelectTopic}
              onDeleteTopic={onDeleteTopic}
              onCloseMenu={() => setMenuOpen(false)}
            />
          )}
        </div>
      )}

      {canPromote && (
        <button
          type="button"
          onClick={onPromote}
          className={GHOST_BUTTON}
          aria-label="Promote answer into chat"
          title="Promote answer into chat"
        >
          <ExternalLink size={14} strokeWidth={2} />
        </button>
      )}

      <button
        type="button"
        onClick={onClose}
        className={GHOST_BUTTON}
        aria-label="Close side questions"
        title="Close side questions"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
