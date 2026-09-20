import { Globe, RotateCw } from 'lucide-preact';
import { BrowserToolbar, ICON_BUTTON } from '@/client/components/workspace/browser-toolbar/index';
import type { BrowserViewStatus, ViewportMode } from '@/shared/types';

interface BrowserAddressBarProps {
  url?: string;
  status: BrowserViewStatus;
  viewportMode: ViewportMode;
  zoomLevel?: number;
  onIncludeInChat: () => void;
  onReconnect: () => void;
  onOpenExternal: () => void;
  onChangeViewport: (mode: ViewportMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onSetZoom: (zoom: number) => void;
}

const STATUS_LABEL: Record<BrowserViewStatus, string> = {
  live: 'Live',
  'agent-offline': 'Agent offline',
  'browser-offline': 'Browser offline',
  'no-tab': 'Tanpa tab',
};

/**
 * Read-only toolbar for the AGENT browser: shows the page the session's omp
 * agent is driving plus display controls. The user's own browsing lives in the
 * separate user-browser panel, so nothing here navigates the agent's tab.
 */
export function BrowserAddressBar({
  url,
  status,
  viewportMode,
  zoomLevel = 100,
  onIncludeInChat,
  onReconnect,
  onOpenExternal,
  onChangeViewport,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSetZoom,
}: BrowserAddressBarProps) {
  const isLive = status === 'live';

  return (
    <BrowserToolbar
      url={url ?? ''}
      statusDotClass={isLive ? 'bg-success animate-pulse' : 'bg-ink/25'}
      statusLabel={STATUS_LABEL[status]}
      viewportMode={viewportMode}
      zoomLevel={zoomLevel}
      onChangeViewport={onChangeViewport}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      onResetZoom={onResetZoom}
      onSetZoom={onSetZoom}
      onIncludeInChat={onIncludeInChat}
      onOpenExternal={onOpenExternal}
      openExternalLabel="Buka di jendela baru"
      openExternalTitle={url ? 'Open in new window' : 'No URL loaded'}
      trailingControls={
        <button
          type="button"
          onClick={onReconnect}
          aria-label="Sambungkan ulang live view"
          title="Reconnect live view"
          className={ICON_BUTTON}
        >
          <RotateCw size={14} />
        </button>
      }
    >
      <div className="flex-1 min-w-0 flex items-center bg-canvas border border-ink/15 rounded-md px-2 py-0.5">
        <Globe size={12} className="text-ink/40 mr-1.5 flex-shrink-0" />
        <span className="w-full truncate text-ink/80 font-mono text-[11px]" title={url ?? ''}>
          {url || 'Agent belum membuka halaman'}
        </span>
      </div>
    </BrowserToolbar>
  );
}
