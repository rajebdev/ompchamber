import { memo, useMemo, useState } from 'react';
import { 
  Copy, 
  User, 
  Check,
  Undo2,
  AlertCircle,
  MessageSquarePlus,
  Info,
  Bot
} from 'lucide-react';
import type { ChatMessageData, ToolCallData } from '@/types';
import { ThinkingSection } from '@/components/workspace/chat-timeline/ThinkingSection';
import { ToolCallingSection } from '@/components/workspace/chat-timeline/ToolCallingSection';
import { SystemNotice } from '@/components/workspace/chat-timeline/SystemNotice';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { AttachmentChips } from '@/components/workspace/chat-timeline/AttachmentChips';
import { AiMessageFooter } from '@/components/workspace/chat-timeline/AiMessageFooter';
import { copyToClipboard } from '@/hooks/ui/clipboard';

interface ChatMessageItemProps {
  msg: ChatMessageData | any;
  provider?: string;
  providerNames?: Record<string, string>;
  modelName?: string;
  /** id → display-name map from the model catalog; resolves per-message ids. */
  modelNames?: Record<string, string>;
  isStreaming?: boolean;
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
  /** Whether the message immediately preceding this one was also an assistant message. */
  isPrevAssistant?: boolean;
}

function capitalizeFirstLetter(text: string): string {
  if (!text) return text;
  const match = text.match(/^(\s*)([a-zA-Z\u00C0-\u024F])(.*)$/s);
  if (match) {
    return match[1] + match[2].toUpperCase() + match[3];
  }
  return text;
}

