import { useEffect, useState } from 'preact/hooks';
import { FolderOpen, Home, X } from 'lucide-preact';
import { SettingsModal } from '@/client/components/settings/LazyModal';
import { FolderPicker } from '@/client/components/common/FolderPicker';

/**
 * Modals shared by the desktop and mobile sidebars. The scheduler lives in its
 * own folder (`./scheduler-modal`) — it is a real feature with state, a server
 * API and its own sub-components, not a presentational dialog.
 */
export { SettingsModal };
export { AboutModal } from '@/client/components/layout/session-sidebar/about-modal';

interface NewWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Submit handler: name (required unless derived from path) + optional omp
   *  project path. Return a rejected promise to keep the modal open on error. */
  onCreate?: (input: { name: string; path?: string }) => Promise<void> | void;
}

export function NewWorkspaceModal({ isOpen, onClose, onCreate }: NewWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPath('');
      setBusy(false);
      setError(null);
      setPickerOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePickPath = (picked: string) => {
    setPath(picked);
    setPickerOpen(false);
    // Convenience: derive the folder name from the picked path when the user
    // has not typed a custom name yet.
    if (!name.trim()) {
      const base = picked.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
      if (base) setName(base);
    }
  };

  const handleCreate = async () => {
    if (!onCreate) {
      onClose();
      return;
    }
    if (!name.trim() && !path.trim()) {
      setError('Enter a name or a project path.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), path: path.trim() || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/20 z-50 flex items-center justify-center">
      <div className="bg-paper border border-ink/10 rounded-lg shadow-xl w-96 p-4 flex flex-col">
        <div className="flex justify-between items-center mb-4 border-b border-ink/10 pb-2">
          <h3 className="font-semibold text-sm">New Workspace</h3>
          <X size={14} className="cursor-pointer hover:text-ink/60" onClick={onClose} />
        </div>
        <div className="text-sm text-ink/80 py-2 space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1 text-ink">Workspace Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="e.g. bofis-pro"
              className="w-full bg-paper border border-ink/20 rounded px-3 py-2 outline-none focus:border-ink/50 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-ink">
              Project Path <span className="text-ink/40 font-normal">(optional — binds omp sessions)</span>
            </label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 flex items-center bg-paper border border-ink/20 rounded overflow-hidden focus-within:border-ink/50">
                <div className="px-2 text-ink/40 bg-ink/5 h-full flex items-center border-r border-ink/10">
                  <Home size={14} />
                </div>
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.currentTarget.value)}
                  placeholder="~/projects/my-project"
                  className="w-full px-3 py-2 outline-none text-sm bg-transparent"
                />
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="px-3 py-2 bg-ink/5 border border-ink/10 rounded text-xs font-medium hover:bg-ink/10 transition-colors flex items-center space-x-1.5 flex-shrink-0"
              >
                <FolderOpen size={13} />
                <span>Browse</span>
              </button>
            </div>
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
        <div className="mt-4 flex justify-end space-x-2">
          <button
            className="px-3 py-1.5 text-xs font-medium text-ink/60 hover:text-ink transition-colors"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1.5 text-xs font-medium bg-ink text-canvas rounded hover:bg-ink/90 transition-colors disabled:opacity-50"
            onClick={handleCreate}
            disabled={busy}
          >
            {busy ? 'Creating…' : 'Create Workspace'}
          </button>
        </div>
      </div>
      {pickerOpen && (
        <FolderPicker
          initialPath={path || undefined}
          onSelect={handlePickPath}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
