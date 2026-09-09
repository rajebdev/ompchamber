import { useState, useEffect } from 'react';
import { ExternalLink, AlertCircle, Sparkles } from 'lucide-react';

interface BrowserViewportProps {
  url: string;
  reloadKey: number;
  isLoading: boolean;
  onLoad: () => void;
  viewportMode: 'responsive' | 'tablet' | 'mobile';
  onSelectQuickLink: (url: string) => void;
  onOpenExternal: () => void;
}

export function BrowserViewport({
  url,
  reloadKey,
  isLoading,
  onLoad,
  viewportMode,
  onSelectQuickLink,
  onOpenExternal,
}: BrowserViewportProps) {
  const [loadTimeout, setLoadTimeout] = useState(false);

  // If loading takes > 8s, display helpful hint in case iframe is blocked by X-Frame-Options
  useEffect(() => {
    setLoadTimeout(false);
    if (!isLoading) return;
    const timer = setTimeout(() => {
      setLoadTimeout(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [isLoading, url, reloadKey]);

  // Viewport width constraints
  const getViewportClasses = () => {
    switch (viewportMode) {
      case 'mobile':
        return 'w-[375px] max-w-full h-[667px] max-h-full border border-ink/20 rounded-xl shadow-md overflow-hidden my-auto';
      case 'tablet':
        return 'w-[768px] max-w-full h-[1024px] max-h-full border border-ink/20 rounded-lg shadow-md overflow-hidden my-auto';
      default:
        return 'w-full h-full border-0';
    }
  };

  const isExternal = url.startsWith('http://') || url.startsWith('https://');

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas/60 relative overflow-hidden">
      {/* Top Animated Loading Bar */}
      {isLoading && (
        <div className="h-0.5 w-full bg-ink/10 overflow-hidden absolute top-0 left-0 z-20">
          <div className="h-full bg-ink animate-pulse w-2/3" />
        </div>
      )}

      {/* Main Viewport Container */}
      <div className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-auto">
        <div className={`relative flex flex-col bg-white ${getViewportClasses()} transition-all duration-200`}>
          <iframe
            key={`${url}-${reloadKey}`}
            src={url}
            title="OMPChamber Browser View"
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            onLoad={onLoad}
          />
        </div>
      </div>

      {/* Frame security / Timeout banner (helpful for external sites with X-Frame-Options) */}
      {loadTimeout && isExternal && (
        <div className="px-3 py-1.5 bg-warning/10 border-t border-warning/20 flex items-center justify-between text-xs text-ink/80 z-10">
          <div className="flex items-center space-x-2 min-w-0">
            <AlertCircle size={13} className="text-warning flex-shrink-0" />
            <span className="truncate text-[11px]">
              Some external websites block iframe embedding via security headers.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenExternal}
            className="flex items-center space-x-1 text-[11px] font-semibold text-ink underline hover:opacity-80 flex-shrink-0 ml-2 cursor-pointer"
          >
            <span>Open in Tab</span>
            <ExternalLink size={11} />
          </button>
        </div>
      )}

      {/* Bottom Browser Status Bar & Quick Links */}
      <div className="h-7 px-3 border-t border-ink/10 bg-paper flex items-center justify-between flex-shrink-0 text-[11px] text-ink/60 select-none">
        {/* Quick Links */}
        <div className="flex items-center space-x-1.5 min-w-0 overflow-x-auto no-scrollbar">
          <span className="flex items-center text-[10px] text-ink/40 font-mono uppercase tracking-wider flex-shrink-0">
            <Sparkles size={10} className="mr-1 text-ink/40" />
            Quick:
          </span>
          <button
            type="button"
            onClick={() => onSelectQuickLink('/')}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-ink/5 hover:bg-ink/10 text-ink transition-colors flex-shrink-0 cursor-pointer"
            title="Preview current web application"
          >
            / (App)
          </button>
          <button
            type="button"
            onClick={() => onSelectQuickLink('/api/models')}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-ink/5 hover:bg-ink/10 text-ink transition-colors flex-shrink-0 cursor-pointer"
            title="Preview Models API"
          >
            /api/models
          </button>
          <button
            type="button"
            onClick={() => onSelectQuickLink('/api/telemetry/tokens')}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-ink/5 hover:bg-ink/10 text-ink transition-colors flex-shrink-0 cursor-pointer"
            title="Preview Telemetry Tokens"
          >
            /api/telemetry/tokens
          </button>
        </div>

        {/* Viewport Info / Status Indicator */}
        <div className="flex items-center space-x-2 flex-shrink-0 font-mono text-[10px] text-ink/50 ml-2">
          <span className="flex items-center space-x-1">
            <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-warning animate-ping' : 'bg-success'}`} />
            <span>{isLoading ? 'loading...' : 'ready'}</span>
          </span>
          <span>•</span>
          <span className="uppercase">
            {viewportMode === 'responsive' ? '100% full' : viewportMode}
          </span>
        </div>
      </div>
    </div>
  );
}
