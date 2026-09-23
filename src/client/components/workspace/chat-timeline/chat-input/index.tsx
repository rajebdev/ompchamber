import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ClipboardEvent, SetStateAction } from 'preact/compat';
import { AlertTriangle, X } from 'lucide-preact';
import type { AIModelOption, Attachment, ModelEntry } from '@/shared/types';
import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';
import { describeAttachmentBudget } from '@/shared/lib/chat/attachments';
import { ComposerToolbar } from '@/client/components/workspace/chat-timeline/chat-input/Toolbar';
import { ComposerTextarea } from '@/client/components/common/ComposerTextarea';
import { AttachmentToolbar } from '@/client/components/workspace/chat-timeline/chat-input/AttachmentToolbar';
import { selectableThinkingLevels } from '@/shared/lib/models/thinking-levels';
import { fetchModelsData, subscribeModelsUpdated } from '@/shared/lib/models/client';
import { resolveThinkingLevel, selectionFor } from '@/client/components/workspace/chat-timeline/chat-input/selection';
import { NO_PENDING_PICK } from '@/client/hooks/chat/timeline/deferred-model';
import { useFileDrop, DROP_LIMIT_NOTICE } from '@/client/hooks/chat/composer/file-drop';
import { describeUnreadable, readDroppedReference, referenceName } from '@/client/hooks/chat/composer/drop-references';
import { useComposerAttachments } from '@/client/hooks/chat/composer/attachments';
import { DropOverlay } from '@/client/components/workspace/chat-timeline/chat-input/DropOverlay';

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
  onThinkingLevelChange,
  onModelChange,
  sessionModel,
  sessionThinkingLevel,
  rootPath,
  variant = 'desktop',
  accessMode,
  onAccessModeChange,
  /** Written on every model/thinking pick so the send path can snapshot the
   *  selection into queued items without lifting ChatInput state. */
  composerModelRef,
  /** A pick the user made while a turn was streaming, still waiting for the
   *  next prompt. While set, the session's own model must NOT be adopted over
   *  it — the composer shows what the next prompt will actually run. Omitted
   *  by composers that never stream (the New Chat modal), where there is
   *  nothing to defer and adoption must behave as before. */
  deferredComposerPickRef = NO_PENDING_PICK,
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
  onAttachmentsChange?: (attachments: SetStateAction<Attachment[]>) => void;
  onThinkingLevelChange?: (level: string) => void;
  onModelChange?: (provider: string, modelId: string) => void;
  /** Model last used by the active session (omp `model_change` entry). */
  sessionModel?: { provider: string; modelId: string } | null;
  /** Thinking level last used by the active session (omp `thinking_level_change` entry). */
  sessionThinkingLevel?: string | null;
  rootPath?: string | null;
  accessMode: ApprovalMode;
  onAccessModeChange: (mode: ApprovalMode) => void;
  /**
   * `mobile` sizes the composer for a phone: 16px text (iOS Safari zooms the
   * viewport when focusing an input below that), thumb-sized send/stop
   * targets, and Enter-to-newline instead of Enter-to-send.
   */
  variant?: 'desktop' | 'mobile';
  composerModelRef: { current: { provider: string; modelId: string; thinkingLevel: string } | null };
  deferredComposerPickRef?: { current: { provider?: string; modelId?: string; thinkingLevel?: string } | null };
}) {
  const [internalAttachments, setInternalAttachments] = useState<Attachment[]>([]);

  const attachments = externalAttachments !== undefined ? externalAttachments : internalAttachments;
  const setAttachments = (updater: SetStateAction<Attachment[]>) => {
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

  // Selected Model State — starts null and is filled from `/api/models` (session
  // pick → persisted pick → registry default). Seeding a demo catalog entry here
  // showed a fabricated provider in the composer before the real list arrived.
  const [selectedModel, setSelectedModel] = useState<AIModelOption | null>(null);
  const [currentThinking, setCurrentThinking] = useState('auto');
  // Live mirror for the send path's queue snapshot (see composerModelRef).
  useEffect(() => {
    if (!selectedModel?.id) return;
    composerModelRef.current = {
      provider: selectedModel.provider,
      modelId: selectedModel.id,
      thinkingLevel: selectedModel.thinkingLevel ?? 'auto',
    };
  }, [selectedModel?.provider, selectedModel?.id, selectedModel?.thinkingLevel, composerModelRef]);
  // Mirrors sessionThinkingLevel for the async model-sync effects below,
  // which may resolve after the session-level effect and must not erase it.
  const sessionThinkingLevelRef = useRef<string | null>(null);
  sessionThinkingLevelRef.current = sessionThinkingLevel ?? null;
  // Mirrors sessionModel for the async model-sync effect below, which resolves
  // after the session-adoption effect and must not clobber it.
  const sessionModelRef = useRef<{ provider: string; modelId: string } | null>(sessionModel ?? null);
  sessionModelRef.current = sessionModel ?? null;

  // Adopt the active session's last-used model as the selected model. The
  // thinking level must fall back to the CURRENT one, never the ladder default:
  // this effect re-runs right after a spawn (sessionModel changes while the
  // session's own thinking_level_change entry is not readable yet), and any
  // concrete fallback here claims a level the run never used.
  //
  // A pick still waiting for the next prompt wins: the session's model is what
  // the RUNNING turn uses, and adopting it would erase the user's choice from
  // the composer even though it is what the next prompt will run with.
  useEffect(() => {
    if (!sessionModel?.provider || !sessionModel.modelId) return;
    if (deferredComposerPickRef.current) return;
    let active = true;
    fetchModelsData()
      .then((data) => {
        if (!active || !sessionModel) return;
        if (deferredComposerPickRef.current) return;
        const match = (data.modelList || []).find(
          (m) => m.id === sessionModel.modelId && m.provider === sessionModel.provider
        );
        if (match) {
          setSelectedModel(prev => selectionFor(match, sessionThinkingLevelRef.current, prev));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionModel?.provider, sessionModel?.modelId, deferredComposerPickRef]);

  // Adopt the active session's last-used thinking level. Runs after the model
  // sync effect above so it overrides the catalog default for this session.
  // Same rule as the model: a pick waiting for the next prompt is not
  // overridden by the level the running turn recorded.
  useEffect(() => {
    if (!sessionThinkingLevel) return;
    if (deferredComposerPickRef.current?.thinkingLevel) return;
    setSelectedModel(prev => {
      if (!prev) return prev;
      const level = resolveThinkingLevel(prev.thinkingLevels, sessionThinkingLevel, prev.thinkingLevel);
      return level === prev.thinkingLevel ? prev : { ...prev, thinkingLevel: level };
    });
  }, [sessionThinkingLevel, deferredComposerPickRef]);

  // Sync selected model from server and event listener
  useEffect(() => {
    let active = true;
    const syncModel = async () => {
      try {
        const data = await fetchModelsData();
        if (!active) return;
        // A pick waiting for the next prompt owns the composer's selection:
        // every branch below would replace it with a session/catalog default.
        if (deferredComposerPickRef.current) return;
        if (Array.isArray(data.modelList) && data.modelList.length > 0) {
          // 1. The active session's last-used model is authoritative; even when
          // it is missing from the catalog, never replace it with the default.
          const sm = sessionModelRef.current;
          if (sm?.provider && sm.modelId) {
            const match = data.modelList.find((m: ModelEntry) => m.id === sm.modelId && m.provider === sm.provider);
            if (match) {
              setSelectedModel(prev => selectionFor(match, sessionThinkingLevelRef.current, prev));
            }
            return;
          }
          // 2. The user's persisted pick (survives new sessions).
          const persisted = data.selectedModel;
          if (persisted?.provider && persisted.id) {
            const match = data.modelList.find((m: ModelEntry) => m.id === persisted.id && m.provider === persisted.provider);
            if (match) {
              setSelectedModel(prev => selectionFor(match, sessionThinkingLevelRef.current, prev));
              return;
            }
          }
          // 3. Registry default.
          const defaultModel = data.defaultModel;
          if (defaultModel) {
            const match = data.modelList.find((m: ModelEntry) => m.id === defaultModel.modelId && m.provider === defaultModel.provider);
            if (match) {
              setSelectedModel(prev => selectionFor(match, sessionThinkingLevelRef.current, prev));
            }
          }
        } else if (data.selectedModel) {
          const selected = data.selectedModel;
          setSelectedModel(prev => ({
            ...selected,
            thinkingLevel: resolveThinkingLevel(selected.thinkingLevels, sessionThinkingLevelRef.current, prev?.thinkingLevel ?? selected.thinkingLevel),
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
  }, [deferredComposerPickRef]);

  // Thinking Dropdown State - Reactive with selectedModel
  const thinkingLevels = useMemo(() => {
    return selectableThinkingLevels(selectedModel?.thinkingLevels);
  }, [selectedModel]);

  const handleSelectThinking = (level: string) => {
    setCurrentThinking(level);
    setSelectedModel(prev => (prev ? { ...prev, thinkingLevel: level } : prev));
    onThinkingLevelChange?.(level);
  };

  // Re-sync the thinking dropdown label when the model dropdown's thinking
  // pill cycles the level (it updates `selectedModel.thinkingLevel`).
  useEffect(() => {
    if (selectedModel?.thinkingLevel) {
      setCurrentThinking(selectedModel.thinkingLevel);
    }
  }, [selectedModel?.thinkingLevel]);

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboard = e.clipboardData;
    if (!clipboard) return;
    if (clipboard.files.length > 0) {
      e.preventDefault();
      acceptFiles(Array.from(clipboard.files));
    }
  };

  const { addFiles, removeAttachment, readyForSend } = useComposerAttachments({ attachments, setAttachments });

  // Refusals are reported inline, right above the input: the composer has no
  // toast stack of its own, and its three call sites share no host to borrow.
  const [attachNotice, setAttachNotice] = useState<string | null>(null);

  const acceptFiles = (files: File[], incomplete = false, references: string[] = []) => {
    const { added, skipped, unreadable } = addFiles(files);
    if (skipped.length > 0) {
      setAttachNotice(describeAttachmentBudget(skipped));
    } else if (incomplete) {
      setAttachNotice(DROP_LIMIT_NOTICE);
    } else if (unreadable.length > 0) {
      // Reported, never silent: a chip whose bytes never arrived would send a
      // prompt that names a file the model cannot see.
      setAttachNotice(describeUnreadable(unreadable));
    } else if (added > 0) {
      setAttachNotice(null);
    }
    if (references.length > 0) void attachReferences(references);
  };

  // A download dragged out of a web page carries no File — only a URL. The
  // server reads it, because the browser cannot fetch an arbitrary path and the
  // drop gives no bytes to work with.
  const attachReferences = async (references: string[]) => {
    const resolved: File[] = [];
    const failed: string[] = [];
    await Promise.all(references.map(async (reference) => {
      const file = await readDroppedReference(reference, rootPath ?? null);
      if (file) resolved.push(file);
      else failed.push(referenceName(reference));
    }));
    if (resolved.length > 0) {
      const { unreadable } = addFiles(resolved);
      setAttachNotice(unreadable.length > 0 ? describeUnreadable(unreadable) : null);
    }
    if (failed.length > 0) {
      setAttachNotice(describeUnreadable(failed));
    }
  };

  // OS drag-and-drop. Bound to the composer CARD, not the textarea: the whole
  // composer is the drop target, so a drop anywhere inside it (including on the
  // textarea) bubbles here instead of letting the browser navigate away.
  const { isDragging, dropProps } = useFileDrop({
    disabled,
    onFiles: acceptFiles,
  });

  const handleSendClick = (options?: { steering?: boolean }) => {
    if (!value.trim() && attachments.length === 0) return;
    const outgoing = attachments;
    setAttachments([]);
    // Bytes are read at attach time; this waits for any still in flight so a
    // prompt never goes out while an attachment is half-populated.
    void readyForSend().then(() => onSend(outgoing, options));
  };

  const isMobile = variant === 'mobile';

  return (
    <div
      className={`relative border rounded-md bg-paper transition-colors flex flex-col shadow-sm ${
        isDragging ? 'border-ink/40' : 'border-ink/20 focus-within:border-ink'
      } ${className}`}
      {...dropProps}
    >
      <DropOverlay visible={isDragging} />

      <AttachmentToolbar
        attachments={attachments}
        onFilesSelected={(files) => acceptFiles(files)}
        onRemove={removeAttachment}
      />

      {attachNotice && (
        <div className="flex items-start gap-1.5 border-b border-error/20 bg-error/5 px-3 py-1.5 text-[11px] text-error">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{attachNotice}</span>
          <button
            type="button"
            onClick={() => setAttachNotice(null)}
            className="shrink-0 text-error/60 hover:text-error transition-colors"
            title="Dismiss"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Textarea */}
      <ComposerTextarea
        value={value}
        onChange={onChange}
        onSend={handleSendClick}
        disabled={disabled}
        appSettings={appSettings}
        rootPath={rootPath}
        placeholder={disabled ? "Please select a workspace above to start prompting..." : "@ for files/agents; / for commands and skills; ! for shell; # for snippets (Paste images/files here)"}
        className={`w-full bg-transparent border-none focus:outline-none resize-none text-ink placeholder-ink/40 disabled:opacity-50 disabled:cursor-not-allowed ${
          isMobile ? 'px-3 py-3 text-base min-h-[68px] max-h-40' : 'px-3 py-3 text-sm min-h-[80px]'
        }`}
        onPaste={handlePaste}
        variant={variant}
      />

      {/* Bottom Config Toolbar */}
      <ComposerToolbar
        isMobile={isMobile}
        selectedModel={selectedModel}
        onSelectModel={(model) => {
          setSelectedModel(model);
          onModelChange?.(model.provider, model.id);
        }}
        thinkingLevels={thinkingLevels}
        currentThinking={currentThinking}
        onSelectThinking={handleSelectThinking}
        onThinkingLevelChange={onThinkingLevelChange}
        isGenerating={isGenerating}
        onStop={onStop}
        onSend={() => handleSendClick()}
        sendDisabled={disabled || (!value.trim() && attachments.length === 0)}
        accessMode={accessMode}
        onSelectAccess={onAccessModeChange}
      />
    </div>
  );
}
