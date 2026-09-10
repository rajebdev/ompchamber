import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface DiffLineItem {
  type: 'add' | 'del' | 'context' | 'meta';
  text: string;
  oldNum?: number;
  newNum?: number;
}

interface CommitDiffViewerProps {
  diffText?: string;
  isLoading?: boolean;
}

export function CommitDiffViewer({ diffText, isLoading }: CommitDiffViewerProps) {
  const [expandedAll, setExpandedAll] = useState(false);

  const lines = useMemo(() => {
    if (!diffText) return [];
    const parsed: DiffLineItem[] = [];
    let oldCounter = 1;
    let newCounter = 1;

    const rawLines = diffText.split(/\r?\n/);
    for (const line of rawLines) {
      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
        continue;
      }
      if (line.startsWith('@@')) {
        // Parse hunk header @@ -oldStart,oldLen +newStart,newLen @@
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldCounter = parseInt(match[1], 10);
          newCounter = parseInt(match[2], 10);
        }
        parsed.push({ type: 'meta', text: line });
      } else if (line.startsWith('+')) {
        parsed.push({ type: 'add', text: line.slice(1), newNum: newCounter++ });
      } else if (line.startsWith('-')) {
        parsed.push({ type: 'del', text: line.slice(1), oldNum: oldCounter++ });
      } else {
        const text = line.startsWith(' ') ? line.slice(1) : line;
        parsed.push({ type: 'context', text, oldNum: oldCounter++, newNum: newCounter++ });
      }
    }
    return parsed;
  }, [diffText]);

  if (isLoading) {
    return (
      <div className="my-2 p-4 rounded bg-canvas border border-ink/10 text-ink/40 font-mono text-xs flex items-center justify-center">
        Loading commit diff...
      </div>
    );
  }

  if (!diffText || lines.length === 0) {
    return (
      <div className="my-2 p-3 rounded bg-canvas border border-ink/10 text-ink/40 font-mono text-xs text-center">
        No diff content available for this file.
      </div>
    );
  }

  // Segment lines into blocks of context / changes
  return (
    <div className="my-2 rounded border border-ink/15 bg-paper overflow-hidden text-[11px] font-mono leading-relaxed shadow-xs text-ink">
      <div className="flex items-center justify-between px-3 py-1.5 bg-canvas border-b border-ink/10 text-ink/70 text-[10.5px]">
        <span className="font-semibold text-meta">Diff preview</span>
        <button
          type="button"
          onClick={() => setExpandedAll(!expandedAll)}
          className="hover:text-ink flex items-center gap-1 cursor-pointer transition-colors"
        >
          {expandedAll ? (
            <>
              <ChevronUp size={12} /> Collapse context
            </>
          ) : (
            <>
              <ChevronDown size={12} /> Expand all context
            </>
          )}
        </button>
      </div>

      <div className="overflow-x-auto max-h-72 select-text divide-y divide-ink/[0.04]">
        {lines.map((line, idx) => {
          if (line.type === 'meta') {
            return (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-1 bg-canvas border-y border-ink/10 text-meta text-[10px] font-semibold"
              >
                <span>↕</span>
                <span>{line.text}</span>
              </div>
            );
          }

          const isAdd = line.type === 'add';
          const isDel = line.type === 'del';

          return (
            <div
              key={idx}
              className={`flex items-start font-mono ${
                isAdd
                  ? 'bg-success/10 hover:bg-success/15'
                  : isDel
                  ? 'bg-error/10 hover:bg-error/15'
                  : 'text-ink hover:bg-ink/[0.02]'
              }`}
            >
              {/* Line numbers column */}
              <div
                className={`w-10 flex-shrink-0 text-right pr-2 py-0.5 select-none border-r border-ink/10 text-[10px] tabular-nums font-mono ${
                  isDel
                    ? 'bg-error/15 text-error font-semibold'
                    : isAdd
                    ? 'bg-success/15 text-success/70'
                    : 'bg-canvas/50 text-ink/40'
                }`}
              >
                {line.oldNum ?? (isAdd ? '+' : '')}
              </div>
              <div
                className={`w-10 flex-shrink-0 text-right pr-2 py-0.5 select-none border-r border-ink/10 text-[10px] tabular-nums font-mono ${
                  isAdd
                    ? 'bg-success/15 text-success font-semibold'
                    : isDel
                    ? 'bg-error/15 text-error/70'
                    : 'bg-canvas/50 text-ink/40'
                }`}
              >
                {line.newNum ?? (isDel ? '-' : '')}
              </div>

              {/* Diff marker */}
              <div
                className={`w-4 flex-shrink-0 text-center py-0.5 select-none font-bold ${
                  isAdd ? 'text-success' : isDel ? 'text-error' : 'opacity-0'
                }`}
              >
                {isAdd ? '+' : isDel ? '-' : ' '}
              </div>

              {/* Code text */}
              <div className="flex-1 min-w-0 py-0.5 pr-3 whitespace-pre overflow-x-auto text-ink">
                {line.text || ' '}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
