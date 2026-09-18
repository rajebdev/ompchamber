import { Globe, Loader2, Radio } from 'lucide-preact';
import { ActivityToasts } from '@/client/components/workspace/browser-panel/ActivityToasts';
import { VIEWPORT_CLASSES } from '@/client/components/common/viewport';
import type { BrowserPanelAction, BrowserTabInfo, BrowserViewStatus, ViewportMode } from '@/shared/types';

interface BrowserScreencastProps {
  status: BrowserViewStatus;
  url?: string;
  tabs: BrowserTabInfo[];
  targetId?: string;
  frameSrc?: string;
  actions: BrowserPanelAction[];
  onSelectTarget: (targetId: string) => void;
  viewportMode: ViewportMode;
  zoomLevel: number;
}

const OFFLINE_COPY: Record<Exclude<BrowserViewStatus, 'live'>, { title: string; body: string }> = {
  'agent-offline': {
    title: 'Agent belum berjalan',
    body: 'Aktifkan sesi ini agar browser bisa dikendalikan agent.',
  },
  'browser-offline': {
    title: 'Belum ada browser aktif',
    body: 'Minta agent membuka sebuah halaman; tampilan live akan muncul di sini.',
  },
  'no-tab': {
    title: 'Browser aktif, belum ada tab',
    body: 'Sesi ini belum membuka tab di browser bersama.',
  },
};

export function BrowserScreencast({
  status,
  url,
  tabs,
  targetId,
  frameSrc,
  actions,
  onSelectTarget,
  viewportMode,
  zoomLevel,
}: BrowserScreencastProps) {
  const isLive = status === 'live';
  const offline = isLive ? null : OFFLINE_COPY[status];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas/60 relative overflow-hidden">
      <ActivityToasts actions={actions} />
      {/* Tab strip: only useful when the session owns more than one page. */}
      {isLive && tabs.length > 1 && (
        <div className="px-2 py-1 border-b border-ink/10 bg-paper flex items-center gap-1 overflow-x-auto flex-shrink-0">
          {tabs.map((tab) => {
            const active = tab.targetId === targetId;
            return (
              <button
                key={tab.targetId}
                type="button"
                onClick={() => onSelectTarget(active ? '' : tab.targetId)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono max-w-[220px] truncate border transition-colors cursor-pointer ${
                  active
                    ? 'bg-ink text-canvas border-ink'
                    : 'bg-paper text-ink/70 border-ink/15 hover:border-ink/35 hover:text-ink'
                }`}
                title={tab.url || tab.title || tab.targetId}
              >
                {tab.title || tab.url || tab.targetId}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-auto">
        {isLive ? (
          <div
            className={`relative flex flex-col bg-paper ${VIEWPORT_CLASSES[viewportMode]} transition-all duration-200`}
            style={{
              zoom: zoomLevel !== 100 ? `${zoomLevel}%` : undefined,
              transformOrigin: 'top center',
            }}
          >
            {frameSrc ? (
              <img
                src={frameSrc}
                alt={url || 'Live browser view'}
                className="w-full h-full object-contain bg-paper"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 select-none">
                <Loader2 size={20} className="animate-spin text-ink/40 mb-2" />
                <p className="text-xs text-ink/60">Menunggu frame pertama dari browser…</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none my-auto">
            <div className="w-12 h-12 rounded-xl bg-ink/5 border border-ink/10 flex items-center justify-center text-ink/40 mb-3">
              {status === 'agent-offline' ? <Radio size={24} /> : <Globe size={24} />}
            </div>
            <h3 className="text-sm font-semibold text-ink mb-1">{offline?.title}</h3>
            <p className="text-xs text-ink/60 max-w-sm">{offline?.body}</p>
          </div>
        )}
      </div>
    </div>
  );
}
