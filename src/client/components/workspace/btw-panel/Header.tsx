/**
 * BTW panel header row.
 *
 * Pure presentation: the topic dropdown's open state is local, everything else
 * is forwarded to the parent that owns the side-session state.
 */

import { useState } from 'preact/hooks';
import { ChevronDown, ExternalLink, RefreshCw, X } from 'lucide-preact';
import type { BtwTopic } from '@/shared/types/btw';
import { BtwTopicMenu } from '@/client/components/workspace/btw-panel/TopicMenu';

export interface BtwHeaderProps {
  topics: BtwTopic[];
  activeTopicId: string | null;
  /** A side answer is streaming — new topics and promotion wait for it. */
  running: boolean;
  canPromote: boolean;
  onNewTopic: () => void;
  onSelectTopic: (id: string) => void;
  onDeleteTopic: (id: string) => void;
  onPromote: () => void;
  onClose: () => void;
}

const GHOST_BUTTON =
  'p-1.5 rounded text-ink/60 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink/60';

export function BtwHeader({
  topics,
  activeTopicId,
  running,
  canPromote,
  onNewTopic,
  onSelectTopic,
  onDeleteTopic,
  onPromote,
  onClose,
}: BtwHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative h-10 px-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onNewTopic}
          disabled={running}
          className={GHOST_BUTTON}
          aria-label="New side question"
          title="New side question"
        >
          <RefreshCw size={15} strokeWidth={2} />
        </button>

        {/* The dropdown anchors to this wrapper, so `left-0` lands under the ⌄.
            `data-btw-menu-anchor` tells BtwTopicMenu to ignore pointerdowns on
            the toggle: closing here would race the click that re-opens it. */}
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
            <ChevronDown size={15} strokeWidth={2} />
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
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onPromote}
          disabled={!canPromote || running}
          className={GHOST_BUTTON}
          aria-label="Promote answer into chat"
          title="Promote answer into chat"
        >
          <ExternalLink size={15} strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={onClose}
          className={GHOST_BUTTON}
          aria-label="Close side questions"
          title="Close side questions"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
