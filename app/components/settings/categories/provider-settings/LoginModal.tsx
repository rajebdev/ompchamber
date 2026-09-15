import { useEffect, useRef, useState } from 'react';
import { X, Globe, Key, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { ProviderItem } from '@/types';
import { ProviderIcon } from '@/components/settings/categories/provider-settings/Icons';

interface LoginModalProps {
  isOpen: boolean;
  provider: ProviderItem;
  onClose: () => void;
  onAuthenticated: () => void;
}

interface UiRequest {
  id: string;
  method?: string;
  title?: string;
  launchUrl?: string;
  placeholder?: string;
}

/**
 * OAuth/API-key login flow against POST /api/omp/login (SSE). Renders
 * extension_ui_request prompts: open_url becomes a launch link, input asks
 * for a credential, notify shows status. Replies are forwarded via the same
 * endpoint so the throwaway omp process completes its flow.
 */
export function LoginModal({ isOpen, provider, onClose, onAuthenticated }: LoginModalProps) {
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'success' | 'failed'>('connecting');
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [inputPrompt, setInputPrompt] = useState<UiRequest | null>(null);
  const [notifyText, setNotifyText] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const respondRef = useRef<((payload: Record<string, unknown>) => void) | null>(null);
  // Read through a ref: the parent recreates this handler on every render, and
  // a changing dependency would abort + restart the login stream mid-flow.
  const onAuthenticatedRef = useRef(onAuthenticated);
  onAuthenticatedRef.current = onAuthenticated;

  useEffect(() => {
    if (!isOpen) return;
    setStatus('connecting');
    setOpenUrl(null);
    setInputPrompt(null);
    setNotifyText(null);
    setErrorMessage(null);
    setInputValue('');

    const controller = new AbortController();
    const respond = (payload: Record<string, unknown>) => {
      fetch('/api/omp/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).catch(() => {});
    };
    respondRef.current = respond;

    fetch('/api/omp/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: provider.slug }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.body) throw new Error('Streaming not supported');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            const line = part.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            try {
              const frame = JSON.parse(line.slice(6)) as UiRequest & { type: string; success?: boolean; error?: string };
              if (frame.type === 'extension_ui_request') {
                setStatus('waiting');
                if (frame.method === 'open_url' && frame.launchUrl) {
                  setOpenUrl(frame.launchUrl);
                  window.open(frame.launchUrl, '_blank', 'noopener');
                } else if (frame.method === 'input') {
                  setInputPrompt(frame);
                } else if (frame.method === 'notify') {
                  setNotifyText(frame.title ?? '');
                  if (frame.title) respond({ id: frame.id, accepted: true });
                } else {
                  respond({ id: frame.id, cancelled: true });
                }
              } else if (frame.type === 'login_result') {
                setStatus(frame.success ? 'success' : 'failed');
                if (!frame.success) setErrorMessage(frame.error ?? 'Login failed');
                if (frame.success) onAuthenticatedRef.current();
                controller.abort();
                return;
              }
            } catch { /* malformed frame — skip */ }
          }
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setStatus('failed');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      });

    return () => {
      controller.abort();
      respondRef.current = null;
    };
  }, [isOpen, provider.slug]);

  const submitInput = (cancelled: boolean) => {
    if (!inputPrompt) return;
    respondRef.current?.(cancelled
      ? { id: inputPrompt.id, cancelled: true }
      : { id: inputPrompt.id, value: inputValue });
    setInputPrompt(null);
    setStatus('connecting');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-paper border border-ink/15 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-ink/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ProviderIcon icon={provider.icon} size={18} />
            <div>
              <h3 className="text-sm font-semibold text-ink">Sign in to {provider.name}</h3>
              <p className="text-[11px] text-ink/50 font-mono">{provider.slug}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded text-ink/40 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {status === 'connecting' && (
            <div className="flex items-center gap-2.5 text-xs text-ink/70">
              <Loader2 size={14} className="animate-spin" />
              Starting login flow...
            </div>
          )}

          {status === 'waiting' && (
            <div className="space-y-4">
              {openUrl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                    <Globe size={13} className="text-ink/50" /> OAuth browser
                  </div>
                  <p className="text-xs text-ink/60">Complete the sign-in in the opened browser tab.</p>
                  <button
                    type="button"
                    onClick={() => window.open(openUrl, '_blank', 'noopener')}
                    className="text-xs text-ink underline underline-offset-2 break-all text-left"
                  >
                    {openUrl}
                  </button>
                </div>
              )}
              {inputPrompt && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                    <Key size={13} className="text-ink/50" /> {inputPrompt.title ?? 'Credential'}
                  </div>
                  <input
                    type="text"
                    autoFocus
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitInput(false)}
                    placeholder={inputPrompt.placeholder ?? 'Paste your API key'}
                    className="w-full bg-paper border border-ink/20 rounded-md px-3 py-1.5 text-xs text-ink outline-none focus:border-ink/60 font-mono"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => submitInput(true)} className="px-3 py-1.5 rounded-md border border-ink/20 text-xs text-ink hover:bg-ink/5 transition-colors cursor-pointer">
                      Cancel
                    </button>
                    <button type="button" onClick={() => submitInput(false)} className="px-3.5 py-1.5 rounded-md bg-ink text-canvas text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer">
                      Submit
                    </button>
                  </div>
                </div>
              )}
              {notifyText && <p className="text-xs text-ink/60">{notifyText}</p>}
              {!openUrl && !inputPrompt && !notifyText && (
                <p className="text-xs text-ink/50">Waiting for the provider flow...</p>
              )}
            </div>
          )}

          {status === 'success' && (
            <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium">
              <CheckCircle2 size={14} /> Signed in. Credentials stored by omp.
            </div>
          )}
          {status === 'failed' && (
            <div className="flex items-start gap-2 text-xs text-error font-medium">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{errorMessage ?? 'Login failed'}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-ink/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md border border-ink/20 text-xs font-medium text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            {status === 'success' ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
