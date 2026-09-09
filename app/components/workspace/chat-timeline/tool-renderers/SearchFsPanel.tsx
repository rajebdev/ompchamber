import { FolderSearch } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface FsItem {
  path?: unknown;
  name?: unknown;
  type?: unknown;
  size?: unknown;
  matches?: unknown;
}

function itemPath(f: FsItem): string {
  return typeof f.path === 'string' ? f.path : typeof f.name === 'string' ? f.name : '';
}

function itemType(f: FsItem): 'file' | 'dir' | 'unknown' {
  const t = typeof f.type === 'string' ? f.type.toLowerCase() : '';
  if (t === 'file' || t === 'directory' || t === 'dir') return t === 'directory' || t === 'dir' ? 'dir' : 'file';
  return 'unknown';
}

function formatSize(n: unknown): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round(n)} B`;
}

/** Panel untuk tool `search_fs` (legacy) — hasil pencarian filesystem. */
export function SearchFsPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: FsItem[] = Array.isArray(details.results) ? details.results : [];

  if (items.length === 0) {
    const lines = (tool.output ?? '').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-ink/15 px-3 py-2.5 text-[11.5px] text-ink/45">
          <FolderSearch size={13} className="shrink-0" />
          <span>No files found</span>
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
      <div className="border-b border-ink/8 bg-paper px-2.5 py-1.5">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Files</span>
        <span className="ml-2 rounded-full bg-ink/5 px-1.5 py-px font-mono text-[9.5px] text-ink/45">
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 py-1">
        {items.map((item, index) => {
          const path = itemPath(item);
          if (!path) return null;
          const type = itemType(item);
          const size = formatSize(item.size);
          return (
            <div key={index} className="flex items-center gap-2 px-2.5 py-1.5 text-[11.5px]">
              <FolderSearch size={11} className="shrink-0 text-ink/40" />
              <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink/75">{path}</span>
              {type !== 'unknown' && (
                <span className={`shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] ${type === 'dir' ? 'bg-ink/8 text-ink/60' : 'bg-ink/5 text-ink/45'}`}>
                  {type}
                </span>
              )}
              {size && <span className="shrink-0 font-mono text-[9px] text-ink/40">{size}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
