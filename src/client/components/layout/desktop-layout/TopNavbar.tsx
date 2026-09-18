import { LayoutTemplate, MoreHorizontal, PanelRight, PanelRightClose, Smartphone } from 'lucide-preact';
import { PWAInstallButton } from '@/client/components/common/PWAInstallButton';
import type { AgentStreamStatus } from '@/shared/lib/chat/omp/status';

interface TopNavbarProps {
  sessionTitle: string | null;
  showLeftPanel: boolean;
  showEditor: boolean;
  showRightPanel: boolean;
  /** Live agent event stream status; the indicator is WebSocket-only. */
  streamStatus?: AgentStreamStatus;
  onSwitchToMobile?: () => void;
  onToggleEditor: () => void;
  onToggleRightPanel: () => void;
}

export function TopNavbar({
  sessionTitle,
  showLeftPanel,
  showEditor,
  showRightPanel,
  streamStatus,
  onSwitchToMobile,
  onToggleEditor,
  onToggleRightPanel,
}: TopNavbarProps) {
  const showStreamDot = streamStatus?.transport === 'websocket';
  const streamConnected = Boolean(streamStatus?.connected);
  const streamLabel = streamConnected ? 'WebSocket connected' : 'WebSocket disconnected';
  return (
    <header 
      className="h-12 flex-shrink-0 border-b border-ink/10 bg-paper flex items-center justify-between pr-4 z-20 titlebar-drag-region select-none"
      style={{
        paddingLeft: !showLeftPanel ? 'max(1rem, env(titlebar-area-x, 0px))' : undefined,
        paddingRight: 'max(1rem, calc(100vw - env(titlebar-area-width, 100vw)))',
      }}
    >
      <div className="flex items-center space-x-2 px-4 min-w-0">
        {!showLeftPanel && (
          <>
            <span className="font-bold text-sm tracking-tight hidden sm:flex items-center flex-shrink-0">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-[15px] tracking-tighter">OMP</span>
              <span className="ml-[1px]">Chamber</span>
            </span>
            {sessionTitle && (
              <span className="text-ink/30 text-xs select-none flex-shrink-0">/</span>
            )}
          </>
        )}
        {sessionTitle && (
          <div className="flex items-center space-x-2 titlebar-no-drag">
            <span className="font-bold text-sm tracking-tight hidden sm:flex items-center">
              <span className="font-semibold text-xs text-ink truncate">
                {sessionTitle.charAt(0).toUpperCase() + sessionTitle.slice(1)}
              </span>
            </span>
            <MoreHorizontal size={14} className="text-ink/40 hover:text-ink cursor-pointer flex-shrink-0" />
          </div>
        )}
      </div>

      <div className="flex items-center space-x-3 titlebar-no-drag">
        <div className="flex items-center space-x-1">
          {showStreamDot && (
            <span
              role="status"
              aria-label={streamLabel}
              title={streamLabel}
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${streamConnected ? 'bg-success' : 'bg-error'}`}
            />
          )}
          {onSwitchToMobile && (
            <button
              type="button"
              onClick={onSwitchToMobile}
              className="p-1.5 rounded hover:bg-ink/10 transition-colors text-ink/60 hover:text-ink cursor-pointer"
              title="Switch to Mobile View"
            >
              <Smartphone size={16} />
            </button>
          )}
          <PWAInstallButton />
          <button
            type="button"
            onClick={onToggleEditor}
            className={`p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer ${showEditor ? 'text-ink' : 'text-ink/40'}`}
            title="Toggle Editor Layout"
          >
            <LayoutTemplate size={16} />
          </button>
          <button
            type="button"
            onClick={onToggleRightPanel}
            className={`p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer ${showRightPanel ? 'text-ink' : 'text-ink/40'}`}
            title="Toggle Right Panel"
          >
            {showRightPanel ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
}
