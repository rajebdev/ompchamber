import React, { useState, useRef } from 'react';
import { 
  RotateCcw, 
  Copy, 
  MessageSquarePlus, 
  User, 
  Bot, 
  File as FileIcon,
  Check,
  MoreHorizontal,
  Undo2
} from 'lucide-react';
import type { ChatMessageData } from '@/types';
import { ThinkingSection } from './ThinkingSection';
import { ToolCallingSection } from './ToolCallingSection';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

interface ChatMessageItemProps {
  msg: ChatMessageData | any;
  modelName?: string;
  onRetry?: (msgId: string) => void;
  onUndo?: (msgId: string, content?: string) => void;
}

export function ChatMessageItem({ msg, modelName, onRetry, onUndo }: ChatMessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(menuRef, () => setMenuOpen(false));

  const isUser = msg.role === 'user';

  const handleCopy = async () => {
    if (msg.content) {
      const success = await copyToClipboard(msg.content);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
    setMenuOpen(false);
  };

  const handleNewChat = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.location.href = window.location.pathname;
    }
  };

  const handleRetry = () => {
    setMenuOpen(false);
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
      <div id={msg.id} className="flex flex-col items-end space-y-1.5 w-full max-w-full">
        {/* User bubble - standardized to text-[13px] leading-relaxed with markdown support */}
        <div className="bg-[#faf8f3] p-3.5 sm:p-4 rounded-xl border border-[#141310]/15 text-[13px] text-[#141310] leading-relaxed shadow-xs max-w-[92%] sm:max-w-[85%] break-words whitespace-pre-wrap overflow-hidden flex flex-col space-y-2 font-sans select-text">
          <MarkdownRenderer content={msg.content} />
          
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[#141310]/10">
              {msg.attachments.map((att: any, i: number) => (
                <div key={i} className="flex items-center space-x-2 bg-[#f4f1ea] px-2 py-1 rounded border border-[#141310]/10 text-[11px] font-sans">
                  {att.preview ? (
                    <img 
                      src={att.preview} 
                      alt="attachment preview" 
                      className="w-6 h-6 rounded object-cover border border-[#141310]/10" 
                    />
                  ) : (
                    <FileIcon size={12} className="text-[#141310]/60" />
                  )}
                  <span className="truncate max-w-[120px] font-mono text-[10px]">{att.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* User Metadata & Toolbar (Undo on the left of Copy) */}
        <div className="flex items-center space-x-2.5 text-[11px] text-[#141310]/60 px-1 font-mono">
          <div className="flex items-center space-x-1.5 border-r border-[#141310]/15 pr-2.5">
            <User size={11} className="text-[#141310]/70" />
            <span>{msg.date || msg.timestamp || 'Just now'}</span>
          </div>
          
          <div className="flex items-center space-x-1">
            {/* Undo Button (to the left of copy button) */}
            <button 
              type="button"
              className="flex items-center hover:text-[#141310] transition-colors p-1 rounded hover:bg-[#141310]/5 cursor-pointer" 
              title="Undo / Edit message"
              onClick={handleUndo}
            >
              <Undo2 size={12} />
            </button>

            {/* Copy Button */}
            <button 
              type="button"
              className="flex items-center hover:text-[#141310] transition-colors p-1 rounded hover:bg-[#141310]/5 cursor-pointer" 
              title="Copy prompt"
              onClick={handleCopy}
            >
              {copied ? <Check size={12} className="text-emerald-700" /> : <Copy size={12} />}
            </button>

            {/* New Chat Button */}
            <button 
              type="button"
              className="flex items-center hover:text-[#141310] transition-colors p-1 rounded hover:bg-[#141310]/5 cursor-pointer" 
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
    <div id={msg.id} className="flex flex-col items-start space-y-2 w-full max-w-full">
      {/* Main AI Response Container */}
      <div className="w-full space-y-2.5 font-sans">
        
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
            defaultExpanded={true}
          />
        )}

        {/* Intermediate Diagnostic Note */}
        {msg.systemNote && (
          <div className="text-[12px] text-[#141310] leading-relaxed border-l-2 border-[#141310]/30 bg-[#faf8f3]/60 px-3 py-2 rounded-r-md font-mono break-words whitespace-pre-wrap select-text">
            <span className="text-[10px] text-[#141310]/50 uppercase tracking-wider block mb-0.5 font-sans font-semibold">
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
        {msg.content && (
          <div className="text-[13px] text-[#141310] leading-relaxed font-sans bg-transparent py-1 select-text">
            <MarkdownRenderer content={msg.content} />
          </div>
        )}

        {/* AI Final Summary / Conclusion Card */}
        {msg.summary && (
          <div className="text-[12px] text-[#141310] bg-[#faf8f3] border border-[#141310]/15 rounded-lg p-3 space-y-1 select-text font-sans">
            <div className="font-semibold text-[#141310] flex items-center space-x-1.5 text-[12px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              <span>Resolution Summary</span>
            </div>
            <p className="text-[#141310]/80 leading-relaxed text-[12px]">{msg.summary}</p>
          </div>
        )}
      </div>
      
      {/* Bottom AI Metadata & Actions Toolbar */}
      <div className="w-full flex items-center flex-nowrap space-x-2.5 text-[11px] text-[#141310]/60 px-1 pt-0.5 font-mono min-w-0">
        
        {/* Model and Date / Time with truncation protection */}
        <div className="flex items-center space-x-1.5 border-r border-[#141310]/15 pr-2.5 min-w-0 shrink overflow-hidden" title={`${currentModel} • ${msg.date || msg.timestamp || 'Just now'}`}>
          <div className="w-4 h-4 rounded flex items-center justify-center bg-[#141310] text-[#f4f1ea] shadow-2xs shrink-0">
            <Bot size={10} />
          </div>
          <span className="font-semibold text-[#141310] truncate">
            {currentModel}
          </span>
          <span className="text-[#141310]/40 shrink-0">•</span>
          <span className="text-[#141310]/60 shrink-0 whitespace-nowrap">{msg.date || msg.timestamp || 'Just now'}</span>
        </div>

        {/* Action Buttons & Option Dropdown Menu */}
        <div className="flex items-center space-x-1 shrink-0 relative" ref={menuRef}>
          {/* Quick Copy Action */}
          <button 
            type="button"
            className="flex items-center space-x-1 hover:text-[#141310] transition-colors px-1.5 py-0.5 rounded hover:bg-[#141310]/5 cursor-pointer whitespace-nowrap" 
            title="Copy response"
            onClick={handleCopy}
          >
            {copied ? <Check size={12} className="text-emerald-700" /> : <Copy size={12} />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Quick Retry Action */}
          <button 
            type="button"
            className="hidden sm:flex items-center space-x-1 hover:text-[#141310] transition-colors px-1.5 py-0.5 rounded hover:bg-[#141310]/5 cursor-pointer whitespace-nowrap" 
            title="Re-run / Retry generation"
            onClick={handleRetry}
          >
            <RotateCcw size={12} />
            <span className="hidden sm:inline">Retry</span>
          </button>

          {/* Option Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMenuOpen(prev => !prev)}
            className={`p-1 rounded hover:bg-[#141310]/10 hover:text-[#141310] transition-colors cursor-pointer shrink-0 ${
              menuOpen ? 'bg-[#141310]/10 text-[#141310]' : 'text-[#141310]/60'
            }`}
            title="Message options"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={13} />
          </button>

          {/* Contextual Options Dropdown */}
          {menuOpen && (
            <div className="absolute right-0 bottom-full mb-1.5 w-44 sm:w-48 bg-[#faf8f3] border border-[#141310]/20 rounded-lg shadow-lg py-1 z-30 font-sans text-xs animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100vw-32px)]">
              <div className="px-3 py-1.5 border-b border-[#141310]/10 text-[10px] font-mono text-[#141310]/50 truncate">
                {currentModel}
              </div>
              
              <button
                type="button"
                onClick={handleCopy}
                className="w-full flex items-center space-x-2 px-3 py-2 text-left hover:bg-[#141310]/5 text-[#141310] cursor-pointer"
              >
                {copied ? <Check size={13} className="text-emerald-700" /> : <Copy size={13} />}
                <span>{copied ? 'Copied to Clipboard' : 'Copy Full Response'}</span>
              </button>

              <button
                type="button"
                onClick={handleRetry}
                className="w-full flex items-center space-x-2 px-3 py-2 text-left hover:bg-[#141310]/5 text-[#141310] cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Retry Generation</span>
              </button>

              <button
                type="button"
                onClick={handleNewChat}
                className="w-full flex items-center space-x-2 px-3 py-2 text-left hover:bg-[#141310]/5 text-[#141310] cursor-pointer"
              >
                <MessageSquarePlus size={13} />
                <span>New Chat from Here</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
