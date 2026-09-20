import type { FormEvent, ReactNode } from 'preact/compat';
import { X } from 'lucide-preact';

export interface ModalProps {
  /** Backdrop click / close-button handler. */
  onClose: () => void;
  /** Header content rendered left of the close button. */
  header: ReactNode;
  /** Body content. */
  children: ReactNode;
  /** Optional footer row, rendered after the body. */
  footer?: ReactNode;
  /**
   * When set, the body + footer are wrapped in a `<form>` with this onSubmit and
   * className — preserving modals whose whole content is one form.
   */
  form?: { onSubmit: (event: FormEvent) => void; className: string };
  /** Panel width class. Default `max-w-md`. */
  maxWidthClass?: string;
  /** Backdrop z-index class. Default `z-[60]`. */
  zClass?: string;
}

/**
 * Centered modal shell: dimmed backdrop, bordered panel, standard header with
 * close button, and an optional footer. Body/footer stay caller-owned so each
 * modal keeps its exact DOM order, classes and text.
 */
export function Modal({
  onClose,
  header,
  children,
  footer,
  form,
  maxWidthClass = 'max-w-md',
  zClass = 'z-[60]',
}: ModalProps) {
  const body = (
    <>
      {children}
      {footer}
    </>
  );

  return (
    <div
      className={`fixed inset-0 bg-ink/40 backdrop-blur-[2px] ${zClass} flex items-center justify-center p-4`}
      onClick={onClose}
    >
      <div
        className={`bg-paper border border-ink/15 rounded-xl shadow-2xl w-full ${maxWidthClass} overflow-hidden text-ink`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-ink/10 flex items-center justify-between">
          {header}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-ink/40 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {form ? (
          <form onSubmit={form.onSubmit} className={form.className}>
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  );
}
