/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { json } from '@remix-run/node';
import type { MetaFunction, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import { getDb } from '@/db.server';
import { isMockMode } from '@/mock.server';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { MobileLayoutWrapper } from '@/components/mobile/MobileLayoutWrapper';
import type { WorkspaceFolderData } from '@/types';

export const meta: MetaFunction = () => {
  return [
    { title: "OMPChamber" },
    { property: "og:title", content: "OMPChamber" },
    { name: "description", content: "A light e-ink paper developer dashboard and AI Oh-My-Pi web view chamber for CI/CD deployments." },
    { property: "og:description", content: "A light e-ink paper developer dashboard and AI Oh-My-Pi web view chamber for CI/CD deployments." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const userAgent = request.headers.get('user-agent') || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(userAgent);

  const db = await getDb();
  const folders = await db.all('SELECT * FROM workspace_folders ORDER BY id ASC');
  const sessions = await db.all('SELECT * FROM sessions ORDER BY id ASC');
  
  // Fetch app settings
  let appSettings: Record<string, any> = {};
  try {
    const settingsRows = await db.all('SELECT * FROM app_settings');
    for (const row of settingsRows) {
      try {
        appSettings[row.key] = JSON.parse(row.value);
      } catch (e) {
        appSettings[row.key] = row.value;
      }
    }
  } catch (e) {
    // app_settings table might not exist yet if just created
  }

  const groupedFolders: WorkspaceFolderData[] = folders.map(folder => {
    const folderSessions = sessions.filter(s => s.folder_id === folder.id).map(s => {
      let queue_list;
      try { queue_list = JSON.parse(s.queue_list); } catch (e) { queue_list = []; }
      return { ...s, queue_list };
    });
    return {
      id: folder.id,
      name: folder.name,
      isExpanded: folder.is_expanded === 1,
      sessions: folderSessions,
      hasMore: folderSessions.length > 7,
      totalSessions: folderSessions.length
    };
  });

  return json({ 
    folders: groupedFolders,
    initialIsMobile: isMobileUA,
    appSettings,
    isMock: isMockMode(),
  });
}

export default function App() {
  const { folders, initialIsMobile, appSettings } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  // Initialize with server-detected User-Agent to eliminate SSR flash
  const [isMobileMode, setIsMobileMode] = useState<boolean>(
    appSettings.omp_view_mode === 'mobile' ? true :
    appSettings.omp_view_mode === 'desktop' ? false :
    initialIsMobile
  );

  useEffect(() => {
    // 1. Check if user has an explicit manual preference in SQLite settings
    const savedPreference = appSettings.omp_view_mode || localStorage.getItem('omp_view_mode');
    
    // 2. Comprehensive multi-factor device & screen check
    const checkIsMobileDevice = () => {
      const isNarrow = window.innerWidth < 768;
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(navigator.userAgent);
      
      // On mobile devices in landscape mode, width might be 768-932px, but height is < 500px and it's a touch device
      const isMobileLandscape = isTouch && window.innerHeight < 550 && window.innerWidth < 1024;
      
      return isNarrow || isMobileUA || isMobileLandscape;
    };

    if (savedPreference === 'desktop') {
      setIsMobileMode(false);
    } else if (savedPreference === 'mobile') {
      setIsMobileMode(true);
    } else {
      setIsMobileMode(checkIsMobileDevice());
    }

    const handleResize = () => {
      const currentPref = localStorage.getItem('omp_view_mode');
      if (!currentPref) {
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

  const saveSetting = (key: string, value: any) => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    }).catch(console.error);
  };

  const handleSwitchToDesktop = () => {
    localStorage.setItem('omp_view_mode', 'desktop');
    saveSetting('omp_view_mode', 'desktop');
    setIsMobileMode(false);
  };

  const handleSwitchToMobile = () => {
    localStorage.setItem('omp_view_mode', 'mobile');
    saveSetting('omp_view_mode', 'mobile');
    setIsMobileMode(true);
  };

  if (isMobileMode) {
    return (
      <MobileLayoutWrapper 
        folders={folders} 
        onDesktopToggle={handleSwitchToDesktop}
        appSettings={appSettings}
      />
    );
  }

  return (
    <DesktopLayout 
      folders={folders} 
      sessionId={sessionId} 
      onSwitchToMobile={handleSwitchToMobile} 
      appSettings={appSettings}
    />
  );
}
