import { useState } from 'react';
import { Plus, Minus, Undo2 } from 'lucide-react';
import type { GitChange } from '@/types';
import { GitFileItem } from './GitFileItem';
import { GitTreeView } from './GitTreeView';

interface GitChangesListProps {
  changes: GitChange[];
  isLoading: boolean;
  viewMode: 'flat' | 'tree';
  onAction: (actionType: string, file?: string) => void;
}

export function GitChangesList({ changes, isLoading, viewMode, onAction }: GitChangesListProps) {
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [unstagedExpanded, setUnstagedExpanded] = useState(true);

  const stagedChanges = changes.filter(c => {
    const status = c.status;
    return status && status[0] !== ' ' && status[0] !== '?';
  });

  const unstagedChanges = changes.filter(c => {
    const status = c.status;
    return (status && status[1] !== ' ' && status[1] !== '?') || status === '??';
  });

  if (isLoading && changes.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto font-mono text-[11px] text-ink/80">
        <div className="p-4 text-center text-ink/40 italic">Loading...</div>
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto font-mono text-[11px] text-ink/80">
        <div className="p-4 text-center text-ink/40 italic">No changes found.</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto font-mono text-[11px] text-ink/80">
      <div className="py-1">
        {stagedChanges.length > 0 && (
          <div className="mb-2">
            <div
              className="flex items-center justify-between px-3 py-1 group hover:bg-ink/5 cursor-pointer transition-colors"
              onClick={() => setStagedExpanded(!stagedExpanded)}
            >
              <div className="flex items-center space-x-1 font-semibold text-ink text-xs">
                <span className="w-3 text-center">{stagedExpanded ? '▾' : '▸'}</span>
                <span>Staged Changes</span>
                <span className="text-ink/40 font-normal ml-1 border border-ink/20 rounded-full px-1.5 text-[9px] bg-paper">
                  {stagedChanges.length}
                </span>
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 text-ink/40 flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction('unstage_all');
                  }}
                  title="Unstage All Changes"
                  className="w-5 h-5 flex items-center justify-center rounded hover:text-ink hover:bg-ink/10 cursor-pointer transition-colors"
                >
                  <Minus size={12} />
                </button>
              </div>
            </div>

            {stagedExpanded && (
              viewMode === 'tree' ? (
                <GitTreeView
                  changes={stagedChanges}
                  isStaged={true}
                  onAction={onAction}
                />
              ) : (
                stagedChanges.map(c => (
                  <GitFileItem
                    key={c.file + 'staged'}
                    change={c}
                    isStaged={true}
                    onAction={onAction}
                  />
                ))
              )
            )}
          </div>
        )}

        {unstagedChanges.length > 0 && (
          <div>
            <div
              className="flex items-center justify-between px-3 py-1 group hover:bg-ink/5 cursor-pointer transition-colors"
              onClick={() => setUnstagedExpanded(!unstagedExpanded)}
            >
              <div className="flex items-center space-x-1 font-semibold text-ink text-xs">
                <span className="w-3 text-center">{unstagedExpanded ? '▾' : '▸'}</span>
                <span>Changes</span>
                <span className="text-ink/40 font-normal ml-1 border border-ink/20 rounded-full px-1.5 text-[9px] bg-paper">
                  {unstagedChanges.length}
                </span>
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 text-ink/40 flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction('revert_all');
                  }}
                  title="Discard All Changes"
                  className="w-5 h-5 flex items-center justify-center rounded hover:text-error hover:bg-error/10 cursor-pointer transition-colors"
                >
                  <Undo2 size={12} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction('stage_all');
                  }}
                  title="Stage All Changes"
                  className="w-5 h-5 flex items-center justify-center rounded hover:text-ink hover:bg-ink/10 cursor-pointer transition-colors"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {unstagedExpanded && (
              viewMode === 'tree' ? (
                <GitTreeView
                  changes={unstagedChanges}
                  isStaged={false}
                  onAction={onAction}
                />
              ) : (
                unstagedChanges.map(c => (
                  <GitFileItem
                    key={c.file + 'unstaged'}
                    change={c}
                    isStaged={false}
                    onAction={onAction}
                  />
                ))
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
