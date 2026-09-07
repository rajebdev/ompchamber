import React, { useState, useRef } from 'react';
import { 
  Send, 
  Paperclip, 
  X, 
  Brain, 
  Shield, 
  ChevronDown, 
  File as FileIcon, 
  Check 
} from 'lucide-react';
import type { Attachment, AIModelOption } from '@/types';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { ModelDropdown } from '@/components/workspace/model-dropdown/ModelDropdown';
import { INITIAL_MODELS_CATALOG } from '@/data/modelCatalogData';

interface MobileChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: (attachments: Attachment[], options?: { steering?: boolean }) => void;
  isGenerating?: boolean;
  disabled?: boolean;
  appSettings?: Record<string, any>;
  attachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;
}

export function MobileChatInput({
  value,
  onChange,
  onSend,
  isGenerating = false,
  disabled = false,
  appSettings = {},
  attachments: externalAttachments,
  onAttachmentsChange
}: MobileChatInputProps) {
  const [internalAttachments, setInternalAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const attachments = externalAttachments !== undefined ? externalAttachments : internalAttachments;
  const setAttachments = (updater: React.SetStateAction<Attachment[]>) => {
    if (onAttachmentsChange) {
      const newAtts = typeof updater === 'function' ? updater(attachments) : updater;
      onAttachmentsChange(newAtts);
    } else {
      setInternalAttachments(updater);
    }
  };

  // Model Selection State
  const [selectedModel, setSelectedModel] = useState<AIModelOption>(
    INITIAL_MODELS_CATALOG[5] || INITIAL_MODELS_CATALOG[0]
  );

  // Thinking Dropdown State (matching desktop)
  const [showThinking, setShowThinking] = useState(false);
  const [selectedThinking, setSelectedThinking] = useState('Standard');
  const thinkingRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(thinkingRef, () => setShowThinking(false));
  const thinkingLevels = ['Fast', 'Standard', 'Deep Thinking'];

  // Access Dropdown State (matching desktop)
  const [showAccess, setShowAccess] = useState(false);
  const [selectedAccess, setSelectedAccess] = useState('Always ask');
  const accessRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(accessRef, () => setShowAccess(false));
  const accessLevels = ['Full bypass', 'Minimal', 'Always ask'];

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      const files = Array.from(e.clipboardData.files);
      addFiles(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addFiles = (files: File[]) => {
    const newAttachments = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const att = prev.find(p => p.id === id);
      if (att && att.preview) URL.revokeObjectURL(att.preview);
      return prev.filter(p => p.id !== id);
    });
  };

  const handleSendClick = (options?: { steering?: boolean }) => {
    if (!value.trim() && attachments.length === 0) return;
    if (disabled) return;
    onSend(attachments, options);
    setAttachments([]);
  };

  return (
    <div className="relative border border-ink/20 rounded-md bg-paper focus-within:border-ink transition-colors flex flex-col shadow-sm font-sans">
      
      {/* Top Toolbar: Paperclip Attach button */}
      <div className="flex items-center px-3 py-1.5 border-b border-ink/5 text-ink/60 space-x-2">
        <button 
          type="button"
          onClick={() => fileInputRef.current?.click()} 
          className="flex items-center justify-center hover:bg-ink/5 p-1 rounded transition-colors text-ink/60 hover:text-ink cursor-pointer" 
          title="Attach file or image"
        >
          <Paperclip size={14} />
        </button>
      </div>
      
      <input 
        type="file" 
        multiple 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
      />

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2">
          {attachments.map(att => (
            <div key={att.id} className="relative flex items-center bg-canvas border border-ink/10 rounded-md p-1 pr-6 text-xs shadow-xs group">
              {att.preview ? (
                <img src={att.preview} alt="preview" className="w-7 h-7 object-cover rounded-xs mr-2 border border-ink/5" />
              ) : (
                <div className="w-7 h-7 flex items-center justify-center bg-ink/5 rounded-xs mr-2 text-ink/60">
                  <FileIcon size={13} />
                </div>
              )}
              <span className="truncate max-w-[100px] font-mono text-[10px] text-ink/80">{att.file.name}</span>
              <button 
                type="button"
                onClick={() => removeAttachment(att.id)} 
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-ink/40 hover:text-error hover:bg-error/10 rounded transition-colors cursor-pointer"
                title="Remove attachment"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;

          const sendBinding = appSettings.keybindingSend || 'Enter';
          const newLineBinding = appSettings.keybindingNewLine || 'Shift + Enter';
          const steeringBinding = appSettings.keybindingSteering || 'Ctrl / Cmd + Enter';
          
          const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
          const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
          const isShift = e.shiftKey;

          const checkBinding = (binding: string) => {
            if (binding === 'Enter' && !isShift && !isCtrlOrCmd && !e.altKey) return true;
            if (binding === 'Shift + Enter' && isShift && !isCtrlOrCmd && !e.altKey) return true;
            if (binding === 'Ctrl / Cmd + Enter' && !isShift && isCtrlOrCmd && !e.altKey) return true;
            return false;
          };

          if (checkBinding(steeringBinding)) {
            e.preventDefault();
            if (!disabled) {
              handleSendClick({ steering: true });
            }
          } else if (checkBinding(sendBinding)) {
            e.preventDefault();
            if (!disabled) handleSendClick();
          } else if (checkBinding(newLineBinding)) {
            // Allow default behavior (new line)
          } else {
            // Prevent default for other Enter combinations to avoid unwanted new lines
            e.preventDefault();
          }
        }}
        onPaste={handlePaste}
        disabled={disabled}
        placeholder={disabled ? "Please select a workspace above to start prompting..." : "@ for files/agents; / for commands and skills; ! for shell; # for snippets (Paste images/files here)"} 
        className="w-full bg-transparent border-none px-3 py-2.5 text-xs focus:outline-none resize-none text-ink placeholder-ink/40 min-h-[64px] max-h-36 disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {/* Bottom Config Toolbar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-ink/5 bg-canvas/50 rounded-b-md relative w-full">
        <div className="flex items-center space-x-1 sm:space-x-2 min-w-0 flex-1 mr-2">
          
          {/* Redesigned Model Dropdown */}
          <ModelDropdown
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            className="min-w-0 max-w-[70%]"
          />

          <div className="w-[1px] h-3 bg-ink/10" />

          {/* Thinking Level Dropdown */}
          <div className="relative" ref={thinkingRef}>
            <button 
              type="button"
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center space-x-1 hover:bg-ink/5 px-1.5 py-1 rounded transition-colors text-xs text-ink/80 cursor-pointer"
              title={`Thinking Level: ${selectedThinking}`}
            >
              <Brain size={12} className="text-ink/60 flex-shrink-0" />
              <span className="hidden sm:inline">{selectedThinking}</span>
            </button>
            {showThinking && (
              <div className="absolute bottom-full left-0 mb-1 w-40 bg-paper border border-ink/20 rounded-md shadow-lg z-50 py-1 text-xs">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink/40 font-semibold mb-1">Thinking Level</div>
                {thinkingLevels.map(level => (
                  <button 
                    key={level}
                    type="button"
                    onClick={() => { setSelectedThinking(level); setShowThinking(false); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>{level}</span>
                    {selectedThinking === level && <Check size={12} className="text-ink" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-[1px] h-3 bg-ink/10" />

          {/* Access Control Dropdown */}
          <div className="relative" ref={accessRef}>
            <button 
              type="button"
              onClick={() => setShowAccess(!showAccess)}
              className="flex items-center space-x-1 hover:bg-ink/5 px-1.5 py-1 rounded transition-colors text-xs text-ink/80 cursor-pointer"
              title={`Access Control: ${selectedAccess}`}
            >
              <Shield size={12} className="text-ink/60 flex-shrink-0" />
              <span className="hidden sm:inline">{selectedAccess}</span>
            </button>
            {showAccess && (
              <div className="absolute bottom-full left-0 mb-1 w-40 bg-paper border border-ink/20 rounded-md shadow-lg z-50 py-1 text-xs">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink/40 font-semibold mb-1">Access Control</div>
                {accessLevels.map(level => (
                  <button 
                    key={level}
                    type="button"
                    onClick={() => { setSelectedAccess(level); setShowAccess(false); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>{level}</span>
                    {selectedAccess === level && <Check size={12} className="text-ink" />}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Send Button */}
        <button 
          type="button"
          onClick={() => handleSendClick()}
          disabled={isGenerating || disabled || (!value.trim() && attachments.length === 0)}
          className="flex items-center justify-center w-7 h-7 rounded bg-ink text-canvas hover:bg-ink/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
          title="Send message"
        >
          <Send size={12} className="ml-px" />
        </button>
      </div>
    </div>
  );
}
