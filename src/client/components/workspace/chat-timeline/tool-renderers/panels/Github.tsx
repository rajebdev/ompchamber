import { GitBranch, GitMerge, GitPullRequest } from 'lucide-preact';
import type { ToolCallData } from '@/shared/types';
import { FallbackOutput } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/FallbackOutput';

interface GithubItem {
  title?: unknown;
  number?: unknown;
  state?: unknown;
  author?: unknown;
  url?: unknown;
  additions?: unknown;
  deletions?: unknown;
  merged?: unknown;
}

function stateOf(item: GithubItem): 'open' | 'merged' | 'closed' {
  if (item.merged === true || item.state === 'merged') return 'merged';
  if (item.state === 'closed') return 'closed';
  return 'open';
}

const STATE_STYLES = {
  open: 'bg-success/10 text-success',
  merged: 'bg-ink/10 text-ink/60',
  closed: 'bg-error/10 text-error',
} as const;

function parseGithubItems(output: string): GithubItem[] {
  if (!output) return [];
  try {
    const data = JSON.parse(output);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.pullRequests)) return data.pullRequests;
      if (Array.isArray(data.issues)) return data.issues;
    }
  } catch {}
  return [];
}

/** Ringkasan PR/issue untuk tool `github` — details.items[] atau output. */
export function Github({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: GithubItem[] = Array.isArray(details.items)
    ? details.items
    : parseGithubItems(tool.output ?? '');

  if (items.length === 0) {
    if (!tool.output) return null;
    return <FallbackOutput text={tool.output} />;
  }

  return (
    <ul className="divide-y divide-ink/6 overflow-hidden rounded-lg border border-ink/8 bg-canvas/40">
      {items.map((item, index) => {
        const state = stateOf(item);
        const title = typeof item.title === 'string' ? item.title : '';
        const number = typeof item.number === 'number' ? `#${item.number}` : '';
        const author = typeof item.author === 'string' ? item.author : '';
        const additions = typeof item.additions === 'number' ? item.additions : undefined;
        const deletions = typeof item.deletions === 'number' ? item.deletions : undefined;
        return (
          <li key={index} className="px-2.5 py-2 text-[11.5px]">
            <div className="flex items-center gap-1.5">
              {state === 'merged' ? (
                <GitMerge size={12} className="shrink-0 text-success" />
              ) : state === 'closed' ? (
                <GitPullRequest size={12} className="shrink-0 text-error" />
              ) : (
                <GitBranch size={12} className="shrink-0 text-success" />
              )}
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{title}</span>
              {number && <span className="shrink-0 font-mono text-[10px] text-ink/45">{number}</span>}
            </div>
            <div className="mt-1 flex items-center gap-1.5 pl-[18px] text-[10px] text-ink/50">
              <span className={`rounded-full px-1.5 py-px font-mono ${STATE_STYLES[state]}`}>{state}</span>
              {author && <span>{author}</span>}
              {(additions !== undefined || deletions !== undefined) && (
                <span className="ml-auto font-mono">
                  {additions !== undefined && <span className="text-success">+{additions}</span>}
                  {deletions !== undefined && <span className="ml-1 text-error">-{deletions}</span>}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
