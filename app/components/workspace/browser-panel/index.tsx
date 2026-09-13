import { BrowserAddressBar } from '@/components/workspace/browser-panel/AddressBar';
import { BrowserScreencast } from '@/components/workspace/browser-panel/Screencast';
import { useScreencast } from '@/hooks/browser/use-screencast';
import { useSessionState } from '@/hooks/workspace/session-state';
import type { ViewportMode } from '@/types';

interface BrowserPanelProps {
  className?: string;
}

/**
 * Live viewer for the browser tab this session's omp agent drives in the
 * project-shared Chromium (see app/lib/browser/ + /api/browser/:id/stream).
 */
export function BrowserPanel({ className = '' }: BrowserPanelProps) {
  const [viewportMode, setViewportMode] = useSessionState<ViewportMode>('browser.viewportMode', 'responsive');
  const [zoomLevel, setZoomLevel] = useSessionState<number>('browser.zoomLevel', 100);
  const { status, url, tabs, targetId, frameSrc, actions, selectTarget, reconnect } = useScreencast();

  const handleOpenExternal = () => {
    if (!url) return;
    const target =
      url.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`flex flex-col h-full w-full bg-paper text-ink overflow-hidden select-none ${className}`}>
      <BrowserAddressBar
        url={url}
        status={status}
        viewportMode={viewportMode}
        zoomLevel={zoomLevel}
        onReconnect={reconnect}
        onOpenExternal={handleOpenExternal}
        onChangeViewport={setViewportMode}
        onZoomIn={() => setZoomLevel((prev) => Math.min(200, prev + 10))}
        onZoomOut={() => setZoomLevel((prev) => Math.max(50, prev - 10))}
        onResetZoom={() => setZoomLevel(100)}
        onSetZoom={setZoomLevel}
      />

      <BrowserScreencast
        status={status}
        url={url}
        tabs={tabs}
        targetId={targetId}
        frameSrc={frameSrc}
        actions={actions}
        onSelectTarget={selectTarget}
        viewportMode={viewportMode}
        zoomLevel={zoomLevel}
      />
    </div>
  );
}
