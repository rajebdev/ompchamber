import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronsUpDown, Filter } from 'lucide-react';
import type { RawMessageItem } from '@/types';
import { RawJsonViewer } from './RawJsonViewer';

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

interface RawMessagesListProps {
  items: RawMessageItem[];
}

export function RawMessagesList({ items }: RawMessagesListProps) {
  // All messages collapsed by default
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [filterRole, setFilterRole] = useState<'all' | 'assistant' | 'user'>('all');

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

  const filteredItems = items.filter(item => {
    if (filterRole === 'all') return true;
    if (filterRole === 'assistant') return item.info.role === 'assistant';
    if (filterRole === 'user') return item.info.role === 'user';
    return true;
  });

  // Newest first (raw messages are fed oldest → newest).
  const orderedItems = [...filteredItems].reverse();

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
            {filteredItems.length}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          {/* Quick Filter */}
          <div className="flex items-center bg-canvas border border-ink/10 rounded-lg p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setFilterRole('all')}
              className={`px-1.5 py-0.5 rounded ${filterRole === 'all' ? 'bg-ink text-canvas font-medium' : 'text-ink/60 hover:text-ink'}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterRole('assistant')}
              className={`px-1.5 py-0.5 rounded ${filterRole === 'assistant' ? 'bg-ink text-canvas font-medium' : 'text-ink/60 hover:text-ink'}`}
            >
              AI
            </button>
            <button
              type="button"
              onClick={() => setFilterRole('user')}
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
        {filteredItems.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink/40 italic bg-canvas rounded-xl border border-ink/10">
            No raw messages recorded yet.
          </div>
        ) : (
          orderedItems.map((item) => {
            const isExpanded = Boolean(expandedIds[item.id]);

            return (
              <div
                key={item.id}
                className="bg-canvas border border-ink/10 rounded-xl overflow-hidden transition-all duration-200"
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
    </div>
  );
}
