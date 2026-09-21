/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { Suspense, lazy } from 'preact/compat';
import { useSearchParams } from '@/client/lib/router/search-params';
import { DesktopLayout } from '@/client/components/layout/desktop-layout/index';
import { SessionStateProvider } from '@/client/components/common/session-state-provider';
import { SidebarDataProvider } from '@/client/hooks/chat/omp/session-list';

/**
 * The mobile and desktop layouts are mutually exclusive screen trees — exactly
 * one is mounted per load, and `initialIsMobile` is known before the first
 * render because the server injects it. Keeping the mobile tree out of the
 * initial bundle is therefore pure win for the desktop (the common case for a
 * developer console): its subtree moves to this async chunk and is fetched only
 * when a phone boots, or when the user switches layout by hand at runtime.
 *
 * `fallback={null}` is safe rather than a blank flash: `body` already paints
 * `--theme-canvas`, so the pre-hydration frame and the fallback look identical.
 */
const MobileLayoutWrapper = lazy(() =>
  import('@/client/components/mobile/LayoutWrapper').then((m) => ({ default: m.MobileLayoutWrapper }))
);

export interface AppProps {
  /** Server-detected mobile verdict, so the first paint needs no UA check. */
  initialIsMobile?: boolean;
  appSettings?: Record<string, unknown>;
}

export function App({ initialIsMobile = false, appSettings = {} }: AppProps) {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId') || '1';

  // Initialize with server-detected User-Agent to eliminate SSR flash. The
  // device decides the layout on every load — the manual switch below is
  // session-only, so opening the chamber on a phone never locks a desktop (or
  // vice versa) into the other layout on its next visit.
  const [isMobileMode, setIsMobileMode] = useState<boolean>(initialIsMobile);
  // Set the moment the user picks a layout by hand; while set, the viewport no
  // longer re-detects so their choice survives a resize.
  const manualOverrideRef = useRef(false);

  useEffect(() => {
    // Comprehensive multi-factor device & screen check
    const checkIsMobileDevice = () => {
      const isNarrow = window.innerWidth < 768;
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(navigator.userAgent);

      // On mobile devices in landscape mode, width might be 768-932px, but height is < 500px and it's a touch device
      const isMobileLandscape = isTouch && window.innerHeight < 550 && window.innerWidth < 1024;

      return isNarrow || isMobileUA || isMobileLandscape;
    };

    if (!manualOverrideRef.current) setIsMobileMode(checkIsMobileDevice());

    const handleResize = () => {
      if (!manualOverrideRef.current) {
        setIsMobileMode(checkIsMobileDevice());
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const handleSwitchToDesktop = () => {
    manualOverrideRef.current = true;
    setIsMobileMode(false);
  };

  const handleSwitchToMobile = () => {
    manualOverrideRef.current = true;
    setIsMobileMode(true);
  };

  if (isMobileMode) {
    return (
      <SessionStateProvider sessionId={sessionId}>
        <SidebarDataProvider>
          <Suspense fallback={null}>
            <MobileLayoutWrapper
              onDesktopToggle={handleSwitchToDesktop}
              appSettings={appSettings}
            />
          </Suspense>
        </SidebarDataProvider>
      </SessionStateProvider>
    );
  }

  return (
    <SessionStateProvider sessionId={sessionId}>
      <SidebarDataProvider>
        <DesktopLayout
          sessionId={sessionId}
          onSwitchToMobile={handleSwitchToMobile}
          appSettings={appSettings}
        />
      </SidebarDataProvider>
    </SessionStateProvider>
  );
}
