import { Settings, Info } from 'lucide-react';

export function SessionSidebarFooter({ onSettings, onInfo }: { onSettings: () => void, onInfo: () => void }) {
  return (
    <div className="p-3 border-t border-ink/10 flex items-center justify-between text-ink/60 shrink-0">
      <div className="flex space-x-3">
        <Settings size={16} className="hover:text-ink cursor-pointer" onClick={onSettings} />
        <Info size={16} className="hover:text-ink cursor-pointer" onClick={onInfo} />
      </div>
      <div className="px-2 py-0.5 rounded-full border border-ink/20 text-[10px] font-semibold text-ink">
        update
      </div>
    </div>
  );
}
