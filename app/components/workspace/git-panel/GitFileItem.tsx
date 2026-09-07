import React from 'react';
import { Undo2, Plus, Minus } from 'lucide-react';
import { FileIcon } from '../../common/FileIcon';
import type { GitChange } from '@/types';

interface GitFileItemProps {
  change: GitChange;
  isStaged: boolean;
  viewMode?: 'flat' | 'tree';
  onAction: (actionType: string, file?: string) => void;
}

export function GitFileItem({ change, isStaged, onAction }: GitFileItemProps) {
  let charStatus = 'M';
  let colorClass = 'text-ink';
  
  if (isStaged) {
    charStatus = change.status?.[0] || 'M';
    if (charStatus === 'A') colorClass = 'text-green-600';
    else if (charStatus === 'M') colorClass = 'text-blue-600';
    else if (charStatus === 'D') colorClass = 'text-error';
  } else {
    if (change.status === '??') {
      charStatus = 'U';
      colorClass = 'text-green-600';
    } else {
      charStatus = change.status?.[1] || change.status?.[0] || 'M';
      if (charStatus === 'M') colorClass = 'text-blue-600';
      else if (charStatus === 'D') colorClass = 'text-error';
    }
  }

  const parts = change.file.split('/');
  const fileName = parts.pop() || change.file;
  const dirPath = parts.length > 0 ? parts.join('/') : '';

  return (
    <div className="flex items-center justify-between px-3 py-1 hover:bg-ink/5 cursor-pointer group text-[11px] transition-colors">
      <div className="flex items-center space-x-1.5 flex-1 min-w-0 pr-2">
        <span className={`font-bold font-mono text-[9px] w-3 flex-shrink-0 text-center ${colorClass}`} title={`Status: ${charStatus}`}>
          {charStatus}
        </span>
        <FileIcon name={fileName} size={12} className="flex-shrink-0" />
        <span className={`truncate ${colorClass}`} title={change.file}>
          {fileName}
        </span>
        {dirPath && (
          <span className="text-[9px] text-ink/40 truncate ml-1">
            {dirPath}
          </span>
        )}
      </div>
      <div className="flex items-center space-x-1 text-ink/40 flex-shrink-0">
        <div className="flex items-center opacity-0 group-hover:opacity-100 space-x-1">
          {!isStaged && (
            <>
              <button 
                type="button" 
                onClick={() => onAction('revert', change.file)} 
                title="Discard Changes" 
                className="w-5 h-5 flex items-center justify-center rounded hover:text-error hover:bg-error/10 cursor-pointer transition-colors"
              >
                <Undo2 size={11} />
              </button>
              <button 
                type="button" 
                onClick={() => onAction('stage', change.file)} 
                title="Stage Changes" 
                className="w-5 h-5 flex items-center justify-center rounded hover:text-ink hover:bg-ink/10 cursor-pointer transition-colors"
              >
                <Plus size={11} />
              </button>
            </>
          )}
          {isStaged && (
            <button 
              type="button" 
              onClick={() => onAction('unstage', change.file)} 
              title="Unstage Changes" 
              className="w-5 h-5 flex items-center justify-center rounded hover:text-ink hover:bg-ink/10 cursor-pointer transition-colors"
            >
              <Minus size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
