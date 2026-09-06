import React from 'react';
import { Plus, Minus, Undo2 } from 'lucide-react';
import type { GitChange } from '@/types';
import { MobileGitTreeView } from './MobileGitTreeView';
import { MobileGitFileItem } from './MobileGitFileItem';

interface MobileGitSectionProps {
  title: string;
  count: number;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  isStaged: boolean;
  viewMode: 'flat' | 'tree';
  changes: GitChange[];
  onAction: (actionType: string, file?: string) => void;
}

export function MobileGitSection({
  title,
  count,
  isExpanded,
  onToggleExpanded,
  isStaged,
  viewMode,
  changes,
  onAction,
}: MobileGitSectionProps) {
  if (isStaged && count === 0) return null;

  return (
    <div className={isStaged ? 'mb-2' : ''}>
      <div className="flex items-center justify-between px-3 py-1.5 hover:bg-[#141310]/5 cursor-pointer">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex items-center space-x-1 font-semibold text-[#141310] text-xs"
        >
          <span className="w-3 text-center">{isExpanded ? '▾' : '▸'}</span>
          <span>{title}</span>
          <span className="text-[#141310]/40 font-normal ml-1 border border-[#141310]/20 rounded-full px-1.5 text-[9px] bg-white">
            {count}
          </span>
        </button>

        <div className="flex items-center space-x-1 text-[#141310]/40 flex-shrink-0">
          {isStaged ? (
            <button
              type="button"
              onClick={() => onAction('unstage_all')}
              title="Unstage All Changes"
              className="w-6 h-6 flex items-center justify-center rounded text-[#141310]/50 hover:text-[#141310] hover:bg-[#141310]/10 active:scale-95 transition-colors cursor-pointer"
            >
              <Minus size={13} />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onAction('revert_all')}
                title="Discard All Changes"
                className="w-6 h-6 flex items-center justify-center rounded text-[#141310]/50 hover:text-[#c8321e] hover:bg-[#c8321e]/10 active:scale-95 transition-colors cursor-pointer"
              >
                <Undo2 size={13} />
              </button>
              <button
                type="button"
                onClick={() => onAction('stage_all')}
                title="Stage All Changes"
                className="w-6 h-6 flex items-center justify-center rounded text-[#141310]/50 hover:text-[#141310] hover:bg-[#141310]/10 active:scale-95 transition-colors cursor-pointer"
              >
                <Plus size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        changes.length === 0 ? (
          <div className="p-4 text-center text-[#141310]/40 italic">
            No changes found.
          </div>
        ) : viewMode === 'tree' ? (
          <MobileGitTreeView
            changes={changes}
            isStaged={isStaged}
            onAction={onAction}
          />
        ) : (
          changes.map(change => (
            <MobileGitFileItem
              key={`${change.file}-${isStaged ? 'staged' : 'unstaged'}`}
              change={change}
              isStaged={isStaged}
              viewMode={viewMode}
              onAction={onAction}
            />
          ))
        )
      )}
    </div>
  );
}
