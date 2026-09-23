/**
 * BTW panel composer card — the side question's own input.
 *
 * Pure presentation: text, attachments and the running turn are owned by the
 * parent; this file only autosizes the textarea, reads keys and renders.
 */

import { useEffect, useRef } from 'preact/hooks';
import type { TargetedEvent, TargetedKeyboardEvent } from 'preact';
import { File as FileIcon, Paperclip, Send, Shield, Square, X } from 'lucide-preact';
import { formatBytes } from '@/shared/lib/format/number';
import { providerLabel } from '@/shared/lib/models/provider-label';

export interface BtwComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  running: boolean;
  modelLabel?: string;
  provider?: string;
  providerNames?: Record<string, string>;
  attachments: { id: string; name: string; size: number }[];
  onFilesSelected: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
}

const ICON_BUTTON = 'p-1.5 rounded text-ink/60 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer';

export function BtwComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  running,
  modelLabel,
  provider,
  providerNames,
  attachments,
  onFilesSelected,
  onRemoveAttachment,
}: BtwComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 || attachments.length > 0;
  const providerText = provider ? providerLabel(provider, providerNames) : '';

  // The form replaces the chat composer that had focus, so the caret is put
  // here — the field the form is for, and the one a restored draft is waiting
  // in — instead of being left on the document body.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  // Grow with the content and collapse again when the parent clears `value`
  // after a submit — `height: auto` first, otherwise the box can only expand.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  const handleKeyDown = (event: TargetedKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.currentTarget.blur();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    // IME candidate selection must not submit the question.
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (canSend) onSubmit();
  };

  const handleFileSelect = (event: TargetedEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (files && files.length > 0) onFilesSelected(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-paper border border-ink/20 rounded-2xl shadow-lg flex flex-col overflow-hidden">
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onInput={(event) => onChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask in this btw session..."
        className="w-full bg-transparent text-[13px] text-ink placeholder-ink/40 resize-none outline-none px-3.5 pt-3 pb-1 max-h-32"
      />

      {attachments.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5 px-3 pt-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative flex items-center bg-canvas border border-ink/10 rounded-md p-0.5 pr-6 text-xs"
            >
              <div className="w-6 h-6 flex items-center justify-center bg-ink/5 rounded-sm mr-1.5 text-ink/60">
                <FileIcon size={12} strokeWidth={2} />
              </div>
              <span className="truncate max-w-[120px] font-mono text-[10px] text-ink/80">{attachment.name}</span>
              {formatBytes(attachment.size) && (
                <span className="ml-1.5 font-mono text-[10px] text-ink/40">{formatBytes(attachment.size)}</span>
              )}
              <button
                type="button"
                onClick={() => onRemoveAttachment(attachment.id)}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-ink/40 hover:text-error hover:bg-error/10 rounded transition-colors cursor-pointer"
                aria-label={`Remove ${attachment.name}`}
                title="Remove attachment"
              >
                <X size={10} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-2 pb-2">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={ICON_BUTTON}
            aria-label="Attach files"
            title="Attach files"
          >
            <Paperclip size={14} strokeWidth={2} />
          </button>

          <span
            className="p-1.5 text-ink/40"
            aria-label="Side answers never use tools"
            title="Side answers never use tools"
          >
            <Shield size={14} strokeWidth={2} />
          </span>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {(providerText || modelLabel) && (
            <div className="flex items-baseline gap-1.5 min-w-0">
              {providerText && <span className="text-[10px] text-ink/40 shrink-0">{providerText}</span>}
              {modelLabel && <span className="text-[11px] text-ink/70 truncate">{modelLabel}</span>}
            </div>
          )}

          {running ? (
            <button
              type="button"
              onClick={onStop}
              className="bg-ink text-canvas rounded p-1.5 cursor-pointer"
              aria-label="Stop side answer"
              title="Stop side answer"
            >
              <Square size={14} strokeWidth={2} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSend}
              className="bg-ink text-canvas hover:bg-ink/80 rounded p-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send side question"
              title="Send side question"
            >
              <Send size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <input type="file" accept="image/*" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
    </div>
  );
}
