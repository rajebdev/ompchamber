import { useRef } from 'react';
import { GripVertical, X, Pencil, Send } from 'lucide-react';
import type { Attachment } from '@/types';

export interface QueuedMessage {
  id: string;
  text: string;
  attachments: Attachment[];
}

interface QueueListProps {
  queue: QueuedMessage[];
  setQueue: React.Dispatch<React.SetStateAction<QueuedMessage[]>>;
  /** True when every row in this panel is a steering delivery. */
  isSteering?: boolean;
  onEdit?: (item: QueuedMessage) => void;
  /** Deliver the item now (Send Now / steer). */
  onSendNow?: (item: QueuedMessage) => void;
}

const KIND_LABEL: Record<string, string> = {
  steer: 'steer',
  followup: 'follow-up',
};

export function QueueList({ queue, setQueue, isSteering = false, onEdit, onSendNow }: QueueListProps) {
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const _queue = [...queue];
    const draggedItemContent = _queue.splice(dragItem.current, 1)[0];
    _queue.splice(dragOverItem.current, 0, draggedItemContent);
    dragItem.current = null;
    dragOverItem.current = null;
    setQueue(_queue);
  };

  if (queue.length === 0) return null;
  const kind = isSteering ? 'steer' : 'followup';

  return (
    <div className="max-h-[150px] scrollbar-overlay-container scrollbar-overlay-static mb-2 space-y-1">
      {queue.map((item, index) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => { dragItem.current = index; }}
          onDragEnter={() => { dragOverItem.current = index; }}
          onDragEnd={handleSort}
          onDragOver={(e) => e.preventDefault()}
          className="flex items-center gap-2 px-2 py-1.5 bg-paper border border-ink/10 rounded shadow-sm text-xs group hover:border-ink/30 transition-colors"
        >
          <div className="cursor-grab text-ink/40 group-hover:text-ink/80">
            <GripVertical size={14} />
          </div>
          <span
            className={`shrink-0 text-[9px] font-mono uppercase tracking-wider px-1 py-px rounded ${
              kind === 'steer' ? 'bg-error/10 text-error' : 'bg-ink/10 text-ink/70'
            }`}
          >
            {KIND_LABEL[kind]}
          </span>
          <div className="flex-1 truncate text-ink/80 pr-2">
            {item.text || (item.attachments.length > 0 ? `[${item.attachments.length} attachment${item.attachments.length > 1 ? 's' : ''}]` : 'Empty message')}
          </div>
          {onSendNow && kind === 'followup' && (
            <button
              onClick={() => onSendNow(item)}
              className="text-ink/40 hover:text-ink/80 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Send Now (Steering)"
            >
              <Send size={12} />
            </button>
          )}
          {onEdit && (
            <button
              onClick={() => onEdit(item)}
              className="text-ink/40 hover:text-ink/80 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit"
            >
              <Pencil size={12} />
            </button>
          )}
          <button
            onClick={() => setQueue(q => q.filter(i => i.id !== item.id))}
            className="text-ink/40 hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
