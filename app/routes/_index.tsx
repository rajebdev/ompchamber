/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { json } from '@remix-run/node';
import type { MetaFunction, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import { getDb } from '@/db.server';
import { isMockMode } from '@/mock.server';
import { DesktopLayout } from '@/components/layout/desktop-layout/index';
import { MobileLayoutWrapper } from '@/components/mobile/LayoutWrapper';
import { SessionStateProvider } from '@/components/common/session-state-provider';
import { SidebarDataProvider } from '@/hooks/chat/omp/session-list';

export const meta: MetaFunction = () => {
  return [
    { title: "OMPChamber" },
    { property: "og:title", content: "OMPChamber" },
    { name: "description", content: "A light e-ink paper developer dashboard and AI Oh-My-Pi web view chamber for CI/CD deployments." },
    { property: "og:description", content: "A light e-ink paper developer dashboard and AI Oh-My-Pi web view chamber for CI/CD deployments." },
  ];
};

/**
 * SSR shell loader — deliberately cheap. Only data needed for the first
 * paint without a flash lives here: app settings (layout prefs, sort, access
 * mode) and the mobile User-Agent verdict. The folder/session list is heavy
 * (omp JSONL discovery + subagent scan) and is fetched client-side from
 * `GET /api/sessions/list` via `SidebarDataProvider`, rendering a skeleton
 * until the first payload lands.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const userAgent = request.headers.get('user-agent') || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(userAgent);

  const mock = isMockMode();
  const db = await getDb();

  // Fetch app settings
  let appSettings: Record<string, unknown> = {};
  try {
    const settingsRows = await db.all('SELECT * FROM app_settings');
    for (const row of settingsRows) {
      try {
        appSettings[row.key] = JSON.parse(row.value);
      } catch {
        appSettings[row.key] = row.value;
      }
    }
  } catch {
    // app_settings table might not exist yet if just created
  }

  return json({
    initialIsMobile: isMobileUA,
    appSettings,
    isMock: mock,
  });
}

export default function App() {
  const { initialIsMobile, appSettings } = useLoaderData<typeof loader>();
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
          <MobileLayoutWrapper
            onDesktopToggle={handleSwitchToDesktop}
            appSettings={appSettings}
          />
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
