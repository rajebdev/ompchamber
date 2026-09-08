import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export interface ToastData {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: number) => void;
  duration?: number;
}

export function Toast({ toast, onDismiss, duration = 4000 }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 200);
    }, duration);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
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
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(toast.id), 200);
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
