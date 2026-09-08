import { useState, useRef, useMemo } from 'react';
import { Folder, ChevronDown, Check } from 'lucide-react';
import type { Attachment } from '@/types';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { ChatInput } from '@/components/workspace/chat-timeline/ChatInput';

interface EmptyWorkspacePromptProps {
  className?: string;
  folders?: any[];
  selectedFolderId: number | null;
  setSelectedFolderId: (id: number | null) => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  inputAttachments?: Attachment[];
  setInputAttachments?: (atts: React.SetStateAction<Attachment[]>) => void;
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
    <div className={`flex flex-col h-full bg-canvas items-center justify-center p-8 ${className}`}>
      <div className="w-full max-w-[970px] flex flex-col items-start space-y-2">
        {/* Workspace Selection Seamless Dropdown (No border, transparent background) */}
        <div className="relative" ref={workspaceRef}>
          <button 
            type="button"
            onClick={() => setShowWorkspace(!showWorkspace)}
            className="group flex items-center space-x-1.5 px-1.5 py-1 rounded-md text-xs font-medium text-ink/75 hover:text-ink hover:bg-ink/5 focus-visible:bg-ink/5 transition-all outline-none cursor-pointer select-none"
          >
            <Folder size={13} className="text-ink/50 group-hover:text-ink/80 transition-colors flex-shrink-0" />
            <span className="flex items-center space-x-1 max-w-[260px] truncate tracking-tight">
              <span>{selectedFolder ? selectedFolder.name : 'Select Workspace Context'}</span>
            </span>
            <ChevronDown size={13} className={`text-ink/40 group-hover:text-ink/70 flex-shrink-0 transition-transform duration-150 ${showWorkspace ? 'rotate-180 text-ink/70' : ''}`} />
          </button>
          
          {showWorkspace && (
            <div className="absolute bottom-full left-0 mb-1.5 w-64 bg-paper border border-ink/10 rounded-lg shadow-lg z-50 flex flex-col overflow-hidden text-xs py-1">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-ink/40 font-semibold border-b border-ink/5">
                Target Workspace
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {folders.length === 0 ? (
                  <div className="px-3 py-2 text-ink/40 italic">No workspaces available</div>
                ) : (
                  folders.map((f: any) => (
                    <button 
                      key={f.id}
                      type="button"
                      onClick={() => { setSelectedFolderId(f.id); setShowWorkspace(false); }}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors cursor-pointer ${
                        selectedFolderId === f.id
                          ? 'bg-ink/10 text-ink font-semibold'
                          : 'text-ink/80 hover:bg-ink/5 hover:text-ink'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate pr-2">
                        <Folder size={12} className={selectedFolderId === f.id ? "text-ink flex-shrink-0" : "text-ink/50 flex-shrink-0"} />
                        <span className="truncate font-medium">{f.name}</span>
                      </div>
                      {selectedFolderId === f.id && <Check size={12} className="text-ink flex-shrink-0" />}
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
