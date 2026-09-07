import React, { useState } from 'react';
import { 
  RotateCcw, 
  Copy, 
  MessageSquarePlus, 
  User, 
  Bot, 
  Hourglass,
  File as FileIcon,
  Check,
  Undo2
} from 'lucide-react';
import type { ChatMessageData } from '@/types';
import { ThinkingSection } from './ThinkingSection';
import { ToolCallingSection } from './ToolCallingSection';
import { GeneratingIndicator } from './GeneratingIndicator';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { copyToClipboard } from '@/hooks/useClipboard';
import { formatDuration } from '@/lib/chat-duration';

interface ChatMessageItemProps {
  msg: ChatMessageData | any;
  modelName?: string;
  isStreaming?: boolean;
  generatingVerb?: string;
  onRetry?: (msgId: string) => void;
  onUndo?: (msgId: string, content?: string) => void;
  onNewChat?: (content: string) => void;
  /** Render the AI metadata/toolbar footer. Only the last AI message of a
   *  response run should show it so multi-part JSONL responses do not repeat
   *  the footer per message. */
  footerVisible?: boolean;
  /** Extra classes on the root wrapper (e.g. spacing between messages). */
  className?: string;
  /** Elapsed ms of the whole AI response run — shown as ⏳ duration. */
  durationMs?: number | null;
}

