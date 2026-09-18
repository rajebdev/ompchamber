import { useCallback } from 'preact/hooks';
import { UserBrowserAddressBar } from '@/client/components/workspace/user-browser-panel/AddressBar';
import { UserBrowserFrame } from '@/client/components/workspace/user-browser-panel/Frame';
import { useUserBrowser } from '@/client/hooks/browser/use-user-browser';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { emitBrowserPageContext } from '@/shared/lib/browser/page-context';
import type { ViewportMode } from '@/shared/types';

interface UserBrowserPanelProps {
  className?: string;
  /** False while the panel is hidden: pauses the iframe's live loading. */
  active?: boolean;
}

/**
 * The user's own browser: a plain iframe, so scrolling, clicking, typing, and
 * logins are the browser's native behaviour and cost nothing on our side.
 *
 * It is private to the user — the omp agent has no handle to this frame. Sites
 * that forbid embedding (Google, GitHub) show an empty frame; the toolbar's
 * open-in-new-tab action is the escape hatch for those.
 */
export function UserBrowserPanel({ className = '', active = true }: UserBrowserPanelProps) {
  const [viewportMode, setViewportMode] = useSessionState<ViewportMode>('userBrowser.viewportMode', 'responsive');
  const [zoomLevel, setZoomLevel] = useSessionState<number>('userBrowser.zoomLevel', 100);
  const {
    url,
    input,
    setInput,
    frameKey,
    loading,
    error,
    canGoBack,
    canGoForward,
    submit,
    goBack,
    goForward,
    reload,
    markLoaded,
  } = useUserBrowser();

  const handleOpenExternal = useCallback(() => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  const handleIncludeInChat = useCallback(() => {
    if (!url) return;
    emitBrowserPageContext({ url });
  }, [url]);

  return (
    <div className={`flex flex-col h-full w-full bg-paper text-ink overflow-hidden ${className}`}>
      <UserBrowserAddressBar
        url={url}
        input={input}
        loading={loading}
        error={error}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        viewportMode={viewportMode}
        zoomLevel={zoomLevel}
        onInputChange={setInput}
        onSubmit={submit}
        onBack={goBack}
        onForward={goForward}
        onReload={reload}
        onOpenExternal={handleOpenExternal}
        onIncludeInChat={handleIncludeInChat}
        onChangeViewport={setViewportMode}
        onZoomIn={() => setZoomLevel((prev) => Math.min(200, prev + 10))}
        onZoomOut={() => setZoomLevel((prev) => Math.max(50, prev - 10))}
        onResetZoom={() => setZoomLevel(100)}
        onSetZoom={setZoomLevel}
      />
      <UserBrowserFrame
        url={url}
        frameKey={frameKey}
        loading={loading}
        viewportMode={viewportMode}
        zoomLevel={zoomLevel}
        onLoad={markLoaded}
        active={active}
      />
    </div>
  );
}
