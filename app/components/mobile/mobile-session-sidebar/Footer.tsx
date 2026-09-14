import { Settings, Info } from 'lucide-react';
import packageJson from '@/../package.json';

interface MobileSessionFooterProps {
  onSettings: () => void;
  onAbout: () => void;
  updateAvailable?: boolean;
  onUpdateClick?: () => void;
}

export function MobileSessionFooter({ onSettings, onAbout, updateAvailable, onUpdateClick }: MobileSessionFooterProps) {
  return (
    <div className="p-3 border-t border-ink/10 flex items-center justify-between flex-shrink-0 bg-canvas text-xs text-ink/60">
      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={onSettings}
          className="flex items-center space-x-1 hover:text-ink transition-colors"
        >
          <Settings size={14} />
          <span>Settings</span>
        </button>
        <button
          type="button"
          onClick={onAbout}
          className="flex items-center space-x-1 hover:text-ink transition-colors"
        >
          <Info size={14} />
          <span>About</span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-ink/40">v{packageJson.version}</span>
        {updateAvailable && (
          <button
            type="button"
            onClick={onUpdateClick}
            className="px-2 py-0.5 rounded-full border border-ink/20 text-[10px] font-semibold text-ink hover:border-ink/40"
          >
            update
          </button>
        )}
      </div>
    </div>
  );
}
