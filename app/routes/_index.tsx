/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { json } from '@remix-run/node';
import type { MetaFunction, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import { getDb } from '@/db.server';
import { isMockMode } from '@/mock.server';
import { DesktopLayout } from '@/components/layout/DesktopLayout';
import { MobileLayoutWrapper } from '@/components/mobile/MobileLayoutWrapper';
import type { WorkspaceFolderData } from '@/types';
import type { OmpSession } from '@/types/omp';

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

  const mock = isMockMode();
  const db = await getDb();
  const folderRows = await db.all('SELECT * FROM workspace_folders ORDER BY id ASC');

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

  const groupedFolders: WorkspaceFolderData[] = [];
  if (mock) {
    // Demo mode: sessions come from the SQLite `sessions` table.
    const sessions = await db.all('SELECT * FROM sessions ORDER BY id ASC');
    for (const folder of folderRows) {
      const folderSessions = sessions
        .filter((s: any) => String(s.folder_id) === String(folder.id))
        .map((s: any) => {
          let queue_list;
          try { queue_list = JSON.parse(s.queue_list); } catch (e) { queue_list = []; }
          return { ...s, queue_list };
        });
      groupedFolders.push({
        id: folder.id,
        name: folder.name,
        project_path: folder.project_path ?? null,
        isPinned: folder.is_pinned === 1,
        isExpanded: folder.is_expanded === 1,
        sessions: folderSessions,
        hasMore: folderSessions.length > 7,
        totalSessions: folderSessions.length,
      });
    }
  } else {
    // Real mode: workspace folders are bound to omp projects via project_path;
    // the session items under each folder come from the omp JSONL discovery.
    groupedFolders.push(...(await buildRealFolders(folderRows)));
  }

  return json({
    folders: groupedFolders,
    initialIsMobile: isMobileUA,
    appSettings,
    isMock: mock,
  });
}

/**
 * Real-mode folder assembly: run the omp discovery scan once and bucket the
 * discovered sessions under each folder whose project_path matches the
 * session's resolved project root. Folders without a project_path render with
 * no omp sessions (a local/empty workspace).
 */
async function buildRealFolders(folderRows: any[]): Promise<WorkspaceFolderData[]> {
  const { loadOmpSidebarData } = await import('@/lib/omp/session-reader');
  const { sessionTitleFor, groupSessionsByRoot } = await import('@/lib/omp/sidebar-adapter');

  const data = await loadOmpSidebarData();
  const sessionsByRoot = groupSessionsByRoot(data.sessions);

  return folderRows.map((folder: any) => {
    const root = (folder.project_path as string | null) ?? '';
    const rootSessions: OmpSession[] = root ? sessionsByRoot.get(root) ?? [] : [];
    const folderSessions = rootSessions.map((session: OmpSession) => ({
      id: session.id,
      folder_id: folder.id,
      title: sessionTitleFor(session),
      created_at: session.created,
      updated_at: session.modified,
      is_active: 0,
    }));
    return {
      id: folder.id,
      name: folder.name,
      project_path: folder.project_path ?? null,
      isPinned: folder.is_pinned === 1,
      isExpanded: folder.is_expanded === 1,
      sessions: folderSessions,
      hasMore: folderSessions.length > 7,
      totalSessions: folderSessions.length,
    };
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
