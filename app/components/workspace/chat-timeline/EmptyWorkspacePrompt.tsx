import React, { useState, useRef, useMemo } from 'react';
import { Folder, ChevronDown, Check } from 'lucide-react';
import type { Attachment } from '@/types';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { ChatInput } from './ChatInput';

interface EmptyWorkspacePromptProps {
  className?: string;
  folders?: any[];
  selectedFolderId: number | null;
  setSelectedFolderId: (id: number | null) => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  inputAttachments?: Attachment[];
  setInputAttachments?: (atts: Attachment[]) => void;
  onSend: (attachments: Attachment[]) => void;
  isGenerating: boolean;
  appSettings?: Record<string, any>;
}

export function EmptyWorkspacePrompt({
  className = '',
  folders = [],
  selectedFolderId,
  setSelectedFolderId,
  inputValue,
  setInputValue,
  inputAttachments,
  setInputAttachments,
  onSend,
  isGenerating,
  appSettings = {}
}: EmptyWorkspacePromptProps) {
  const [showWorkspace, setShowWorkspace] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(workspaceRef, () => setShowWorkspace(false));

  const selectedFolder = useMemo(() => {
    return folders?.find(f => f.id === selectedFolderId);
  }, [folders, selectedFolderId]);

  return (
    <div className={`flex flex-col h-full bg-[#f4f1ea] items-center justify-center p-8 ${className}`}>
      <div className="w-full max-w-3xl flex flex-col items-start space-y-2">
        {/* Workspace Selection Small Dropdown */}
        <div className="relative" ref={workspaceRef}>
          <button 
            onClick={() => setShowWorkspace(!showWorkspace)}
            className="flex items-center space-x-1.5 hover:bg-[#141310]/5 px-2 py-1 rounded transition-colors text-xs text-[#141310]/80 font-medium bg-[#faf8f3] border border-[#141310]/20 shadow-sm focus:border-[#141310]/50 outline-none"
          >
            <Folder size={12} className="text-[#141310]/60" />
            <span className="flex items-center space-x-1 max-w-[250px] truncate">
              <span>{selectedFolder ? selectedFolder.name : 'Select Workspace Context'}</span>
            </span>
            <ChevronDown size={12} className="text-[#141310]/40" />
          </button>
          
          {showWorkspace && (
            <div className="absolute bottom-full left-0 mb-1 w-64 bg-[#faf8f3] border border-[#141310]/20 rounded-md shadow-lg z-50 flex flex-col overflow-hidden text-xs">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-[#141310]/40 font-semibold border-b border-[#141310]/10 bg-[#f4f1ea]">
                Target Workspace
              </div>
              <div className="max-h-48 overflow-y-auto">
                {folders.length === 0 ? (
                  <div className="px-3 py-2 text-[#141310]/40 italic">No workspaces available</div>
                ) : (
                  folders.map((f: any) => (
                    <button 
                      key={f.id}
                      onClick={() => { setSelectedFolderId(f.id); setShowWorkspace(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-[#141310]/5 flex items-center justify-between transition-colors"
                    >
                      <span className="truncate text-[#141310] font-medium">{f.name}</span>
                      {selectedFolderId === f.id && <Check size={12} className="text-[#141310]" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <ChatInput 
          value={inputValue}
          onChange={setInputValue}
          attachments={inputAttachments}
          onAttachmentsChange={setInputAttachments}
          onSend={(attachments) => {
            if (!selectedFolderId) {
              alert('Please select a workspace before prompting.');
              return;
            }
            onSend(attachments);
          }}
          isGenerating={isGenerating}
          disabled={!selectedFolderId}
          className="w-full"
          appSettings={appSettings}
        />
      </div>
    </div>
  );
}
