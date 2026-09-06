import React from 'react';
import { FileText, Undo2, Plus, Minus } from 'lucide-react';
import type { GitChange } from '@/types';

interface GitFileItemProps {
  change: GitChange;
  isStaged: boolean;
  viewMode?: 'flat' | 'tree';
  onAction: (actionType: string, file?: string) => void;
}

export function GitFileItem({ change, isStaged, onAction }: GitFileItemProps) {
  let charStatus = 'M';
  let colorClass = 'text-[#141310]';
  
  if (isStaged) {
    charStatus = change.status?.[0] || 'M';
    if (charStatus === 'A') colorClass = 'text-green-600';
    else if (charStatus === 'M') colorClass = 'text-blue-600';
    else if (charStatus === 'D') colorClass = 'text-[#c8321e]';
  } else {
    if (change.status === '??') {
      charStatus = 'U';
      colorClass = 'text-green-600';
    } else {
      charStatus = change.status?.[1] || change.status?.[0] || 'M';
      if (charStatus === 'M') colorClass = 'text-blue-600';
      else if (charStatus === 'D') colorClass = 'text-[#c8321e]';
    }
  }

  const parts = change.file.split('/');
  const fileName = parts.pop() || change.file;
  const dirPath = parts.length > 0 ? parts.join('/') : '';

  return (
    <div className="flex items-center justify-between px-3 py-1 hover:bg-[#141310]/5 cursor-pointer group text-[11px] transition-colors">
      <div className="flex items-center space-x-1.5 flex-1 min-w-0 pr-2">
        <span className={`font-bold font-mono text-[9px] w-3 flex-shrink-0 text-center ${colorClass}`} title={`Status: ${charStatus}`}>
          {charStatus}
        </span>
        <FileText size={12} className="text-[#141310]/60 flex-shrink-0" />
        <span className={`truncate ${colorClass}`} title={change.file}>
          {fileName}
        </span>
        {dirPath && (
          <span className="text-[9px] text-[#141310]/40 truncate ml-1">
            {dirPath}
          </span>
        )}
      </div>
      <div className="flex items-center space-x-1 text-[#141310]/40 flex-shrink-0">
        <div className="flex items-center opacity-0 group-hover:opacity-100 space-x-1">
          {!isStaged && (
            <>
              <button 
                type="button" 
                onClick={() => onAction('revert', change.file)} 
                title="Discard Changes" 
                className="w-5 h-5 flex items-center justify-center rounded hover:text-[#c8321e] hover:bg-[#c8321e]/10 cursor-pointer transition-colors"
              >
                <Undo2 size={11} />
              </button>
              <button 
                type="button" 
                onClick={() => onAction('stage', change.file)} 
                title="Stage Changes" 
                className="w-5 h-5 flex items-center justify-center rounded hover:text-[#141310] hover:bg-[#141310]/10 cursor-pointer transition-colors"
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
              className="w-5 h-5 flex items-center justify-center rounded hover:text-[#141310] hover:bg-[#141310]/10 cursor-pointer transition-colors"
            >
              <Minus size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
