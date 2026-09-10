import { useRef, useState } from 'react';
import type { ToastData } from '@/components/common/Toast';

export function useToasts() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastIdRef = useRef(0);

  const pushToast = (message: string, type: 'success' | 'error' = 'error') => {
    toastIdRef.current += 1;
    setToasts(prev => [...prev, { id: toastIdRef.current, message, type }]);
  };

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return { toasts, pushToast, dismissToast };
}
