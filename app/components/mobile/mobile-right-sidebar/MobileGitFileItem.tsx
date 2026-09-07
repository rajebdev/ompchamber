import React from 'react';
import { Undo2, Plus, Minus } from 'lucide-react';
import { FileIcon } from '../../common/FileIcon';
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
    if (charStatus === 'A') colorClass = 'text-success';
    else if (charStatus === 'M') colorClass = 'text-blue-600';
    else if (charStatus === 'D') colorClass = 'text-error';
  } else {
    if (change.status === '??') {
      charStatus = 'U';
      colorClass = 'text-success';
    } else {
      charStatus = change.status?.[1] || change.status?.[0] || 'M';
      if (charStatus === 'M') colorClass = 'text-blue-600';
      else if (charStatus === 'D') colorClass = 'text-error';
    }
  }

  const fileName = viewMode === 'flat' ? change.file : (change.file.split('/').pop() || change.file);
  const dirPath = viewMode === 'tree' && change.file.includes('/') 
    ? change.file.substring(0, change.file.lastIndexOf('/')) 
    : null;

  

  return (
    <div className="flex items-center justify-between py-1.5 px-3 hover:bg-ink/5 transition-colors text-xs border-b border-ink/5">
      <div className="flex items-center space-x-1.5 truncate pr-2 flex-1 min-w-0">
        <span className={`font-bold font-mono text-[10px] w-3.5 flex-shrink-0 ${colorClass}`}>
          {charStatus}
        </span>
        <FileIcon name={fileName} size={13} className="flex-shrink-0" />
        <span className="truncate text-xs text-ink font-mono">{fileName}</span>
        {dirPath && (
          <span className="text-[10px] text-ink/40 truncate ml-1 font-sans">
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
            className="w-6 h-6 flex items-center justify-center rounded text-ink/50 hover:text-ink hover:bg-ink/10 active:scale-95 transition-colors cursor-pointer"
          >
            <Minus size={13} />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onAction('revert', change.file)}
              title="Discard change"
              className="w-6 h-6 flex items-center justify-center rounded text-ink/50 hover:text-error hover:bg-error/10 active:scale-95 transition-colors cursor-pointer"
            >
              <Undo2 size={13} />
            </button>
            <button
              type="button"
              onClick={() => onAction('stage', change.file)}
              title="Stage change"
              className="w-6 h-6 flex items-center justify-center rounded text-ink/50 hover:text-ink hover:bg-ink/10 active:scale-95 transition-colors cursor-pointer"
            >
              <Plus size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
