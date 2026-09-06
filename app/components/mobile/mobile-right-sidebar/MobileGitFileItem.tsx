import React from 'react';
import { Undo2, Plus, Minus, FileCode, FileText } from 'lucide-react';
import type { GitChange } from '@/types';

interface MobileGitFileItemProps {
  change: GitChange;
  isStaged: boolean;
  viewMode: 'flat' | 'tree';
  onAction: (actionType: string, file?: string) => void;
}

export function MobileGitFileItem({ change, isStaged, viewMode, onAction }: MobileGitFileItemProps) {
  let charStatus = 'M';
  let colorClass = 'text-blue-600';

  if (isStaged) {
    charStatus = change.status?.[0] || 'M';
    if (charStatus === 'A') colorClass = 'text-emerald-700';
    else if (charStatus === 'M') colorClass = 'text-blue-600';
    else if (charStatus === 'D') colorClass = 'text-[#c8321e]';
  } else {
    if (change.status === '??') {
      charStatus = 'U';
      colorClass = 'text-emerald-700';
    } else {
      charStatus = change.status?.[1] || change.status?.[0] || 'M';
      if (charStatus === 'M') colorClass = 'text-blue-600';
      else if (charStatus === 'D') colorClass = 'text-[#c8321e]';
    }
  }

  const fileName = viewMode === 'flat' ? change.file : (change.file.split('/').pop() || change.file);
  const dirPath = viewMode === 'tree' && change.file.includes('/') 
    ? change.file.substring(0, change.file.lastIndexOf('/')) 
    : null;

  const isMd = change.file.endsWith('.md');

  return (
    <div className="flex items-center justify-between py-1.5 px-3 hover:bg-[#141310]/5 transition-colors text-xs border-b border-[#141310]/5">
      <div className="flex items-center space-x-1.5 truncate pr-2 flex-1 min-w-0">
        <span className={`font-bold font-mono text-[10px] w-3.5 flex-shrink-0 ${colorClass}`}>
          {charStatus}
        </span>
        {isMd ? (
          <FileText size={13} className="text-[#141310]/50 flex-shrink-0" />
        ) : (
          <FileCode size={13} className="text-[#141310]/50 flex-shrink-0" />
        )}
        <span className="truncate text-xs text-[#141310] font-mono">{fileName}</span>
        {dirPath && (
          <span className="text-[10px] text-[#141310]/40 truncate ml-1 font-sans">
            {dirPath}
          </span>
        )}
      </div>

      <div className="flex items-center space-x-1 flex-shrink-0">
        {isStaged ? (
          <button
            type="button"
            onClick={() => onAction('unstage', change.file)}
            title="Unstage change"
            className="w-6 h-6 flex items-center justify-center rounded text-[#141310]/50 hover:text-[#141310] hover:bg-[#141310]/10 active:scale-95 transition-colors cursor-pointer"
          >
            <Minus size={13} />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onAction('revert', change.file)}
              title="Discard change"
              className="w-6 h-6 flex items-center justify-center rounded text-[#141310]/50 hover:text-[#c8321e] hover:bg-[#c8321e]/10 active:scale-95 transition-colors cursor-pointer"
            >
              <Undo2 size={13} />
            </button>
            <button
              type="button"
              onClick={() => onAction('stage', change.file)}
              title="Stage change"
              className="w-6 h-6 flex items-center justify-center rounded text-[#141310]/50 hover:text-[#141310] hover:bg-[#141310]/10 active:scale-95 transition-colors cursor-pointer"
            >
              <Plus size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
