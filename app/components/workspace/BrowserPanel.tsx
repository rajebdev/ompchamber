import { useState, useCallback } from 'react';
import { BrowserAddressBar } from '@/components/workspace/browser-panel/BrowserAddressBar';
import { BrowserViewport } from '@/components/workspace/browser-panel/BrowserViewport';

interface BrowserPanelProps {
  className?: string;
  defaultUrl?: string;
}

export function BrowserPanel({
  className = '',
  defaultUrl = '/'
}: BrowserPanelProps) {
  const [history, setHistory] = useState<string[]>([defaultUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [inputUrl, setInputUrl] = useState(defaultUrl);
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [viewportMode, setViewportMode] = useState<'responsive' | 'tablet' | 'mobile'>('responsive');

  const currentUrl = history[historyIndex] || defaultUrl;

  const normalizeUrl = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return '/';
    if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
      return trimmed;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    if (/^(localhost|127\.0\.0\.1)(:\d+)?/i.test(trimmed)) {
      return `http://${trimmed}`;
    }
    return `https://${trimmed}`;
  };

  const navigateTo = useCallback((target: string) => {
    const nextUrl = normalizeUrl(target);
    setIsLoading(true);
    setInputUrl(nextUrl);
    setHistory(prev => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, nextUrl];
    });
    setHistoryIndex(prev => prev + 1);
    setReloadKey(k => k + 1);
  }, [historyIndex]);

  const handleSubmitUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    navigateTo(inputUrl);
  };

  const handleGoBack = () => {
    if (historyIndex > 0) {
      const prevUrl = history[historyIndex - 1];
      setHistoryIndex(prev => prev - 1);
      setInputUrl(prevUrl);
      setIsLoading(true);
      setReloadKey(k => k + 1);
    }
  };

  const handleGoForward = () => {
    if (historyIndex < history.length - 1) {
      const nextUrl = history[historyIndex + 1];
      setHistoryIndex(prev => prev + 1);
      setInputUrl(nextUrl);
      setIsLoading(true);
      setReloadKey(k => k + 1);
    }
  };

  const handleReload = () => {
    setIsLoading(true);
    setReloadKey(k => k + 1);
  };

  const handleHome = () => {
    navigateTo('/');
  };

  const handleOpenExternal = () => {
    const target = currentUrl.startsWith('/') && typeof window !== 'undefined'
      ? `${window.location.origin}${currentUrl}`
      : currentUrl;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  return (
    <div className={`flex flex-col h-full w-full bg-paper text-ink overflow-hidden select-none ${className}`}>
      {/* Address Bar with Navigation Controls and Reload */}
      <BrowserAddressBar
        inputUrl={inputUrl}
        committedUrl={currentUrl}
        isLoading={isLoading}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < history.length - 1}
        viewportMode={viewportMode}
        onChangeInput={setInputUrl}
        onSubmitUrl={handleSubmitUrl}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
        onHome={handleHome}
        onOpenExternal={handleOpenExternal}
        onChangeViewport={setViewportMode}
      />

      {/* Browser Viewport with Iframe & Status Footer */}
      <BrowserViewport
        url={currentUrl}
        reloadKey={reloadKey}
        isLoading={isLoading}
        onLoad={handleIframeLoad}
        viewportMode={viewportMode}
        onSelectQuickLink={navigateTo}
        onOpenExternal={handleOpenExternal}
      />
    </div>
  );
}
