import { ExternalLink } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface SearchResult {
  title?: unknown;
  url?: unknown;
  link?: unknown;
  snippet?: unknown;
  description?: unknown;
}

function resultUrl(r: SearchResult): string {
  return typeof r.url === 'string' ? r.url : typeof r.link === 'string' ? r.link : '';
}

function resultTitle(r: SearchResult): string {
  return typeof r.title === 'string' && r.title ? r.title : resultUrl(r) || 'Result';
}

function resultSnippet(r: SearchResult): string {
  if (typeof r.snippet === 'string' && r.snippet) return r.snippet;
  return typeof r.description === 'string' ? r.description : '';
}

function parseWebSearchResults(output: string): SearchResult[] {
  if (!output) return [];
  try {
    const data = JSON.parse(output);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.results)) return data.results;
      if (Array.isArray(data.organic)) return data.organic;
      if (Array.isArray(data.items)) return data.items;
    }
  } catch {}
  return [];
}

/** Hasil pencarian untuk tool `web_search` — details.results[] atau output. */
export function WebSearchPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: SearchResult[] = Array.isArray(details.results)
    ? details.results
    : parseWebSearchResults(tool.output ?? '');

  if (items.length === 0) {
    const lines = (tool.output ?? '').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return null;
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
    <ol className="divide-y divide-ink/6 overflow-hidden rounded-lg border border-ink/8 bg-canvas/40">
      {items.map((r, index) => {
        const url = resultUrl(r);
        return (
          <li key={index} className="px-2.5 py-2 text-[11.5px]">
            <div className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-ink/5 font-mono text-[9px] text-ink/45">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{resultTitle(r)}</span>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center rounded-md p-0.5 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
                  title={url}
                >
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
            {url && <div className="mt-0.5 truncate pl-[22px] font-mono text-[9.5px] text-ink/40">{url}</div>}
            {resultSnippet(r) && (
              <div className="mt-0.5 pl-[22px] leading-snug text-ink/65">{resultSnippet(r)}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
