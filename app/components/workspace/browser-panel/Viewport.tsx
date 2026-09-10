import { useState, useEffect } from 'react';
import { ExternalLink, Globe, ShieldAlert } from 'lucide-react';
import type { ViewportMode } from '@/types';

interface BrowserViewportProps {
  url: string;
  reloadKey: number;
  isLoading: boolean;
  onLoad: () => void;
  viewportMode: ViewportMode;
  zoomLevel?: number;
  onSelectQuickLink: (url: string) => void;
  onOpenExternal: () => void;
}

export function BrowserViewport({
  url,
  reloadKey,
  isLoading,
  onLoad,
  viewportMode,
  zoomLevel = 100,
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

  // Viewport width & aspect constraints
  const getViewportClasses = () => {
    switch (viewportMode) {
      case 'desktop-16-9':
        // Auto height following width with 16:9 aspect ratio
        return 'w-full max-w-[1280px] aspect-video max-h-full border border-ink/20 rounded-lg shadow-md overflow-hidden my-auto';
      case 'laptop':
        return 'w-[1024px] max-w-full h-[768px] max-h-full border border-ink/20 rounded-lg shadow-md overflow-hidden my-auto';
      case 'tablet':
        return 'w-[768px] max-w-full h-[1024px] max-h-full border border-ink/20 rounded-lg shadow-md overflow-hidden my-auto';
      case 'mobile':
        return 'w-[375px] max-w-full h-[667px] max-h-full border border-ink/20 rounded-xl shadow-md overflow-hidden my-auto';
      case 'mobile-lg':
        return 'w-[414px] max-w-full h-[896px] max-h-full border border-ink/20 rounded-xl shadow-md overflow-hidden my-auto';
      case 'responsive':
      default:
        return 'w-full h-full border-0';
    }
  };

  const isExternal = Boolean(url && (url.startsWith('http://') || url.startsWith('https://')));
  const isGoogleOrRestricted = Boolean(url && /google\.|youtube\.|github\.com|twitter\.com|x\.com|facebook\.com/i.test(url));

  const getDomainName = (targetUrl: string) => {
    try {
      const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
      return parsed.hostname;
    } catch {
      return targetUrl;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas/60 relative overflow-hidden">
      {/* Top Animated Loading Bar */}
      {isLoading && (
        <div className="h-0.5 w-full bg-ink/10 overflow-hidden absolute top-0 left-0 z-20">
          <div className="h-full bg-ink animate-pulse w-2/3" />
        </div>
      )}

      {/* Frame security warning for sites that block embedding */}
      {url && (isGoogleOrRestricted || (loadTimeout && isExternal)) && (
        <div className="px-3 py-2 bg-warning/10 border-b border-warning/20 flex items-center justify-between text-xs text-ink/85 z-10 flex-shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            <ShieldAlert size={14} className="text-warning flex-shrink-0" />
            <span className="text-[11px] leading-tight truncate">
              {isGoogleOrRestricted ? (
                <>
                  <span className="font-semibold">{getDomainName(url)}</span> memblokir embedding iframe (kebijakan <code>X-Frame-Options</code>).
                </>
              ) : (
                <>Situs eksternal ini mungkin memblokir tampilan iframe melalui header keamanan.</>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenExternal}
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-ink text-canvas hover:opacity-90 text-[11px] font-mono font-medium flex-shrink-0 ml-2 cursor-pointer"
          >
            <span>Buka Tab Baru</span>
            <ExternalLink size={10} />
          </button>
        </div>
      )}

      {/* Main Viewport Container */}
      <div className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-auto">
        {!url ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none my-auto">
            <div className="w-12 h-12 rounded-xl bg-ink/5 border border-ink/10 flex items-center justify-center text-ink/40 mb-3">
              <Globe size={24} />
            </div>
            <h3 className="text-sm font-semibold text-ink mb-1">Browser Siap Digunakan</h3>
            <p className="text-xs text-ink/60 max-w-sm mb-4">
              Address URL kosong. Ketik URL di address bar atas atau pilih jalan pintas cepat berikut:
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-md">
              <button
                type="button"
                onClick={() => onSelectQuickLink('/')}
                className="px-2.5 py-1 rounded text-xs font-mono bg-paper border border-ink/15 hover:border-ink/30 text-ink transition-colors cursor-pointer"
              >
                / (Aplikasi OMP)
              </button>
              <button
                type="button"
                onClick={() => onSelectQuickLink('/api/models')}
                className="px-2.5 py-1 rounded text-xs font-mono bg-paper border border-ink/15 hover:border-ink/30 text-ink transition-colors cursor-pointer"
              >
                /api/models
              </button>
              <button
                type="button"
                onClick={() => onSelectQuickLink('/api/telemetry/tokens')}
                className="px-2.5 py-1 rounded text-xs font-mono bg-paper border border-ink/15 hover:border-ink/30 text-ink transition-colors cursor-pointer"
              >
                /api/telemetry/tokens
              </button>
            </div>
          </div>
        ) : (
          <div 
            className={`relative flex flex-col bg-white ${getViewportClasses()} transition-all duration-200`}
            style={{
              zoom: zoomLevel !== 100 ? `${zoomLevel}%` : undefined,
              transformOrigin: 'top center',
            }}
          >
            <iframe
              key={`${url}-${reloadKey}`}
              src={url}
              title="OMPChamber Browser View"
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              onLoad={onLoad}
            />
          </div>
        )}
      </div>
    </div>
  );
}
