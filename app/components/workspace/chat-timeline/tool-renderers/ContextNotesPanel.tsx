import { StickyNote, FilePlus2, PencilLine } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface NoteItem {
  title?: unknown;
  text?: unknown;
  content?: unknown;
  note?: unknown;
  id?: unknown;
}

function noteText(n: NoteItem): string {
  if (typeof n.title === 'string' && n.title) return n.title;
  if (typeof n.text === 'string' && n.text) return n.text;
  if (typeof n.content === 'string' && n.content) return n.content;
  return typeof n.note === 'string' ? n.note : '';
}

/** Panel untuk tool `context_notes` / `new_context` — catatan konteks. */
export function ContextNotesPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: NoteItem[] = Array.isArray(details.notes) ? details.notes : [];
  const isNew = tool.type === 'new_context';

  if (items.length === 0) {
    const lines = (tool.output ?? '').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-ink/15 px-3 py-2.5 text-[11.5px] text-ink/45">
          {isNew ? <PencilLine size={13} className="shrink-0" /> : <StickyNote size={13} className="shrink-0" />}
          <span>No {isNew ? 'notes created' : 'notes'}</span>
        </div>
      );
    }
    return (
      <ul className="divide-y divide-ink/6 overflow-hidden rounded-lg border border-ink/8 bg-canvas/40">
        {lines.map((line, i) => (
          <li key={i} className="px-2.5 py-1.5 text-[11.5px] break-words text-ink/75">
            {line}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8">
      <div className="border-b border-ink/8 bg-paper px-2.5 py-1.5">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
          {isNew ? 'New Context' : 'Notes'}
        </span>
        <span className="ml-2 rounded-full bg-ink/5 px-1.5 py-px font-mono text-[9.5px] text-ink/45">
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 py-1">
        {items.map((item, index) => {
          const text = noteText(item);
          if (!text) return null;
          return (
            <div key={typeof item.id === 'string' ? item.id : `note-${index}`} className="flex items-start gap-2 px-2.5 py-1.5 text-[11.5px]">
              {isNew ? (
                <FilePlus2 size={11} className="mt-0.5 shrink-0 text-ink/40" />
              ) : (
                <StickyNote size={11} className="mt-0.5 shrink-0 text-ink/40" />
              )}
              <span className="min-w-0 flex-1 break-words text-ink/80">{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
