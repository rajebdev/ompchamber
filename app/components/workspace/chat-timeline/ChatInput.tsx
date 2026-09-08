import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Send, 
  Square,
  Paperclip, 
  X, 
  Brain, 
  LockKeyhole, 
  File as FileIcon, 
  Check 
} from 'lucide-react';
import type { Attachment, AIModelOption, ModelEntry } from '@/types';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { ModelDropdown } from '@/components/workspace/model-dropdown/ModelDropdown';
import { INITIAL_MODELS_CATALOG } from '@/data/modelCatalogData';
import { selectableThinkingLevels } from '@/lib/thinking-levels';
import { fetchModelsData, subscribeModelsUpdated } from '@/lib/models-client';

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
  onAttachmentsChange,
  sessionId,
  isOmpSession = false,
  onThinkingLevelChange,
  onModelChange,
  sessionModel,
  sessionThinkingLevel,
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
  onAttachmentsChange?: (attachments: React.SetStateAction<Attachment[]>) => void;
  sessionId?: string | null;
  isOmpSession?: boolean;
  onThinkingLevelChange?: (level: string) => void;
  onModelChange?: (provider: string, modelId: string) => void;
  /** Model last used by the active session (omp `model_change` entry). */
  sessionModel?: { provider: string; modelId: string } | null;
  /** Thinking level last used by the active session (omp `thinking_level_change` entry). */
  sessionThinkingLevel?: string | null;
}) {
  const [internalAttachments, setInternalAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const attachments = externalAttachments !== undefined ? externalAttachments : internalAttachments;
  const setAttachments = (updater: React.SetStateAction<Attachment[]>) => {
    if (onAttachmentsChange) {
      // Forward the updater untouched: onAttachmentsChange is a state setter,
      // so functional updates stay functional. Evaluating them here against
      // the closure `attachments` would resurrect stale state (e.g. the async
      // FileReader callback wiping the just-added image).
      onAttachmentsChange(updater);
    } else {
      setInternalAttachments(updater);
    }
  };

  // Selected Model State
  const [selectedModel, setSelectedModel] = useState<AIModelOption>(
    INITIAL_MODELS_CATALOG[5] || INITIAL_MODELS_CATALOG[0]
  );
  const [currentThinking, setCurrentThinking] = useState('auto');
  // Mirrors sessionThinkingLevel for the async model-sync effects below,
  // which may resolve after the session-level effect and must not erase it.
  const sessionThinkingLevelRef = useRef<string | null>(null);
  sessionThinkingLevelRef.current = sessionThinkingLevel ?? null;

  // Preserve the session's last-used thinking level when applying a model
  // picked from the catalog: the session level is authoritative and an async
  // fetch resolving later must not reset it to the ladder default.
  const resolveSessionLevel = (ladder: readonly string[] | undefined, fallback: string): string => {
    const sessionLevel = sessionThinkingLevelRef.current;
    if (!sessionLevel) return fallback;
    const selectable = selectableThinkingLevels(ladder ?? []);
    return selectable.length === 0 || selectable.includes(sessionLevel) ? sessionLevel : fallback;
  };

  // Adopt the active session's last-used model as the selected model.
  useEffect(() => {
    if (!sessionModel?.provider || !sessionModel.modelId) return;
    let active = true;
    fetchModelsData()
      .then((data) => {
        if (!active || !sessionModel) return;
        const match = (data.modelList || []).find(
          (m) => m.id === sessionModel.modelId && m.provider === sessionModel.provider
        );
        if (match) {
          setSelectedModel({
            id: match.id,
            name: match.name,
            provider: match.provider,
            contextWindow: match.contextWindow,
            thinkingLevels: match.thinkingLevels,
            thinkingLevel: resolveSessionLevel(match.thinkingLevels, match.thinkingLevels?.[0] ?? 'off'),
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionModel?.provider, sessionModel?.modelId]);

  // Adopt the active session's last-used thinking level. Runs after the model
  // sync effect above so it overrides the catalog default for this session.
  useEffect(() => {
    if (!sessionThinkingLevel) return;
    setSelectedModel(prev => {
      const selectable = selectableThinkingLevels(prev.thinkingLevels ?? []);
      // The session level is authoritative (omp recorded it for this model).
      // Only reject it when the ladder is KNOWN and explicitly excludes it;
      // an empty ladder (catalog not resolved / model exposes none) must not
      // fall back to 'off' and erase the session's actual level.
      const level = selectable.length === 0 || selectable.includes(sessionThinkingLevel)
        ? sessionThinkingLevel
        : prev.thinkingLevel;
      return level === prev.thinkingLevel ? prev : { ...prev, thinkingLevel: level };
    });
  }, [sessionThinkingLevel]);

  // Sync selected model from server and event listener
  useEffect(() => {
    let active = true;
    const syncModel = async () => {
      try {
        const data = await fetchModelsData();
        if (!active) return;
        if (Array.isArray(data.modelList) && data.modelList.length > 0) {
          const defaultModel = data.defaultModel;
          if (defaultModel) {
            const match = data.modelList.find((m: ModelEntry) => m.id === defaultModel.modelId && m.provider === defaultModel.provider);
            if (match) {
              setSelectedModel(prev => ({
                id: match.id,
                name: match.name,
                provider: match.provider,
                thinkingLevels: match.thinkingLevels,
                thinkingLevel: resolveSessionLevel(match.thinkingLevels, prev.thinkingLevel ?? match.thinkingLevels?.[0] ?? 'off'),
              }));
            }
          }
        } else if (data.selectedModel) {
          const selected = data.selectedModel;
          setSelectedModel(prev => ({
            ...selected,
            thinkingLevel: resolveSessionLevel(selected.thinkingLevels, prev.thinkingLevel ?? selected.thinkingLevel ?? 'off'),
          }));
        }
      } catch {}
    };

    syncModel();
    const unsubscribe = subscribeModelsUpdated(syncModel);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Thinking Dropdown State - Reactive with selectedModel
  const [showThinking, setShowThinking] = useState(false);
  const thinkingRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(thinkingRef, () => setShowThinking(false));
  const thinkingLevels = useMemo(() => {
    return selectableThinkingLevels(selectedModel.thinkingLevels);
  }, [selectedModel]);

  const handleSelectThinking = (level: string) => {
    setShowThinking(false);
    setCurrentThinking(level);
    setSelectedModel(prev => ({ ...prev, thinkingLevel: level }));
    onThinkingLevelChange?.(level);
  };

  // Re-sync the thinking dropdown label when the model dropdown's thinking
  // pill cycles the level (it updates `selectedModel.thinkingLevel`).
  useEffect(() => {
    if (selectedModel.thinkingLevel) {
      setCurrentThinking(selectedModel.thinkingLevel);
    }
  }, [selectedModel.thinkingLevel]);

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
    // Read image payloads as base64 so the omp model can receive them.
    for (const att of newAttachments) {
      if (!att.file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        if (!base64) return;
        setAttachments(prev => prev.map(a => (a.id === att.id ? { ...a, dataBase64: base64 } : a)));
      };
      reader.readAsDataURL(att.file);
    }
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
      
      {/* Attach toolbar: paperclip stays left of the attached files */}
      <div className="flex items-center flex-wrap gap-1.5 px-3 py-2 border-b border-ink/5 text-ink/60">
        <button 
          onClick={() => fileInputRef.current?.click()} 
          className="flex items-center justify-center hover:bg-ink/5 p-1 rounded transition-colors text-ink/60 hover:text-ink shrink-0" 
          title="Attach file or image"
        >
          <Paperclip size={14} />
        </button>

        {attachments.map(att => (
          <div key={att.id} className="relative flex items-center bg-canvas border border-ink/10 rounded-md p-0.5 pr-6 text-xs shadow-sm group">
            {att.preview ? (
              <img src={att.preview} alt="preview" className="w-6 h-6 object-cover rounded-sm mr-1.5 border border-ink/5" />
            ) : (
              <div className="w-6 h-6 flex items-center justify-center bg-ink/5 rounded-sm mr-1.5 text-ink/60">
                <FileIcon size={12} />
              </div>
            )}
            <span className="truncate max-w-[120px] font-mono text-[10px] text-ink/80">{att.file.name}</span>
            <button 
              onClick={() => removeAttachment(att.id)} 
              className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-ink/40 hover:text-error hover:bg-error/10 rounded transition-colors"
              title="Remove attachment"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
      
      <input 
        type="file" 
        multiple 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
      />

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
            onSelectModel={(model) => {
              setSelectedModel(model);
              if (isOmpSession && sessionId) {
                onModelChange?.(model.provider, model.id);
              }
            }}
            onThinkingLevelChange={(level) => {
              if (isOmpSession && sessionId) {
                onThinkingLevelChange?.(level);
              }
            }}
          />

          <div className="w-[1px] h-3 bg-ink/10" />

          {/* Thinking Level Dropdown */}
          <div className="relative" ref={thinkingRef}>
            <button 
              onClick={() => thinkingLevels.length > 0 && setShowThinking(!showThinking)}
              disabled={thinkingLevels.length === 0}
              className="flex items-center space-x-1 hover:bg-ink/5 px-2 py-1 rounded transition-colors text-xs text-ink/80 disabled:opacity-40 disabled:cursor-not-allowed"
              title={thinkingLevels.length === 0 ? 'This model exposes no thinking levels' : `Thinking Level: ${currentThinking}`}
            >
              <Brain size={12} className="text-ink/60" />
              <span className="hidden lg:inline">{currentThinking}</span>
            </button>
            {showThinking && thinkingLevels.length > 0 && (
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
