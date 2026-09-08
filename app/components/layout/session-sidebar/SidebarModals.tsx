import React from 'react';
import { X, Home, Clock, Plus, Columns, Maximize2, Settings2, Terminal, Send, FolderOpen } from 'lucide-react';
import packageJson from '@/../package.json';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { FolderPicker } from '@/components/common/FolderPicker';

export { SettingsModal };

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative bg-paper border border-ink/15 rounded-2xl shadow-2xl w-full max-w-[340px] p-6 text-center text-ink select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink/40 hover:text-ink transition-colors p-1 rounded-md"
          aria-label="Close"
        >
          <X size={18} className="stroke-[2.5]" />
        </button>

        {/* OMP Chamber Brand Logo */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-24 h-24 rounded-2xl bg-ink border border-ink/20 shadow-md flex flex-col items-center justify-center p-3 relative overflow-hidden select-none">
            {/* Subtle highlight overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none rounded-2xl" />
            
            {/* OMP Besar with App Title Gradient */}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-[30px] tracking-tighter leading-none select-none">
              OMP
            </span>

            {/* chamber kecil di bawahnya */}
            <span className="text-paper/90 text-[11px] font-semibold tracking-[0.2em] lowercase mt-1.5 select-none font-sans">
              chamber
            </span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold tracking-tight mt-3 flex items-center justify-center">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-2xl tracking-tighter">OMP</span>
          <span className="text-ink text-2xl font-bold ml-[1px]">Chamber</span>
        </h2>

        {/* App & Agent Versions */}
        <div className="text-xs text-ink/60 space-y-1 mt-1.5 font-mono">
          <p>OMPChamber v{packageJson.version}</p>
          <p>Oh-My-Pi agent (Bun v1.2.4)</p>
        </div>

        {/* Social / Community Links */}
        <div className="flex flex-col items-center gap-3 mt-6 pt-1">
          <div className="flex items-center justify-center gap-6">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-xs font-medium text-ink/75 hover:text-ink transition-colors"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>GitHub</span>
            </a>

            <a
              href="https://discord.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-xs font-medium text-ink/75 hover:text-ink transition-colors"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              <span>Discord</span>
            </a>
          </div>

          <a
            href="https://x.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs font-medium text-ink/75 hover:text-ink transition-colors"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span>@ompchamber</span>
          </a>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-ink/50 font-normal mt-8">
          Made with love for the community
        </p>
      </div>
    </div>
  );
}

interface NewWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Submit handler: name (required unless derived from path) + optional omp
   *  project path. Return a rejected promise to keep the modal open on error. */
  onCreate?: (input: { name: string; path?: string }) => Promise<void> | void;
}

export function NewWorkspaceModal({ isOpen, onClose, onCreate }: NewWorkspaceModalProps) {
  const [name, setName] = React.useState('');
  const [path, setPath] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  React.useEffect(() => {
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
              onChange={(e) => setName(e.target.value)}
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
                  onChange={(e) => setPath(e.target.value)}
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
