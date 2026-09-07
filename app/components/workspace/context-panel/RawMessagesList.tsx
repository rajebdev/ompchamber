import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronsUpDown, Filter } from 'lucide-react';
import type { RawMessageItem } from '@/types';
import { RawJsonViewer } from './RawJsonViewer';

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

  return (
    <div className="space-y-3">
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
          filteredItems.map((item) => {
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
                    <span>{item.timestamp}</span>
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
