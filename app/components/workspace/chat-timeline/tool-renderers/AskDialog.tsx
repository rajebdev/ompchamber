import { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import type { ExtensionUiDialogRequest } from '@/hooks/useOmpAgent';

export type ExtensionDialogResponse =
  | { value: string }
  | { confirmed: boolean }
  | { cancelled: true };

interface AskDialogProps {
  request: ExtensionUiDialogRequest;
  onRespond: (request: ExtensionUiDialogRequest, response: ExtensionDialogResponse) => void;
}

/** Overlay dialog untuk ask/approval dari omp (extension_ui_request).
 *  Blocking: tool call menunggu sampai user merespons. */
export function AskDialog({ request, onRespond }: AskDialogProps) {
  const [value, setValue] = useState(request.method === 'editor' ? request.prefill ?? '' : '');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(request.method === 'editor' ? request.prefill ?? '' : '');
    setSelectedOption(null);
  }, [request]);

  useEffect(() => {
    panelRef.current?.focus();
  }, [request.id]);

  const cancel = () => onRespond(request, { cancelled: true });

  const submitValue = () => {
    if (request.method === 'confirm') {
      onRespond(request, { confirmed: true });
    } else if (request.method === 'select') {
      if (selectedOption) onRespond(request, { value: selectedOption });
    } else {
      onRespond(request, { value });
    }
  };

  const options = request.options ?? [];
  const optionDetails = request.optionDetails ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 animate-fade-in"
      style={{ background: 'color-mix(in srgb, var(--theme-ink) 45%, transparent)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        tabIndex={-1}
        className="w-full max-w-[520px] overflow-hidden rounded-2xl outline-none animate-scale-in"
        style={{
          border: '1px solid color-mix(in srgb, var(--theme-ink) 15%, transparent)',
          background: 'var(--theme-paper)',
          boxShadow: '0 24px 80px color-mix(in srgb, var(--theme-ink) 35%, transparent)',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            cancel();
          }
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink/10 px-4 py-3.5">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-tight text-ink">{request.title}</div>
            <div className="mt-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-ink/40">
              {request.method === 'select' ? 'Select an option' : request.method === 'confirm' ? 'Confirmation' : request.method === 'input' ? 'Input' : 'Editor'}
            </div>
          </div>
          <button
            type="button"
            onClick={cancel}
            aria-label="Cancel"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {request.method === 'confirm' && (
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink/80">
              {request.message}
            </div>
          )}

          {request.method === 'select' && (
            <div className="grid gap-1.5">
              {options.map((option, index) => {
                const selected = selectedOption === option;
                const detail = optionDetails[index]?.description;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onRespond(request, { value: option })}
                    aria-pressed={selected}
                    className="group flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-all duration-150"
                    style={{
                      borderColor: selected ? 'var(--theme-ink)' : 'color-mix(in srgb, var(--theme-ink) 12%, transparent)',
                      background: selected ? 'color-mix(in srgb, var(--theme-ink) 6%, var(--theme-paper))' : 'var(--theme-paper)',
                      color: 'var(--theme-ink)',
                    }}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        selected ? 'border-ink bg-ink' : 'border-ink/25 group-hover:border-ink/50'
                      }`}
                    >
                      {selected && <Check size={10} className="text-paper" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{option}</span>
                      {detail && (
                        <span className="mt-0.5 block text-[11px] leading-snug text-ink/50">{detail}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {request.method === 'input' && (
            <input
              autoFocus
              aria-label={request.title || request.placeholder || 'Input value'}
              value={value}
              placeholder={request.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitValue();
              }}
              className="w-full rounded-xl border border-ink/15 bg-paper px-3.5 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-ink/50"
            />
          )}

          {request.method === 'editor' && (
            <textarea
              autoFocus
              aria-label={request.title || 'Input value'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitValue();
              }}
              className="w-full min-h-[200px] resize-y rounded-xl border border-ink/15 bg-paper px-3.5 py-3 text-[13px] leading-relaxed text-ink outline-none transition-colors focus:border-ink/50"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-ink/10 bg-canvas/40 px-4 py-3">
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg border border-ink/15 px-3.5 py-1.5 text-[12px] font-medium text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            Cancel
          </button>
          {request.method === 'confirm' ? (
            <button
              type="button"
              onClick={submitValue}
              className="rounded-lg bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-paper transition-opacity hover:opacity-85"
            >
              Confirm
            </button>
          ) : request.method === 'select' ? (
            <button
              type="button"
              onClick={submitValue}
              disabled={!selectedOption}
              className="rounded-lg bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-paper transition-opacity disabled:cursor-not-allowed disabled:opacity-35"
            >
              Submit
            </button>
          ) : (
            <button
              type="button"
              onClick={submitValue}
              className="rounded-lg bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-paper transition-opacity hover:opacity-85"
            >
              Submit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
