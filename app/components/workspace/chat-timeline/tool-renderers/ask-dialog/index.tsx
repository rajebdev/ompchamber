import { useEffect, useRef, useState, useCallback } from 'react';
import {
  HelpCircle,
  AlertCircle,
  Terminal,
  FileText,
  ListFilter,
  CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { ExtensionUiDialogRequest } from '@/hooks/chat/omp';
import { AskDialogHeader } from '@/components/workspace/chat-timeline/tool-renderers/ask-dialog/Header';
import { AskDialogSelectBody } from '@/components/workspace/chat-timeline/tool-renderers/ask-dialog/SelectBody';
import { AskDialogFooter } from '@/components/workspace/chat-timeline/tool-renderers/ask-dialog/Footer';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';

export type ExtensionDialogResponse =
  | { value: string }
  | { confirmed: boolean }
  | { cancelled: true };

interface AskDialogProps {
  request: ExtensionUiDialogRequest;
  onRespond: (request: ExtensionUiDialogRequest, response: ExtensionDialogResponse) => void;
}

export function AskDialog({ request, onRespond }: AskDialogProps) {
  const [value, setValue] = useState(request.method === 'editor' ? request.prefill ?? '' : '');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const options = request.options ?? [];
  const optionDetails = request.optionDetails ?? [];

  useEffect(() => {
    setValue(request.method === 'editor' ? request.prefill ?? '' : '');
    setSelectedOption(options.length > 0 ? options[0] : null);
    setCustomValue('');
  }, [request, options]);

  useEffect(() => {
    panelRef.current?.focus();
    if (request.method === 'input') {
      inputRef.current?.focus();
    } else if (request.method === 'editor') {
      textareaRef.current?.focus();
    } else if (request.method === 'select') {
      // When the AI offers an "Other"-style option, the intended interaction
      // is typing a custom answer — focus the input right away.
      const hasOther = options.some((option) => /^other\b/i.test(option.trim()));
      if (hasOther) {
        customInputRef.current?.focus();
      }
    }
  }, [request.id, request.method, options]);

  const cancel = useCallback(() => {
    onRespond(request, { cancelled: true });
  }, [onRespond, request]);

  const submitValue = useCallback(() => {
    if (request.method === 'confirm') {
      onRespond(request, { confirmed: true });
    } else if (request.method === 'select') {
      // A typed custom answer is the actual response — the "Other" option
      // label itself is not. It wins over the highlighted option.
      if (customValue.trim()) {
        onRespond(request, { value: customValue.trim() });
      } else if (selectedOption) {
        onRespond(request, { value: selectedOption });
      }
    } else {
      onRespond(request, { value });
    }
  }, [onRespond, request, selectedOption, value, customValue]);

  const handleConfirmOption = useCallback(
    (option: string) => {
      // Never submit the literal "Other…" label (e.g. via double-click) —
      // it is a prompt to type, not an answer. Redirect to the input instead.
      if (/^other\b/i.test(option.trim())) {
        setSelectedOption(option);
        customInputRef.current?.focus();
        return;
      }
      onRespond(request, { value: option });
    },
    [onRespond, request]
  );

  const handleSelectOption = useCallback(
    (option: string) => {
      setSelectedOption(option);
      // "Other"-style options expect a typed answer; put the caret in the
      // custom input instead of leaving the label itself as the response.
      if (/^other\b/i.test(option.trim())) {
        customInputRef.current?.focus();
      }
    },
    []
  );

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
        return;
      }

      if (request.method === 'select' && options.length > 0) {
        // Typing in the custom "Other" input must not trigger number/arrow/Enter
        // shortcuts — those keys belong to the text field while focused.
        const typingCustom = e.target instanceof HTMLInputElement && e.target === customInputRef.current;
        if (typingCustom) {
          return;
        }

        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= options.length) {
          e.preventDefault();
          setSelectedOption(options[num - 1]);
          return;
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const currentIdx = options.findIndex((o) => o === selectedOption);
          const nextIdx = currentIdx < options.length - 1 ? currentIdx + 1 : 0;
          setSelectedOption(options[nextIdx]);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const currentIdx = options.findIndex((o) => o === selectedOption);
          const prevIdx = currentIdx > 0 ? currentIdx - 1 : options.length - 1;
          setSelectedOption(options[prevIdx]);
          return;
        }

        if (e.key === 'Enter' && selectedOption) {
          e.preventDefault();
          submitValue();
          return;
        }
      }

      if (request.method === 'confirm') {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitValue();
          return;
        }
      }

      if (request.method === 'editor') {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          submitValue();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancel, submitValue, request.method, options, selectedOption]);

  const methodMeta = (() => {
    switch (request.method) {
      case 'select':
        return {
          icon: <ListFilter size={16} className="text-ink" />,
          label: 'Decision Required',
          badge: `${options.length} Choices`,
        };
      case 'confirm':
        return {
          icon: <AlertCircle size={16} className="text-ink" />,
          label: 'Confirmation Required',
          badge: 'Confirm Action',
        };
      case 'input':
        return {
          icon: <Terminal size={16} className="text-ink" />,
          label: 'Prompt Input',
          badge: 'Text Input',
        };
      case 'editor':
        return {
          icon: <FileText size={16} className="text-ink" />,
          label: 'Buffer Editor',
          badge: 'Multiline Buffer',
        };
      default:
        return {
          icon: <HelpCircle size={16} className="text-ink" />,
          label: 'Agent Request',
          badge: 'Input',
        };
    }
  })();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        style={{
          background: 'color-mix(in srgb, var(--theme-ink) 55%, transparent)',
          backdropFilter: 'blur(8px)',
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) cancel();
        }}
      >
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={request.title || methodMeta.label}
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-ink/15 bg-paper shadow-2xl outline-none"
          style={{
            boxShadow: '0 24px 64px -8px color-mix(in srgb, var(--theme-ink) 28%, transparent)',
          }}
        >
          <AskDialogHeader
            title={request.title}
            methodLabel={methodMeta.label}
            badge={methodMeta.badge}
            icon={methodMeta.icon}
            onCancel={cancel}
          />

          <div className="max-h-[65vh] overflow-y-auto px-6 py-5 space-y-4">
            {/* Prompt / Context Message with Markdown */}
            {request.message && (
              <div className="rounded-xl border border-ink/8 bg-canvas/40 p-4 text-[13px] leading-relaxed text-ink/85 select-text">
                <MarkdownRenderer content={request.message} />
              </div>
            )}

            {/* Select Options */}
            {request.method === 'select' && (
              <AskDialogSelectBody
                options={options}
                optionDetails={optionDetails}
                selectedOption={selectedOption}
                customValue={customValue}
                onCustomChange={setCustomValue}
                customInputRef={customInputRef}
                onSelect={handleSelectOption}
                onConfirmOption={handleConfirmOption}
              />
            )}

            {/* Confirm Banner */}
            {request.method === 'confirm' && (
              <div className="flex items-center gap-3 rounded-xl border border-ink/10 bg-canvas/30 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink">
                  <CheckCircle2 size={18} />
                </div>
                <div className="text-[12.5px] leading-relaxed text-ink/75">
                  Confirming will allow the autonomous agent to proceed with this operation. Press <kbd className="rounded border border-ink/20 bg-paper px-1 py-0.2 font-mono text-[10.5px]">Enter</kbd> to confirm or <kbd className="rounded border border-ink/20 bg-paper px-1 py-0.2 font-mono text-[10.5px]">Esc</kbd> to abort.
                </div>
              </div>
            )}

            {/* Single-line Input */}
            {request.method === 'input' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-medium tracking-wider text-ink/50 uppercase">
                  <span>Your Response</span>
                  <span className="font-mono text-[10px] text-ink/40">Press [Enter] to submit</span>
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={value}
                  placeholder={request.placeholder || 'Type your response...'}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitValue();
                    }
                  }}
                  className="w-full rounded-xl border border-ink/15 bg-paper px-4 py-3 text-[13.5px] text-ink placeholder:text-ink/35 outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/15"
                />
              </div>
            )}

            {/* Multiline Editor */}
            {request.method === 'editor' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-medium tracking-wider text-ink/50 uppercase">
                  <span>Buffer Content</span>
                  <span className="font-mono text-[10px] text-ink/40">{value.split('\n').length} lines · ⌘↵ to save</span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  rows={8}
                  placeholder={request.placeholder || 'Enter content...'}
                  className="w-full rounded-xl border border-ink/15 bg-canvas/30 px-4 py-3 font-mono text-[12px] leading-relaxed text-ink placeholder:text-ink/35 outline-none transition-all focus:border-ink focus:bg-paper focus:ring-2 focus:ring-ink/15"
                />
              </div>
            )}
          </div>

          <AskDialogFooter
            method={request.method}
            optionsLength={options.length}
            selectedOption={selectedOption}
            hasCustomAnswer={customValue.trim().length > 0}
            onCancel={cancel}
            onSubmit={submitValue}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
