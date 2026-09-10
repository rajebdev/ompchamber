import React, { useCallback } from 'react';
import { X, History, GitMerge, AlertTriangle } from 'lucide-react';

function ModalShell({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-canvas/80 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-paper border border-ink/20 rounded-lg shadow-xl flex flex-col overflow-hidden ${wide ? 'w-[min(94vw,680px)] max-h-[82vh]' : 'w-[min(94vw,420px)] max-h-[80vh]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function GitOutputModal({ output, onClose }: { output: { title: string; data: any[] } | null; onClose: () => void }) {
  if (!output) return null;
  const rows = output.data || [];
  const isGraph = output.title.toLowerCase().includes('graph');

  return (
    <ModalShell onClose={onClose} wide>
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
          {isGraph ? <GitMerge size={14} className="text-ink/60" /> : <History size={14} className="text-ink/60" />}
          {output.title}
          <span className="text-[11px] font-normal text-ink/40">{rows.length} commits</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-ink/5 text-ink/60 hover:text-ink transition-colors cursor-pointer"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 scrollbar-overlay-container scrollbar-overlay-static p-3 font-mono text-[11px] text-ink/80">
        {rows.length === 0 ? (
          <div className="text-ink/40 text-center py-10">No commits found.</div>
        ) : (
          rows.map((row: any, i: number) => (
            <div key={i} className="flex items-start gap-3 py-1.5 border-b border-ink/5 last:border-0">
              <span className="whitespace-pre text-ink/30 flex-shrink-0 overflow-hidden max-w-[90px]" title={row.graph || ''}>
                {row.graph || ''}
              </span>
              <span className="text-ink/70 flex-shrink-0">{row.hash}</span>
              <span className="text-ink/50 flex-shrink-0">{row.author}</span>
              <span className="text-ink/30 flex-shrink-0">{row.time}</span>
              <span className="text-ink truncate flex-1 min-w-0">{row.message}</span>
            </div>
          ))
        )}
      </div>
    </ModalShell>
  );
}

export function ConfirmActionModal({ modal, onClose, onConfirm }: { modal: { type: string; file?: string; message: string } | null; onClose: () => void; onConfirm: () => void }) {
  if (!modal) return null;
  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-ink/10">
        <AlertTriangle size={16} className="text-error flex-shrink-0" />
        <h3 className="text-sm font-semibold text-ink">Confirm Action</h3>
      </div>
      <div className="px-4 py-4 text-xs text-ink/80 leading-relaxed">{modal.message}</div>
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-ink/10">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded border border-ink/20 text-ink/70 hover:bg-ink/5 hover:text-ink transition-colors cursor-pointer text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-3 py-1.5 rounded bg-error text-canvas hover:bg-error/90 transition-colors cursor-pointer text-xs font-medium"
        >
          Confirm
        </button>
      </div>
    </ModalShell>
  );
}

export function BranchPromptModal({ isOpen, branchName, inputRef, onChange, onClose, onCreate }: { isOpen: boolean; branchName: string; inputRef: React.RefObject<HTMLInputElement | null>; onChange: (v: string) => void; onClose: () => void; onCreate: () => void }) {
  if (!isOpen) return null;

  const submit = useCallback(() => {
    if (branchName.trim()) onCreate();
  }, [branchName, onCreate]);

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-ink/10">
        <GitMerge size={16} className="text-ink/60 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-ink">Create New Branch</h3>
      </div>
      <div className="px-4 py-4">
        <input
          ref={inputRef}
          type="text"
          value={branchName}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
          placeholder="branch-name"
          className="w-full bg-canvas border border-ink/20 rounded px-3 py-2 text-xs focus:outline-none focus:border-ink/40 text-ink placeholder-ink/40 transition-colors"
        />
      </div>
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-ink/10">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded border border-ink/20 text-ink/70 hover:bg-ink/5 hover:text-ink transition-colors cursor-pointer text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!branchName.trim()}
          className="px-3 py-1.5 rounded bg-ink text-canvas hover:bg-ink/90 transition-colors cursor-pointer text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Create
        </button>
      </div>
    </ModalShell>
  );
}