export const ChatMessageItem = memo(function ChatMessageItem({
  msg,
  provider,
  providerNames,
  modelName, 
  modelNames,
  isStreaming = false,
  onRetry, 
  onUndo, 
  onNewChat,
  footerVisible = true,
  className = '',
  durationMs = null,
  isPrevAssistant = false,
}: ChatMessageItemProps) {
  const [copied, setCopied] = useState(false);

  const isUser = msg.role === 'user';

  /** Stable string references for MarkdownRenderer so its internal
   *  useMemo([content]) holds across parent re-renders (streaming frames
   *  replace the timeline array identity every frame). */
  const userContent = useMemo(() => (typeof msg.content === 'string' ? msg.content.trim() : msg.content), [msg.content]);
  const assistantContent = useMemo(() => (typeof msg.content === 'string' ? capitalizeFirstLetter(msg.content) : msg.content), [msg.content]);

  /** Content is not worth rendering when it is empty or only punctuation
   *  placeholders ("." / "..." etc.) — chunked assistant turns often carry a
   *  lone dot while the real payload lives in tool calls / thinking. */
  const hasRenderableContent = typeof msg.content === 'string' && /[A-Za-z0-9]/.test(msg.content);

  const formatFooterDate = (value?: string) => {
    const raw = value || msg.timestamp || msg.date;
    if (!raw) return '';
    // Live-stream messages carry a preformatted "Today, 10:30 AM" label.
    if (raw.startsWith('Today,')) {
      return `Today, ${raw.slice('Today,'.length).trim()}`;
    }
    // Bare "10:30 AM" timestamp (live path) — resolve against today.
    if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(raw)) {
      const parsed = new Date(`${new Date().toDateString()} ${raw}`);
      if (!Number.isNaN(parsed.getTime())) {
        return `Today, ${parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
      }
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${day}, ${time}`;
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

  const handleUndo = () => {
    if (onUndo) {
      onUndo(msg.id, msg.content);
    }
  };

  if (isUser) {
    const isAgentAttributed = msg.attribution === 'agent';

    return (
      <div id={msg.id} className={`flex flex-col items-end space-y-1.5 w-full max-w-full ${className}`}>
        {/* User bubble - standardized to text-[13px] with markdown support */}
        <div className="bg-paper p-3.5 sm:p-4 rounded-xl border border-ink/15 text-[13px] text-ink shadow-xs max-w-[92%] sm:max-w-[85%] break-words overflow-hidden flex flex-col space-y-2 font-sans select-text mx-3" style={{ lineHeight: 'var(--markdown-body-line-height)' }}>
          {isAgentAttributed && (
            <div className="flex items-center space-x-1.5 pb-1.5 mb-1 border-b border-ink/10 text-[11px] font-mono text-ink/70">
              <Bot size={12} className="text-ink shrink-0" />
              <span className="font-semibold text-ink">Subagent Assignment</span>
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink/5 text-ink/60">Delegated</span>
            </div>
          )}
          <MarkdownRenderer content={userContent} />
          
          <AttachmentChips
            attachments={msg.attachments || []}
            onOpenFile={(att: { name?: string; content?: string }) => {
              window.dispatchEvent(new CustomEvent('omp:open-file', {
                detail: { path: att.name ?? 'attachment', content: att.content }
              }));
            }}
          />
        </div>
        
        {/* User Metadata & Toolbar (Undo on the left of Copy) */}
        <div className="flex items-center space-x-2.5 text-[11px] text-ink/60 px-1 font-mono">
          <div className="flex items-center space-x-1.5 border-r border-ink/15 pr-2.5">
            {isAgentAttributed ? (
              <>
                <Bot size={11} className="text-ink/70 shrink-0" />
                <span className="text-[10px] uppercase font-semibold tracking-wider text-ink/60">Agent</span>
              </>
            ) : (
              <User size={11} className="text-ink/70 shrink-0" />
            )}
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
  const cleanIntent = msg.intent ? capitalizeFirstLetter(msg.intent.replace(/^[.\s]+/, '')) : null;
  const hasToolCalls = Boolean(allToolCalls && allToolCalls.length > 0);
  const yieldOutput = allToolCalls
    ?.filter((t: ToolCallData) => t.name === 'yield' || t.type === 'yield')
    .find((t: ToolCallData) => t.status !== 'error')?.output;
  const toolTitle = cleanIntent
    || (yieldOutput ?? (allToolCalls?.length === 1 ? 'Tool Execution (1 step)' : `Tool Executions (${allToolCalls?.length} steps)`));

  return (
    <div 
      id={msg.id} 
      className={`flex flex-col items-start space-y-2 w-full max-w-full transition-all ${
        isStreaming ? 'pb-10 mb-2' : ''
      } ${className}`}
    >
      {/* Main AI Response Container */}
      <div className="w-full space-y-2.5 font-sans leading-relaxed">
        
        {/* Provider / API Error Alert */}
        {msg.error && (
          <div className="flex items-start space-x-2.5 bg-error/10 border border-error/30 rounded-lg mx-3 px-3.5 py-2.5 text-[12px] text-ink select-text">
            <AlertCircle size={15} className="text-error flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center space-x-2 flex-wrap">
                <span className="font-semibold text-error text-[12px] tracking-tight">
                  {msg.error.status ? `Error ${msg.error.status}` : 'Request Failed'}
                </span>
                {msg.error.stopReason && (
                  <span className="text-[10px] font-mono text-ink/50 bg-ink/5 px-1.5 py-0.5 rounded">
                    {msg.error.stopReason}
                  </span>
                )}
              </div>
              {msg.error.message && (
                <p className="text-ink/80 leading-relaxed text-[12px] font-mono whitespace-pre-wrap break-words">
                  {msg.error.message.split('\n').map((l: string) => l.trim()).filter(Boolean)[0]}
                  {msg.error.message.split('\n').map((l: string) => l.trim()).filter(Boolean).length > 1 && (
                    <span className="relative inline-flex items-center ml-1.5 align-middle group">
                      <Info size={13} className="text-error/70 hover:text-error cursor-pointer transition-colors" />
                      <span className="pointer-events-none absolute z-50 left-1/2 bottom-full mb-1.5 w-72 -translate-x-1/2 rounded-md bg-ink text-canvas p-2.5 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg">
                        {msg.error.message}
                      </span>
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        {/* System Notice Alert */}
        {msg.notice && <SystemNotice notice={msg.notice} />}

        {/* Thinking / Reasoning Accordion */}
        {thinkingData && (
          <ThinkingSection 
            thinking={thinkingData} 
            defaultExpanded={false}
            showSeparator={isPrevAssistant}
          />
        )}

        {/* Main AI Response Content (Rich Markdown with code blocks, tables, lists) rendered before tool calls */}
        {hasRenderableContent && (
          <div className="text-[13px] text-ink leading-relaxed font-sans bg-transparent px-3 py-1 select-text">
            <MarkdownRenderer content={assistantContent} />
          </div>
        )}

        {/* Tool Call Intent (rendered standalone only when there are no tool calls to absorb it as title) */}
        {cleanIntent && !hasToolCalls && (!hasRenderableContent || !msg.content.toLowerCase().includes(msg.intent.toLowerCase().trim())) && (
          <div className={`leading-relaxed font-sans px-3 select-text ${
            hasRenderableContent
              ? 'text-[12px] text-ink/70 py-0.5'
              : 'text-[13px] text-ink py-1'
          }`}>
            {cleanIntent}
          </div>
        )}

        {/* Primary Tool Executions Accordion */}
        {hasToolCalls && (
          <ToolCallingSection 
            tools={allToolCalls}
            title={toolTitle}
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
        <AiMessageFooter
          provider={msg.provider || provider}
          providerNames={providerNames}
          currentModel={(msg.model ? (modelNames?.[msg.model] ?? msg.model) : '') || modelName || ''}
          dateStr={formatFooterDate()}
          durationMs={durationMs ?? msg.durationMs}
          usage={msg.usage}
          content={msg.content}
          msgId={msg.id}
          onRetry={onRetry}
          onNewChat={onNewChat}
        />
      )}
    </div>
  );
});