export function ChatMessageItem({ 
  msg, 
  modelName, 
  isStreaming = false,
  generatingVerb,
  onRetry, 
  onUndo, 
  onNewChat,
  footerVisible = true,
  className = '',
  durationMs = null
}: ChatMessageItemProps) {
  const [copied, setCopied] = useState(false);

  const isUser = msg.role === 'user';

  /** Content is not worth rendering when it is empty or only punctuation
   *  placeholders ("." / "..." etc.) — chunked assistant turns often carry a
   *  lone dot while the real payload lives in tool calls / thinking. */
  const hasRenderableContent = typeof msg.content === 'string' && /[A-Za-z0-9]/.test(msg.content);

  const formatFooterDate = (value?: string) => {
    const raw = value || msg.timestamp;
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const handleCopy = async () => {
    if (msg.content) {
      const success = await copyToClipboard(msg.content);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleNewChat = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (onNewChat) {
      onNewChat(msg.content);
    }
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry(msg.id);
    } else {
      handleCopy();
    }
  };

  const handleUndo = () => {
    if (onUndo) {
      onUndo(msg.id, msg.content);
    }
  };

  if (isUser) {
    return (
      <div id={msg.id} className={`flex flex-col items-end space-y-1.5 w-full max-w-full ${className}`}>
        {/* User bubble - standardized to text-[13px] with markdown support */}
        <div className="bg-paper p-3.5 sm:p-4 rounded-xl border border-ink/15 text-[13px] text-ink shadow-xs max-w-[92%] sm:max-w-[85%] break-words whitespace-pre-wrap overflow-hidden flex flex-col space-y-2 font-sans select-text" style={{ lineHeight: 'var(--markdown-body-line-height)' }}>
          <MarkdownRenderer content={msg.content} />
          
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-ink/10">
              {msg.attachments.map((att: any, i: number) => (
                <div key={i} className="flex items-center space-x-2 bg-canvas px-2 py-1 rounded border border-ink/10 text-[11px] font-sans">
                  {att.preview ? (
                    <img 
                      src={att.preview} 
                      alt="attachment preview" 
                      className="w-6 h-6 rounded object-cover border border-ink/10" 
                    />
                  ) : (
                    <FileIcon size={12} className="text-ink/60" />
                  )}
                  <span className="truncate max-w-[120px] font-mono text-[10px]">{att.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* User Metadata & Toolbar (Undo on the left of Copy) */}
        <div className="flex items-center space-x-2.5 text-[11px] text-ink/60 px-1 font-mono">
          <div className="flex items-center space-x-1.5 border-r border-ink/15 pr-2.5">
            <User size={11} className="text-ink/70" />
            {formatFooterDate() && <span>{formatFooterDate()}</span>}
          </div>
          
          <div className="flex items-center space-x-1">
            {/* Undo Button (to the left of copy button) */}
            <button 
              type="button"
              className="flex items-center hover:text-ink transition-colors p-1 rounded hover:bg-ink/5 cursor-pointer" 
              title="Undo / Edit message"
              onClick={handleUndo}
            >
              <Undo2 size={12} />
            </button>

            {/* Copy Button */}
            <button 
              type="button"
              className="flex items-center hover:text-ink transition-colors p-1 rounded hover:bg-ink/5 cursor-pointer" 
              title="Copy prompt"
              onClick={handleCopy}
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>

            {/* New Chat Button */}
            <button 
              type="button"
              className="flex items-center hover:text-ink transition-colors p-1 rounded hover:bg-ink/5 cursor-pointer" 
              title="New Chat from here"
              onClick={handleNewChat}
            >
              <MessageSquarePlus size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Assistant / AI Message Rendering
  const thinkingData = msg.thinking || (msg.monologue ? { thought: msg.monologue } : undefined);
  const allToolCalls = msg.toolCalls || msg.actions;
  const secondaryToolCalls = msg.actions2;
  const currentModel = modelName || 'DeepSeek V4 Pro';

  return (
    <div 
      id={msg.id} 
      className={`flex flex-col items-start space-y-2 w-full max-w-full transition-all ${
        isStreaming ? 'pb-10 mb-2' : ''
      } ${className}`}
    >
      {/* Main AI Response Container */}
      <div className="w-full space-y-2.5 font-sans leading-relaxed">
        
        {/* Thinking / Reasoning Accordion */}
        {thinkingData && (
          <ThinkingSection 
            thinking={thinkingData} 
            defaultExpanded={false}
          />
        )}

        {/* Primary Tool Executions Accordion */}
        {allToolCalls && allToolCalls.length > 0 && (
          <ToolCallingSection 
            tools={allToolCalls}
            title={allToolCalls.length === 1 ? 'Tool Execution (1 step)' : `Tool Executions (${allToolCalls.length} steps)`}
            defaultExpanded={false}
          />
        )}

        {/* Intermediate Diagnostic Note */}
        {msg.systemNote && (
          <div className="text-[12px] text-ink leading-relaxed border-l-2 border-ink/30 bg-paper/60 px-3 py-2 rounded-r-md font-mono break-words whitespace-pre-wrap select-text">
            <span className="text-[10px] text-ink/50 uppercase tracking-wider block mb-0.5 font-sans font-semibold">
              Diagnostic Note
            </span>
            {msg.systemNote}
          </div>
        )}

        {/* Secondary Tool Executions */}
        {secondaryToolCalls && secondaryToolCalls.length > 0 && (
          <ToolCallingSection 
            tools={secondaryToolCalls}
            title={`Follow-up Tools (${secondaryToolCalls.length})`}
            defaultExpanded={true}
          />
        )}

        {/* Main AI Response Content (Rich Markdown with code blocks, tables, lists) */}
        {hasRenderableContent && (
          <div className="text-[13px] text-ink leading-relaxed font-sans bg-transparent py-1 select-text">
            <MarkdownRenderer content={msg.content} />
            {isStreaming && (
              <span className="inline-block w-1.5 h-3.5 bg-ink/70 ml-1 translate-y-0.5 animate-pulse" />
            )}
          </div>
        )}

        {/* AI Final Summary / Conclusion Card (Only shown when not streaming) */}
        {!isStreaming && msg.summary && (
          <div className="text-[12px] text-ink bg-paper border border-ink/15 rounded-lg p-3 space-y-1 select-text font-sans">
            <div className="font-semibold text-ink flex items-center space-x-1.5 text-[12px]">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span>Resolution Summary</span>
            </div>
            <p className="text-ink/80 leading-relaxed text-[12px]">{msg.summary}</p>
          </div>
        )}
      </div>
      
      {/* Bottom AI Metadata & Actions Toolbar (Only shown once completed) */}
      {!isStreaming && footerVisible && (
        <div className="w-full flex items-center flex-nowrap space-x-2.5 text-[11px] text-ink/60 px-1 pt-0.5 font-mono min-w-0 animate-in fade-in duration-200">
          
          {/* Model and Date / Time with truncation protection */}
          <div className="flex items-center space-x-1.5 border-r border-ink/15 pr-2.5 min-w-0 shrink overflow-hidden" title={`${currentModel} • ${msg.date || msg.timestamp || 'Just now'}`}>
            <div className="w-4 h-4 rounded flex items-center justify-center bg-ink text-canvas shadow-2xs shrink-0">
              <Bot size={10} />
            </div>
            <span className="font-semibold text-ink truncate shrink">
              {currentModel}
            </span>
            <span className="text-ink/40 shrink-0">•</span>
            {formatFooterDate() && (
              <span className="text-ink/60 shrink-0 whitespace-nowrap">{formatFooterDate()}</span>
            )}
            {formatDuration(durationMs ?? 0) && (
              <>
                <span className="text-ink/40 shrink-0">•</span>
                <span
                  className="text-ink/60 shrink-0 whitespace-nowrap flex items-center space-x-1"
                  title={`Response time: ${formatDuration(durationMs ?? 0)}`}
                >
                  <Hourglass size={11} className="text-ink/50 flex-shrink-0" />
                  <span>{formatDuration(durationMs ?? 0)}</span>
                </span>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-1 shrink-0">
            {/* Quick Retry Action */}
            <button 
              type="button"
              className="flex items-center hover:text-ink transition-colors p-1 rounded hover:bg-ink/5 cursor-pointer" 
              title="Re-run / Retry generation"
              onClick={handleRetry}
            >
              <RotateCcw size={12} />
            </button>

            {/* Quick Copy Action */}
            <button 
              type="button"
              className="flex items-center hover:text-ink transition-colors p-1 rounded hover:bg-ink/5 cursor-pointer" 
              title="Copy response"
              onClick={handleCopy}
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>

            {/* New Chat Action */}
            <button 
              type="button"
              className="flex items-center hover:text-ink transition-colors p-1 rounded hover:bg-ink/5 cursor-pointer" 
              title="New Chat from here"
              onClick={handleNewChat}
            >
              <MessageSquarePlus size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
