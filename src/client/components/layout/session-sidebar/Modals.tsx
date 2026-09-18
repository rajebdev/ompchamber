import { useEffect, useState } from 'preact/hooks';
import { Clock, Columns, FolderOpen, Home, Maximize2, Plus, Send, Settings2, Terminal, X } from 'lucide-preact';
import { SettingsModal } from '@/client/components/settings/Modal';
import { FolderPicker } from '@/client/components/common/FolderPicker';

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

interface SchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SchedulerModal({ isOpen, onClose }: SchedulerModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-ink/20 z-50 flex items-center justify-center p-4">
      <div className="bg-paper border border-ink/10 rounded-lg shadow-xl w-full max-w-2xl flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-ink/10 bg-paper">
          <div className="flex items-center space-x-2 text-ink">
            <Clock size={16} />
            <h3 className="font-semibold text-sm">Schedule Chat / Task</h3>
          </div>
          <X size={16} className="cursor-pointer hover:text-ink/60" onClick={onClose} />
        </div>
        
        <div className="p-4 bg-canvas">
          <div className="w-full bg-paper border border-ink/20 rounded-md focus-within:border-ink transition-colors flex flex-col shadow-sm">
            <div className="flex items-center px-3 py-2 border-b border-ink/5 text-ink/60 space-x-2">
              <button className="hover:text-ink transition-colors"><Plus size={14} /></button>
              <button className="hover:text-ink transition-colors"><Columns size={14} /></button>
              <button className="hover:text-ink transition-colors"><Maximize2 size={14} /></button>
              
              <div className="flex-1"></div>
              
              <div className="flex items-center space-x-2 text-xs text-ink">
                <span className="font-medium">Schedule:</span>
                <select className="bg-transparent border border-ink/20 rounded px-1.5 py-0.5 outline-none focus:border-ink/50">
                  <option value="once">Once</option>
                  <option value="every">Every</option>
                  <option value="cron">Cron</option>
                </select>
                <input type="text" placeholder="e.g. 5 mins, 0 0 * * *" className="w-32 bg-transparent border border-ink/20 rounded px-2 py-0.5 outline-none focus:border-ink/50" />
              </div>
            </div>
            
            <textarea 
              placeholder="Describe your scheduled task, ask a question, or paste commands..." 
              className="w-full bg-transparent border-none px-4 py-4 text-sm focus:outline-none resize-none text-ink placeholder-ink/40 min-h-[120px]"
            />
            
            <div className="flex items-center justify-between px-3 py-2 border-t border-ink/5">
              <div className="flex items-center space-x-3 text-ink/60 text-xs">
                <div className="flex items-center space-x-1 hover:text-ink cursor-pointer">
                  <Settings2 size={14} />
                  <span>Default</span>
                </div>
                <div className="flex items-center space-x-1 hover:text-ink cursor-pointer">
                  <Terminal size={14} />
                  <span>[CMD] DeepSeek V4 Flash</span>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded bg-ink text-canvas hover:bg-ink/80 transition-colors text-xs font-medium"
              >
                <span>Schedule Task</span>
                <Send size={12} className="ml-px" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
