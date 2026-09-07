import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Square,
  Paperclip, 
  X, 
  Brain, 
  LockKeyhole, 
  ChevronDown, 
  File as FileIcon, 
  Check 
} from 'lucide-react';
import type { Attachment, AIModelOption } from '@/types';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { ModelDropdown } from '@/components/workspace/model-dropdown/ModelDropdown';
import { INITIAL_MODELS_CATALOG } from '@/data/modelCatalogData';

export function ChatInput({ 
  value, 
  onChange, 
  onSend, 
  isGenerating,
  onStop,
  className = '',
  disabled = false,
  appSettings = {},
  attachments: externalAttachments,
  onAttachmentsChange
}: { 
  value: string; 
  onChange: (v: string) => void; 
  onSend: (attachments: Attachment[], options?: { steering?: boolean }) => void; 
  isGenerating: boolean;
  onStop?: () => void;
  className?: string;
  disabled?: boolean;
  appSettings?: Record<string, any>;
  attachments?: Attachment[];
  onAttachmentsChange?: (attachments: Attachment[]) => void;
}) {
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

  // Selected Model State
  const [selectedModel, setSelectedModel] = useState<AIModelOption>(
    INITIAL_MODELS_CATALOG[5] || INITIAL_MODELS_CATALOG[0]
  );

  // Sync selected model from server and event listener
  useEffect(() => {
    let active = true;
    const fetchCurrentModel = async () => {
      try {
        const res = await fetch('/api/models');
        if (res.ok && active) {
          const data = await res.json();
          if (data.selectedModel) {
            setSelectedModel(data.selectedModel);
          }
        }
      } catch {}
    };

    fetchCurrentModel();
    const handleModelsUpdated = () => fetchCurrentModel();
    window.addEventListener('omp:models-updated', handleModelsUpdated);
    return () => {
      active = false;
      window.removeEventListener('omp:models-updated', handleModelsUpdated);
    };
  }, []);

  // Thinking Dropdown State - Reactive with selectedModel
  const [showThinking, setShowThinking] = useState(false);
  const thinkingRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(thinkingRef, () => setShowThinking(false));
  const thinkingLevels: ('Default' | 'High' | 'Low' | 'Off')[] = ['Default', 'High', 'Low', 'Off'];
  const currentThinking = selectedModel.thinkingLevel || 'Default';

  const handleSelectThinking = async (level: 'Default' | 'High' | 'Low' | 'Off') => {
    setShowThinking(false);
    setSelectedModel(prev => ({ ...prev, thinkingLevel: level }));

    try {
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'setThinking',
          modelId: selectedModel.id,
          thinkingLevel: level,
        }),
      });
      window.dispatchEvent(new CustomEvent('omp:models-updated'));
    } catch (err) {
      console.error('Failed to update thinking level:', err);
    }
  };

  // Access Dropdown State
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
    onSend(attachments, options);
    setAttachments([]);
  };

  return (
    <div className={`relative border border-ink/20 rounded-md bg-paper focus-within:border-ink transition-colors flex flex-col shadow-sm ${className}`}>
      
      {/* Top Toolbar */}
      <div className="flex items-center px-3 py-2 border-b border-ink/5 text-ink/60 space-x-2">
        <button 
          onClick={() => fileInputRef.current?.click()} 
          className="flex items-center justify-center hover:bg-ink/5 p-1 rounded transition-colors text-ink/60 hover:text-ink" 
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
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map(att => (
            <div key={att.id} className="relative flex items-center bg-canvas border border-ink/10 rounded-md p-1 pr-7 text-xs shadow-sm group">
              {att.preview ? (
                <img src={att.preview} alt="preview" className="w-8 h-8 object-cover rounded-sm mr-2 border border-ink/5" />
              ) : (
                <div className="w-8 h-8 flex items-center justify-center bg-ink/5 rounded-sm mr-2 text-ink/60">
                  <FileIcon size={14} />
                </div>
              )}
              <span className="truncate max-w-[120px] font-mono text-[10px] text-ink/80">{att.file.name}</span>
              <button 
                onClick={() => removeAttachment(att.id)} 
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-ink/40 hover:text-error hover:bg-error/10 rounded transition-colors"
                title="Remove attachment"
              >
                <X size={12} />
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
        className="w-full bg-transparent border-none px-3 py-3 text-sm focus:outline-none resize-none text-ink placeholder-ink/40 min-h-[80px] disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {/* Bottom Config Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-ink/5 bg-canvas/50 rounded-b-md">
        <div className="flex items-center space-x-2">
          
          {/* Redesigned Model Dropdown */}
          <ModelDropdown 
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
          />

          <div className="w-[1px] h-3 bg-ink/10" />

          {/* Thinking Level Dropdown */}
          <div className="relative" ref={thinkingRef}>
            <button 
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center space-x-1 hover:bg-ink/5 px-2 py-1 rounded transition-colors text-xs text-ink/80"
              title={`Thinking Level: ${currentThinking}`}
            >
              <Brain size={12} className="text-ink/60" />
              <span className="hidden lg:inline">{currentThinking}</span>
            </button>
            {showThinking && (
              <div className="absolute bottom-full left-0 mb-1 w-40 bg-paper border border-ink/20 rounded-md shadow-lg z-50 py-1 text-xs">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink/40 font-semibold mb-1">Thinking Level</div>
                {thinkingLevels.map(level => (
                  <button 
                    key={level}
                    onClick={() => handleSelectThinking(level)}
                    className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center justify-between transition-colors"
                  >
                    <span>{level}</span>
                    {currentThinking === level && <Check size={12} className="text-ink" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-[1px] h-3 bg-ink/10" />

          {/* Access Dropdown */}
          <div className="relative" ref={accessRef}>
            <button 
              onClick={() => setShowAccess(!showAccess)}
              className="flex items-center space-x-1 hover:bg-ink/5 px-2 py-1 rounded transition-colors text-xs text-ink/80"
            >
              <LockKeyhole size={12} className="text-ink/60" />
              <span className="hidden lg:inline">{selectedAccess}</span>
            </button>
            {showAccess && (
              <div className="absolute bottom-full left-0 mb-1 w-40 bg-paper border border-ink/20 rounded-md shadow-lg z-50 py-1 text-xs">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink/40 font-semibold mb-1">Access Control</div>
                {accessLevels.map(level => (
                  <button 
                    key={level}
                    onClick={() => { setSelectedAccess(level); setShowAccess(false); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center justify-between transition-colors"
                  >
                    <span>{level}</span>
                    {selectedAccess === level && <Check size={12} className="text-ink" />}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>

        {isGenerating ? (
          <button 
            type="button"
            onClick={onStop}
            className="flex items-center justify-center w-7 h-7 rounded bg-ink text-canvas hover:bg-error hover:text-canvas transition-colors cursor-pointer shadow-xs animate-in zoom-in-90 duration-150"
            title="Stop generation"
          >
            <Square size={10} className="fill-current" />
          </button>
        ) : (
          <button 
            type="button"
            onClick={() => handleSendClick()}
            disabled={disabled || (!value.trim() && attachments.length === 0)}
            className="flex items-center justify-center w-7 h-7 rounded bg-ink text-canvas hover:bg-ink/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Send message"
          >
            <Send size={12} className="ml-px" />
          </button>
        )}
      </div>
    </div>
  );
}
