import { Wand2 } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface AstEditItem {
  file?: unknown;
  path?: unknown;
  nodeKind?: unknown;
  changes?: unknown;
  message?: unknown;
}

function itemFile(i: AstEditItem): string {
  return typeof i.file === 'string' ? i.file : typeof i.path === 'string' ? i.path : '';
}

function itemMessage(i: AstEditItem): string {
  return typeof i.message === 'string' ? i.message : '';
}

/** Panel untuk tool `ast_edit` — perubahan AST terstruktur. */
export function AstEditPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: AstEditItem[] = Array.isArray(details.changes) ? details.changes : [];

  if (items.length === 0) {
    const lines = (tool.output ?? '').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return null;
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
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">AST Changes</span>
        <span className="ml-2 rounded-full bg-ink/5 px-1.5 py-px font-mono text-[9.5px] text-ink/45">
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 py-1">
        {items.map((item, index) => {
          const file = itemFile(item);
          const msg = itemMessage(item);
          const kind = typeof item.nodeKind === 'string' ? item.nodeKind : '';
          const changes = typeof item.changes === 'number' ? item.changes : undefined;
          return (
            <div key={index} className="flex items-start gap-2 px-2.5 py-1.5 text-[11.5px]">
              <Wand2 size={11} className="mt-0.5 shrink-0 text-ink/40" />
              <span className="min-w-0 flex-1 break-words">
                {file && <span className="font-mono text-[10px] text-ink/45">{file}: </span>}
                <span className="text-ink/80">{msg}</span>
                {kind && <span className="ml-1 font-mono text-[9.5px] text-ink/35">({kind})</span>}
              </span>
              {changes !== undefined && (
                <span className="shrink-0 rounded-full bg-ink/5 px-1.5 py-px font-mono text-[9px] text-ink/45">
                  {changes} changes
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
