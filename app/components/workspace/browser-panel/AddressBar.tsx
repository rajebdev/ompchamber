import { useState } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  Home, 
  Globe, 
  ExternalLink, 
  Copy, 
  Check, 
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { BrowserViewportSelector } from '@/components/workspace/browser-panel/ViewportSelector';
import type { ViewportMode } from '@/types';

interface BrowserAddressBarProps {
  inputUrl: string;
  committedUrl: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewportMode: ViewportMode;
  zoomLevel?: number;
  onChangeInput: (url: string) => void;
  onSubmitUrl: (e?: React.FormEvent) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onOpenExternal: () => void;
  onChangeViewport: (mode: ViewportMode) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onSetZoom?: (zoom: number) => void;
}

export function BrowserAddressBar({
  inputUrl,
  committedUrl,
  isLoading,
  canGoBack,
  canGoForward,
  viewportMode,
  zoomLevel = 100,
  onChangeInput,
  onSubmitUrl,
  onGoBack,
  onGoForward,
  onReload,
  onHome,
  onOpenExternal,
  onChangeViewport,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSetZoom,
}: BrowserAddressBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textToCopy = committedUrl || inputUrl;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleClear = () => {
    onChangeInput('');
  };

  return (
    <div className="h-10 px-2.5 border-b border-ink/10 bg-paper flex items-center justify-between flex-shrink-0 select-none space-x-2">
      {/* Navigation Buttons: Back, Forward, Reload, Home */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        <button
          type="button"
          onClick={onGoBack}
          disabled={!canGoBack}
          className="p-1.5 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink transition-colors cursor-pointer disabled:cursor-not-allowed"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>

        <button
          type="button"
          onClick={onGoForward}
          disabled={!canGoForward}
          className="p-1.5 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink transition-colors cursor-pointer disabled:cursor-not-allowed"
          title="Forward"
        >
          <ArrowRight size={14} />
        </button>

        <button
          type="button"
          onClick={onReload}
          disabled={!committedUrl}
          className="p-1.5 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink transition-colors cursor-pointer disabled:cursor-not-allowed"
          title={committedUrl ? "Reload page" : "No page to reload"}
        >
          <RotateCw size={14} className={isLoading ? 'animate-spin text-ink' : ''} />
        </button>

        <button
          type="button"
          onClick={onHome}
          className="p-1.5 rounded hover:bg-ink/5 text-ink/70 hover:text-ink transition-colors cursor-pointer"
          title="Home (/)"
        >
          <Home size={14} />
        </button>
      </div>

      {/* Address Bar Form */}
      <form onSubmit={onSubmitUrl} className="flex-1 min-w-0 flex items-center">
        <div className="w-full flex items-center bg-canvas border border-ink/15 hover:border-ink/30 focus-within:border-ink/50 focus-within:ring-1 focus-within:ring-ink/20 rounded-md px-2 py-0.5 transition-all text-xs">
          <Globe size={12} className="text-ink/40 mr-1.5 flex-shrink-0" />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => onChangeInput(e.target.value)}
            placeholder="Enter URL or path (e.g. / or http://localhost:3000)..."
            className="w-full bg-transparent text-ink font-mono text-[11px] placeholder:text-ink/30 focus:outline-none"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
          {inputUrl && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 text-ink/40 hover:text-ink ml-1 rounded flex-shrink-0 cursor-pointer"
              title="Clear"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </form>

      {/* Viewport Presets & Action Buttons */}
      <div className="flex items-center space-x-1.5 flex-shrink-0">
        {/* Viewport Selector (Desktop 16:9, Mobile, Tablet, Dropdown) */}
        <BrowserViewportSelector
          viewportMode={viewportMode}
          onChangeViewport={onChangeViewport}
          zoomLevel={zoomLevel}
          onSetZoom={onSetZoom}
        />

        {/* Zoom In / Out Controls */}
        {onZoomIn && onZoomOut && (
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
        )}

        {/* Copy URL */}
        <button
          type="button"
          onClick={handleCopy}
          disabled={!committedUrl && !inputUrl}
          className="p-1.5 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink transition-colors cursor-pointer disabled:cursor-not-allowed"
          title={copied ? "Copied URL!" : "Copy URL"}
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>

        {/* Open in external tab */}
        <button
          type="button"
          onClick={onOpenExternal}
          disabled={!committedUrl}
          className="p-1.5 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink transition-colors cursor-pointer disabled:cursor-not-allowed"
          title={committedUrl ? "Open in new window" : "No URL loaded"}
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}
