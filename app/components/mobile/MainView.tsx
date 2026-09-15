import { useMemo, useState } from 'react';
import type { WorkspaceFolderData } from '@/types';
import { MobileHeader } from '@/components/mobile/mobile-main-view/Header';
import { ChatTimeline } from '@/components/workspace/chat-timeline/index';

interface MobileMainViewProps {
  folders: WorkspaceFolderData[];
  activeSessionId: number | string | null;
  onSelectSession: (id: number | string) => void;
  onNewSession: () => void;
  onOpenSessionSidebar: () => void;
  onOpenRightSidebar: () => void;
  appSettings?: Record<string, any>;
}

/**
 * Mobile chat screen: the mobile header (sessions drawer, session picker,
 * telemetry, right panel) stacked over the shared ChatTimeline in its `mobile`
 * variant. Running the same timeline component as desktop is what gives the
 * phone the live omp agent bridge, queue/steering, subagent transcripts, ask
 * dialogs and undo/retry — the previous mobile-only reimplementation had none
 * of those.
 */
export function MobileMainView({
  folders,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onOpenSessionSidebar,
  onOpenRightSidebar,
  appSettings = {},
}: MobileMainViewProps) {
  // Title reported by the timeline: the live omp title, the pending-session
  // placeholder, or an optimistic rename. Null until the session loads.
  const [liveTitle, setLiveTitle] = useState<string | null>(null);

  const folderTitle = useMemo(() => {
    if (!activeSessionId) return 'New session';
    for (const f of folders) {
      const found = f.sessions?.find(s => String(s.id) === String(activeSessionId));
      if (found) return found.title;
    }
    return null;
  }, [activeSessionId, folders]);

  const activeSessionTitle = liveTitle || folderTitle || 'New session';

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-ink relative">
      <MobileHeader
        activeSessionTitle={activeSessionTitle}
        activeSessionId={activeSessionId}
        folders={folders}
        onOpenSessionSidebar={onOpenSessionSidebar}
        onOpenRightSidebar={onOpenRightSidebar}
        onNewSession={onNewSession}
        onSelectSession={onSelectSession}
      />

      <div className="flex-1 min-h-0">
        <ChatTimeline
          folders={folders}
          appSettings={appSettings}
          onSessionTitle={setLiveTitle}
          variant="mobile"
        />
      </div>
    </div>
  );
}
