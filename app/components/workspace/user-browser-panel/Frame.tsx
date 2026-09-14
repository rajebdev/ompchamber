import { Globe, Loader2 } from 'lucide-react';
import { VIEWPORT_CLASSES } from '@/components/common/viewport';
import type { ViewportMode } from '@/types';

interface UserBrowserFrameProps {
  url: string;
  frameKey: number;
  loading: boolean;
  viewportMode: ViewportMode;
  zoomLevel: number;
  onLoad: () => void;
}

const ALLOW = 'clipboard-read; clipboard-write; fullscreen';

/**
 * The user's browsing surface: a plain iframe. Interaction (scroll, click,
 * typing, cookies, logins) is the browser's own, so this costs nothing to keep
 * mounted. Cross-origin pages cannot read this app, and vice versa.
 */
export function UserBrowserFrame({ url, frameKey, loading, viewportMode, zoomLevel, onLoad }: UserBrowserFrameProps) {
  if (!url) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-12 h-12 rounded-xl bg-ink/5 border border-ink/10 flex items-center justify-center text-ink/40 mb-3">
          <Globe size={22} />
        </div>
        <h3 className="text-sm font-semibold text-ink mb-1">Browser Anda</h3>
        <p className="text-xs text-ink/60 max-w-sm">
          Ketik alamat di atas lalu Enter. Halaman dimuat langsung di panel ini.
        </p>
        <p className="text-[11px] text-ink/45 max-w-sm mt-2">
          Sebagian situs (Google, GitHub) menolak ditampilkan dalam iframe — pakai tombol buka di tab baru.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 relative flex items-center justify-center p-2 overflow-auto bg-canvas/60">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-md bg-paper border border-ink/15">
            <Loader2 size={13} className="animate-spin text-ink/50" />
            <span className="text-[11px] font-mono text-ink/60">Memuat…</span>
          </div>
        </div>
      ) : null}
      <div
        className={`relative flex flex-col bg-white ${VIEWPORT_CLASSES[viewportMode]} transition-all duration-200`}
        style={{
          zoom: zoomLevel !== 100 ? `${zoomLevel}%` : undefined,
          transformOrigin: 'top center',
        }}
      >
        <iframe
          key={frameKey}
          src={url}
          title="Browser pengguna"
          onLoad={onLoad}
          referrerPolicy="no-referrer"
          allow={ALLOW}
          className="w-full h-full bg-white border-0"
        />
      </div>
    </div>
  );
}
