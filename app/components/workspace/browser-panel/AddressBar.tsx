import { useState } from 'react';
import { Check, Copy, ExternalLink, Globe, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { BrowserViewportSelector } from '@/components/workspace/browser-panel/ViewportSelector';
import type { BrowserViewStatus, ViewportMode } from '@/types';

interface BrowserAddressBarProps {
  url?: string;
  status: BrowserViewStatus;
  viewportMode: ViewportMode;
  zoomLevel?: number;
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

/** Read-only viewer toolbar: live status, the agent's current URL, and display controls. */
export function BrowserAddressBar({
  url,
  status,
  viewportMode,
  zoomLevel = 100,
  onReconnect,
  onOpenExternal,
  onChangeViewport,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSetZoom,
}: BrowserAddressBarProps) {
  const [copied, setCopied] = useState(false);
  const isLive = status === 'live';

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="h-10 px-2.5 border-b border-ink/10 bg-paper flex items-center justify-between flex-shrink-0 select-none space-x-2">
      {/* Live status */}
      <div className="flex items-center space-x-1.5 flex-shrink-0" title={STATUS_LABEL[status]}>
        <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-success animate-pulse' : 'bg-ink/25'}`} />
        <span className="text-[10px] font-mono uppercase tracking-wide text-ink/60">{STATUS_LABEL[status]}</span>
      </div>

      {/* Current URL (read-only — the agent drives navigation) */}
      <div className="flex-1 min-w-0 flex items-center bg-canvas border border-ink/15 rounded-md px-2 py-0.5">
        <Globe size={12} className="text-ink/40 mr-1.5 flex-shrink-0" />
        <span className="w-full truncate text-ink/80 font-mono text-[11px]" title={url ?? ''}>
          {url || 'Agent belum membuka halaman'}
        </span>
      </div>

      {/* Display + stream controls */}
      <div className="flex items-center space-x-1.5 flex-shrink-0">
        <BrowserViewportSelector
          viewportMode={viewportMode}
          onChangeViewport={onChangeViewport}
          zoomLevel={zoomLevel}
          onSetZoom={onSetZoom}
        />

        <div className="flex items-center bg-canvas border border-ink/10 rounded-md p-0.5 space-x-0.5 text-xs font-mono">
          <button
            type="button"
            onClick={onZoomOut}
            disabled={zoomLevel <= 50}
            className="p-1 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink cursor-pointer disabled:cursor-not-allowed transition-colors"
            title="Zoom Out (-10%)"
          >
            <ZoomOut size={12} />
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            className="px-1 text-[10px] font-medium text-ink/75 hover:text-ink hover:underline cursor-pointer select-none"
            title="Reset Zoom (100%)"
          >
            {zoomLevel}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            disabled={zoomLevel >= 200}
            className="p-1 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink cursor-pointer disabled:cursor-not-allowed transition-colors"
            title="Zoom In (+10%)"
          >
            <ZoomIn size={12} />
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          disabled={!url}
          className="p-1.5 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink transition-colors cursor-pointer disabled:cursor-not-allowed"
          title={copied ? 'Copied URL!' : 'Copy URL'}
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>

        <button
          type="button"
          onClick={onReconnect}
          className="p-1.5 rounded hover:bg-ink/5 text-ink/70 hover:text-ink transition-colors cursor-pointer"
          title="Reconnect live view"
        >
          <RotateCw size={14} />
        </button>

        <button
          type="button"
          onClick={onOpenExternal}
          disabled={!url}
          className="p-1.5 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink transition-colors cursor-pointer disabled:cursor-not-allowed"
          title={url ? 'Open in new window' : 'No URL loaded'}
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}
