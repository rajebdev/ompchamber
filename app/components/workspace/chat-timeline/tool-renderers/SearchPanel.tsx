import { FileSearch, FolderSearch } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface SearchMatch {
  file?: unknown;
  path?: unknown;
  line?: unknown;
  text?: unknown;
  matches?: unknown;
}

function matchLocation(m: SearchMatch): string {
  const file = typeof m.file === 'string' ? m.file : typeof m.path === 'string' ? m.path : '';
  const line = typeof m.line === 'number' ? m.line : undefined;
  if (!file) return '';
  return line === undefined ? file : `${file}:${line}`;
}

function queryOf(tool: ToolCallData): string {
  const input = tool.input;
  if (input && typeof input === 'object') {
    if (typeof input.pattern === 'string') return input.pattern;
    if (typeof input.query === 'string') return input.query;
    if (typeof input.glob === 'string') return input.glob;
  }
  return '';
}

/** Panel untuk tool pencarian file — grep/glob/ast_grep dengan query + match list. */
export function SearchPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: SearchMatch[] = Array.isArray(details.matches) ? details.matches : [];
  const isGlob = tool.type === 'glob';
  const query = queryOf(tool);
  const label = isGlob ? 'Files' : 'Matches';

  if (items.length === 0) {
    const lines = (tool.output ?? '').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-ink/15 px-3 py-2.5 text-[11.5px] text-ink/45">
          {isGlob ? <FolderSearch size={13} className="shrink-0" /> : <FileSearch size={13} className="shrink-0" />}
          <span>No {isGlob ? 'files' : 'matches'} found{query ? ` for "${query}"` : ''}</span>
        </div>
      );
    }
    return (
      <ul className="divide-y divide-ink/6 overflow-hidden rounded-lg border border-ink/8 bg-canvas/40">
        {lines.map((line, i) => (
          <li key={i} className="px-2.5 py-1.5 font-mono text-[11px] break-words text-ink/75">
            {line}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8">
      <div className="flex items-center gap-2 border-b border-ink/8 bg-paper px-2.5 py-1.5">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">{label}</span>
        <span className="rounded-full bg-ink/5 px-1.5 py-px font-mono text-[9.5px] text-ink/45">{items.length}</span>
        {query && (
          <span className="ml-auto truncate font-mono text-[10px] text-ink/45">"{query}"</span>
        )}
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 py-1">
        {items.map((m, index) => {
          const loc = matchLocation(m);
          const text = typeof m.text === 'string' ? m.text : '';
          return (
            <div key={index} className="flex items-start gap-2 px-2.5 py-1.5 text-[11.5px]">
              <span className="w-4 shrink-0 text-right font-mono text-[9.5px] text-ink/35">{index + 1}</span>
              <span className="min-w-0 flex-1 break-words">
                {loc && <span className="font-mono text-[10px] text-ink/45">{loc}: </span>}
                <span className="text-ink/80">{text}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
