import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { AlertCircle, CheckCircle2, X } from 'lucide-preact';

export interface ToastData {
  id: number;
  message: string;
  type: 'success' | 'error';
  /** Optional action button (e.g. "Send now") shown beside the message. */
  action?: { label: string; onClick: () => void };
  /** Override the auto-dismiss duration (ms). */
  duration?: number;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: number) => void;
  duration?: number;
}

export function Toast({ toast, onDismiss, duration: durationProp }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const duration = durationProp ?? toast.duration ?? 4000;
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      dismissTimerRef.current = setTimeout(() => onDismiss(toast.id), 200);
    }, duration);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [toast.id, duration, onDismiss]);

  return createPortal(
    <div
      className={`fixed bottom-4 right-4 z-[200] flex items-center space-x-2 bg-paper border shadow-2xl rounded-lg px-4 py-3 text-xs font-sans transition-all duration-200 ${
        toast.type === 'error' ? 'border-error/40' : 'border-ink/15'
      } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
      role="status"
    >
      {toast.type === 'error' ? (
        <AlertCircle size={15} className="text-error flex-shrink-0" />
      ) : (
        <CheckCircle2 size={15} className="text-success flex-shrink-0" />
      )}
      <span className="text-ink max-w-[320px]">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            setVisible(false);
            dismissTimerRef.current = setTimeout(() => onDismiss(toast.id), 200);
          }}
          className="flex-shrink-0 px-2 py-0.5 rounded bg-ink text-paper font-semibold hover:opacity-80 transition-opacity"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          dismissTimerRef.current = setTimeout(() => onDismiss(toast.id), 200);
        }}
        className="text-ink/40 hover:text-ink transition-colors flex-shrink-0"
        title="Dismiss"
      >
        <X size={13} />
      </button>
    </div>,
    document.body
  );
}
