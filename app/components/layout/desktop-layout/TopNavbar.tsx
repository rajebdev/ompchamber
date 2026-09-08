import { PanelRightClose, PanelRight, LayoutTemplate, Smartphone, MoreHorizontal } from 'lucide-react';
import { PWAInstallButton } from '@/components/common/PWAInstallButton';

interface TopNavbarProps {
  sessionTitle: string | null;
  showLeftPanel: boolean;
  showEditor: boolean;
  showRightPanel: boolean;
  onSwitchToMobile?: () => void;
  onToggleEditor: () => void;
  onToggleRightPanel: () => void;
}

export function TopNavbar({
  sessionTitle,
  showLeftPanel,
  showEditor,
  showRightPanel,
  onSwitchToMobile,
  onToggleEditor,
  onToggleRightPanel,
}: TopNavbarProps) {
  return (
    <header className="h-12 flex-shrink-0 border-b border-ink/10 bg-paper flex items-center justify-between pr-4 z-20">
      <div className="flex items-center space-x-2 px-4 min-w-0">
        {showLeftPanel ? (
          <>
            <span className="font-bold text-sm tracking-tight hidden sm:flex items-center">
              <span className="font-semibold text-xs text-ink truncate">{sessionTitle ?? 'OMP Chamber'}</span>
            </span>
            {sessionTitle && (
              <MoreHorizontal size={14} className="text-ink/40 hover:text-ink cursor-pointer flex-shrink-0" />
            )}
          </>
        ) : (
          <span className="font-bold text-sm tracking-tight hidden sm:flex items-center whitespace-nowrap bg-clip-text text-transparent bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-[15px] tracking-tighter">
            OMP Chamber
          </span>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1">
          {onSwitchToMobile && (
            <button
              type="button"
              onClick={onSwitchToMobile}
              className="p-1.5 rounded hover:bg-ink/10 transition-colors text-ink/60 hover:text-ink"
              title="Switch to Mobile View"
            >
              <Smartphone size={16} />
            </button>
          )}
          <PWAInstallButton />
          <button
            type="button"
            onClick={onToggleEditor}
            className={`p-1.5 rounded hover:bg-ink/10 transition-colors ${showEditor ? 'text-ink' : 'text-ink/40'}`}
            title="Toggle Editor Layout"
          >
            <LayoutTemplate size={16} />
          </button>
          <button
            type="button"
            onClick={onToggleRightPanel}
            className={`p-1.5 rounded hover:bg-ink/10 transition-colors ${showRightPanel ? 'text-ink' : 'text-ink/40'}`}
            title="Toggle Right Panel"
          >
            {showRightPanel ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
}
