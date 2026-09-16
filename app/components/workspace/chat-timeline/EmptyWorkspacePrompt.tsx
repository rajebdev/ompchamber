import { useState, useRef, useMemo, useEffect } from 'react';
import { Folder, ChevronDown, Check } from 'lucide-react';
import type { Attachment, ChatMessageData } from '@/types';
import { useOnClickOutside } from '@/hooks/ui/on-click-outside';
import { ChatInput } from '@/components/workspace/chat-timeline/chat-input/index';
import { ChatMessageItem } from '@/components/workspace/chat-timeline/MessageItem';
import { GeneratingIndicator } from '@/components/workspace/chat-timeline/GeneratingIndicator';
import type { ApprovalMode } from '@/lib/omp/config/access-mode';

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
  /** Messages of the pending session: rendered above the input so the
   *  optimistic user bubble shows immediately on send (before the omp spawn
   *  completes and the real session timeline takes over). */
  localMessages?: ChatMessageData[];
  provider?: string;
  providerNames?: Record<string, string>;
  modelName?: string;
  modelNames?: Record<string, string>;
  rootPath?: string | null;
  onThinkingLevelChange?: (level: string) => void;
  onModelChange?: (provider: string, modelId: string) => void;
  sessionModel?: { provider: string; modelId: string } | null;
  sessionThinkingLevel?: string | null;
  accessMode: ApprovalMode;
  onAccessModeChange: (mode: ApprovalMode) => void;
  generatingVerb?: string;
  variant?: 'desktop' | 'mobile';
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
  appSettings = {},
  localMessages = [],
  provider,
  providerNames,
  modelName,
  modelNames,
  rootPath,
  onThinkingLevelChange,
  onModelChange,
  sessionModel,
  sessionThinkingLevel,
  accessMode,
  onAccessModeChange,
  generatingVerb,
  variant = 'desktop',
}: EmptyWorkspacePromptProps) {
  const [showWorkspace, setShowWorkspace] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(workspaceRef, () => setShowWorkspace(false));
  const timelineRef = useRef<HTMLDivElement>(null);

  const selectedFolder = useMemo(() => {
    return folders?.find(f => f.id === selectedFolderId);
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [localMessages.length]);

  return (
    <div className={`flex flex-col h-full bg-canvas ${variant === 'mobile' ? 'px-3 py-4' : 'p-8'} ${className}`}
      style={variant === 'mobile' ? { paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' } : undefined}
    >
      <div
        className={`mx-auto w-full max-w-[970px] flex flex-col min-h-0 space-y-3 ${
          localMessages.length > 0 ? 'flex-1' : 'my-auto justify-center'
        }`}
      >
        {/* Workspace Selection Seamless Dropdown (No border, transparent
            background). Hidden once a chat has been sent — the session now has
            a target workspace, so the composer is the only focus. */}
        {localMessages.length === 0 && (
          <div className="relative shrink-0" ref={workspaceRef}>
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
              <div className="max-h-56 scrollbar-overlay-container scrollbar-overlay-static py-1">
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
        )}

        {/* Pending session timeline: optimistic bubbles render here immediately
            on send, then the real session (UUID) takes over the ChatTimeline.
            Only shown when there are messages so the empty composer stays
            centered next to the workspace picker. */}
        {localMessages.length > 0 && (
          <div
            ref={timelineRef}
            className="flex-1 min-h-0 overflow-y-auto scroll-smooth overscroll-contain"
          >
            <div className="mx-auto w-full max-w-[970px]">
              {localMessages.map((msg, idx) => {
                const prev = localMessages[idx - 1];
                let lastAiIdx = localMessages.length - 1;
                while (lastAiIdx >= 0 && localMessages[lastAiIdx].notice) lastAiIdx--;
                const isLoading = isGenerating && idx === lastAiIdx && msg.role === 'ai';
                const isAiFragment = msg.role !== 'user' && prev && prev.role !== 'user';
                // Notice rows are transparent for footer purposes — the last
                // real AI message of a run still owns the footer (mirror
                // ChatTimeline) and the notice itself never gets one.
                const nextReal = localMessages.slice(idx + 1).find(m => !m.notice);
                const isLastAi = msg.role !== 'user' && !msg.notice && (!nextReal || nextReal.role === 'user');
                return (
                  <ChatMessageItem
                    key={msg.id}
                    msg={msg}
                    provider={provider}
                    providerNames={providerNames}
                    modelName={modelName}
                    modelNames={modelNames}
                    isStreaming={isLoading}
                    footerVisible={isLastAi}
                    className={isAiFragment ? 'mt-1' : 'mt-8'}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Docked above the input, mirroring chat-timeline/index.tsx so the
            indicator does not jump when a pending new chat adopts its omp
            session and the main timeline branch takes over rendering. */}
        {isGenerating && (
          <GeneratingIndicator
            modelName={modelName}
            generatingVerb={generatingVerb}
          />
        )}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          rootPath={rootPath}
          attachments={inputAttachments}
          onAttachmentsChange={setInputAttachments}
          onSend={onSend}
          isGenerating={isGenerating}
          disabled={!selectedFolderId}
          className="w-full shrink-0"
          appSettings={appSettings}
          onThinkingLevelChange={onThinkingLevelChange}
          onModelChange={onModelChange}
          sessionModel={sessionModel}
          sessionThinkingLevel={sessionThinkingLevel}
          accessMode={accessMode}
          onAccessModeChange={onAccessModeChange}
          variant={variant}
        />
      </div>
    </div>
  );
}
