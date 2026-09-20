import type { ToastData } from '@/client/components/common/Toast';
import { Toast } from '@/client/components/common/Toast';

interface ToastStackProps {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}

/** Renders the active toast queue — one portal-mounted Toast per entry. */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <>
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </>
  );
}
