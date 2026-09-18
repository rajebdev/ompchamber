import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-preact';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import type { RawMessageItem } from '@/shared/types';
import { RawJsonViewer } from '@/client/components/workspace/context-panel/RawJsonViewer';

const MODEL_COLORS = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
  'bg-lime-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-cyan-600',
  'bg-violet-600',
  'bg-amber-600',
];

function hashModel(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function modelLabel(id: string): string {
  const slash = id.indexOf('/');
  const provider = slash > 0 ? id.slice(0, slash) : id;
  const model = slash > 0 ? id.slice(slash + 1) : '';
  return model ? `${provider} · ${model}` : provider;
}

const PAGE_SIZE = 20;

interface RawMessagesPageResponse {
  items: RawMessageItem[];
  total: number;
  filteredTotal: number;
  error?: string;
}

/** Condensed page list: 1 … around-current … last, with ellipsis gaps. */
function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach(p => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach(p => pages.add(p));
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

interface RawMessagesListProps {
  sessionId: string | null;
  /** Bumped by the parent on panel refresh ticks so the page re-reads. */
  refreshKey?: number;
}

/**
 * Server-side paged raw messages: only the current 20-row page is held in
 * client state. Every fetch REPLACES the array (never appends), so memory
 * stays flat no matter how long the session runs.
 */
export function RawMessagesList({ sessionId, refreshKey = 0 }: RawMessagesListProps) {
  // All messages collapsed by default
  const [expandedIds, setExpandedIds] = useSessionState<Record<string, boolean>>('context.rawExpandedIds', {});
  const [filterRole, setFilterRole] = useSessionState<'all' | 'assistant' | 'user'>('context.rawFilterRole', 'all');
  const [page, setPage] = useState(1);

  // The single source of truth for visible rows — swapped wholesale on each
  // page load, never accumulated.
  const [items, setItems] = useState<RawMessageItem[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Tracks the latest request so stale responses can never clobber a newer
  // page (rapid page flips, session switches mid-flight).
  const requestSeqRef = useRef(0);
  const cancelledRef = useRef(false);

  const loadPage = useCallback(() => {
    if (typeof window === 'undefined') return;
    const seq = ++requestSeqRef.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), role: filterRole });
    if (sessionId) params.set('sessionId', sessionId);
    fetch(`/api/telemetry/raw-messages?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RawMessagesPageResponse | null) => {
        if (cancelledRef.current || seq !== requestSeqRef.current) return;
        setItems(data && Array.isArray(data.items) ? data.items : []);
        setFilteredTotal(data && Number.isFinite(data.filteredTotal) ? data.filteredTotal : 0);
      })
      .catch(() => {
        if (cancelledRef.current || seq !== requestSeqRef.current) return;
        setItems([]);
        setFilteredTotal(0);
      })
      .finally(() => {
        if (seq === requestSeqRef.current) setLoading(false);
      });
  }, [sessionId, page, filterRole]);

  useEffect(() => {
    cancelledRef.current = false;
    loadPage();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadPage, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const goToPage = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleToggleAll = () => {
    const allExpanded = items.every(item => expandedIds[item.id]);
    if (allExpanded) {
      setExpandedIds({});
    } else {
      const next: Record<string, boolean> = {};
      items.forEach(item => { next[item.id] = true; });
      setExpandedIds(next);
    }
  };

  const modelLegend = useMemo(() => {
    const seen: string[] = [];
    for (const item of items) {
      const id = item.info.modelID;
      if (!id || seen.includes(id)) continue;
      seen.push(id);
    }
    return seen;
  }, [items]);

  const colorForModel = (id: string) =>
    id ? MODEL_COLORS[hashModel(id) % MODEL_COLORS.length] : 'bg-ink/20';

  return (
    <div className="space-y-3">
      {/* Legend */}
      {modelLegend.length > 0 && (
        <div>
          <div className="mb-1.5">
            <span className="text-xs font-semibold text-ink/80">Legend</span>
          </div>
          <div className="bg-canvas border border-ink/10 rounded-xl px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-ink/60">
              {modelLegend.map(id => (
                <span key={id} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${colorForModel(id)}`} />
                  <span>{modelLabel(id)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-ink/80">Raw Messages</span>
          <span className="text-[10px] font-mono text-ink/50 bg-ink/5 px-1.5 py-0.5 rounded-full border border-ink/10">
            {filteredTotal}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          {/* Quick Filter (resets to first page) */}
          <div className="flex items-center bg-canvas border border-ink/10 rounded-lg p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => { setFilterRole('all'); setPage(1); }}
              className={`px-1.5 py-0.5 rounded ${filterRole === 'all' ? 'bg-ink text-canvas font-medium' : 'text-ink/60 hover:text-ink'}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => { setFilterRole('assistant'); setPage(1); }}
              className={`px-1.5 py-0.5 rounded ${filterRole === 'assistant' ? 'bg-ink text-canvas font-medium' : 'text-ink/60 hover:text-ink'}`}
            >
              AI
            </button>
            <button
              type="button"
              onClick={() => { setFilterRole('user'); setPage(1); }}
              className={`px-1.5 py-0.5 rounded ${filterRole === 'user' ? 'bg-ink text-canvas font-medium' : 'text-ink/60 hover:text-ink'}`}
            >
              User
            </button>
          </div>

          <button
            type="button"
            onClick={handleToggleAll}
            className="p-1 rounded text-ink/60 hover:text-ink hover:bg-ink/5 transition-colors text-[10px] flex items-center"
            title="Expand / Collapse All"
          >
            <ChevronsUpDown size={14} />
          </button>
        </div>
      </div>

      {/* Accordion Messages */}
      <div className="space-y-1.5">
        {!loading && items.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink/40 italic bg-canvas rounded-xl border border-ink/10">
            No raw messages recorded yet.
          </div>
        ) : (
          items.map((item) => {
            const isExpanded = Boolean(expandedIds[item.id]);

            return (
              <div
                key={item.id}
                className={`bg-canvas border border-ink/10 rounded-xl overflow-hidden transition-all duration-200 ${loading ? 'opacity-50' : ''}`}
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleExpand(item.id)}
                  className="w-full text-left px-3.5 py-2.5 flex items-center justify-between hover:bg-ink/5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
                    <span className="text-ink/40 flex-shrink-0">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="text-xs font-mono text-ink/90 truncate">
                      {item.badgeLabel}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-[11px] font-mono text-ink/50 flex-shrink-0">
                    {item.tokenSummary && (
                      <span className="text-ink/60">{item.tokenSummary}</span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${colorForModel(item.info.modelID)}`} />
                      <span>{item.timestamp}</span>
                    </span>
                  </div>
                </button>

                {/* Expanded Payload Viewer */}
                {isExpanded && (
                  <div className="px-3.5 pb-3 pt-1 border-t border-ink/5 bg-canvas/60">
                    <RawJsonViewer data={item.rawPayload} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] font-mono text-ink/50">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredTotal)} of {filteredTotal}
          </span>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => goToPage(safePage - 1)}
              className="p-1 rounded text-ink/60 hover:text-ink hover:bg-ink/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>

            {pageWindow(safePage, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="px-1 text-[10px] font-mono text-ink/40 select-none">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => goToPage(p)}
                  className={`min-w-[22px] h-[22px] px-1 rounded text-[10px] font-mono transition-colors ${
                    p === safePage ? 'bg-ink text-canvas font-medium' : 'text-ink/60 hover:text-ink hover:bg-ink/5'
                  }`}
                >
                  {p}
                </button>
              ),
            )}

            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => goToPage(safePage + 1)}
              className="p-1 rounded text-ink/60 hover:text-ink hover:bg-ink/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
