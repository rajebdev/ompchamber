import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Globe, MessageSquarePlus, RefreshCw, ZoomIn, ZoomOut } from 'lucide-preact';
import { BrowserViewportSelector } from '@/client/components/common/ViewportSelector';
import type { ViewportMode } from '@/shared/types';

interface UserBrowserAddressBarProps {
  url: string;
  input: string;
  loading: boolean;
  error?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  viewportMode: ViewportMode;
  zoomLevel: number;
  onInputChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onOpenExternal: () => void;
  onIncludeInChat: () => void;
  onChangeViewport: (mode: ViewportMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onSetZoom: (zoom: number) => void;
}

type UserBrowserPhase = 'idle' | 'loading' | 'ready';

const PHASE_LABEL: Record<UserBrowserPhase, string> = {
  idle: 'Kosong',
  loading: 'Memuat',
  ready: 'Siap',
};

const ICON_BUTTON =
  'p-1.5 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink transition-colors cursor-pointer disabled:cursor-not-allowed';

const NAV_BUTTON =
  'p-1 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink cursor-pointer disabled:cursor-not-allowed transition-colors';

/** Toolbar for the user's iframe browser: status, history, address, and display controls. */
export function UserBrowserAddressBar({
  url,
  input,
  loading,
  error,
  canGoBack,
  canGoForward,
  viewportMode,
  zoomLevel,
  onInputChange,
  onSubmit,
  onBack,
  onForward,
  onReload,
  onOpenExternal,
  onIncludeInChat,
  onChangeViewport,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSetZoom,
}: UserBrowserAddressBarProps) {
  const [included, setIncluded] = useState(false);
  const [copied, setCopied] = useState(false);
  const followedRef = useRef<string | undefined>(undefined);

  // Mirror the loaded URL into the field, but never overwrite active typing.
  useEffect(() => {
    if (followedRef.current === url) return;
    followedRef.current = url;
    if (url) onInputChange(url);
  }, [url, onInputChange]);

  const handleInclude = (): void => {
    onIncludeInChat();
    setIncluded(true);
    setTimeout(() => setIncluded(false), 2500);
  };

  const handleCopy = (): void => {
    if (!url) return;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const phase: UserBrowserPhase = !url ? 'idle' : loading ? 'loading' : 'ready';
  const dotClass =
    phase === 'ready' ? 'bg-success animate-pulse' : phase === 'loading' ? 'bg-ink/40 animate-pulse' : 'bg-ink/25';

  return (
    <div className="h-10 px-2.5 border-b border-ink/10 bg-paper flex items-center justify-between flex-shrink-0 select-none space-x-2">
      <div className="flex items-center space-x-1.5 flex-shrink-0" title={PHASE_LABEL[phase]}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className="text-[10px] font-mono uppercase tracking-wide text-ink/60">{PHASE_LABEL[phase]}</span>
      </div>

      <div className="flex items-center bg-canvas border border-ink/10 rounded-md p-0.5 space-x-0.5 flex-shrink-0">
        <button type="button" onClick={onBack} disabled={!canGoBack} aria-label="Kembali" title="Kembali" className={NAV_BUTTON}>
          <ArrowLeft size={12} />
        </button>
        <button type="button" onClick={onForward} disabled={!canGoForward} aria-label="Maju" title="Maju" className={NAV_BUTTON}>
          <ArrowRight size={12} />
        </button>
        <button type="button" onClick={onReload} disabled={!url} aria-label="Muat ulang" title="Muat ulang" className={NAV_BUTTON}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>

      <form
        className={`flex-1 min-w-0 flex items-center bg-canvas border rounded-md px-2 py-0.5 space-x-1 focus-within:border-ink/40 ${error ? 'border-error' : 'border-ink/15'}`}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(input);
        }}
      >
        <Globe size={12} className="text-ink/40 flex-shrink-0" />
        <input
          type="text"
          value={input}
          onChange={(event) => onInputChange(event.currentTarget.value)}
          placeholder="Ketik alamat (mis. localhost:5173) lalu Enter…"
          aria-label="Alamat browser pengguna"
          aria-invalid={error !== undefined && error !== null}
          title={error ?? undefined}
          spellcheck={false}
          autoComplete="off"
          className={`w-full min-w-0 bg-transparent outline-none font-mono text-[11px] placeholder:text-ink/30 ${error ? 'text-error' : 'text-ink/90'}`}
        />
      </form>

      <div className="flex items-center space-x-1.5 flex-shrink-0">
        <BrowserViewportSelector
          viewportMode={viewportMode}
          onChangeViewport={onChangeViewport}
          zoomLevel={zoomLevel}
          onSetZoom={onSetZoom}
        />

        <div className="flex items-center bg-canvas border border-ink/10 rounded-md p-0.5 space-x-0.5 text-xs font-mono">
          <button
            type="button"
            onClick={onZoomOut}
            disabled={zoomLevel <= 50}
            aria-label="Perkecil tampilan"
            title="Zoom Out (-10%)"
            className="p-1 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <ZoomOut size={12} />
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            className="px-1 text-[10px] font-medium text-ink/75 hover:text-ink hover:underline cursor-pointer select-none"
            title="Reset Zoom (100%)"
          >
            {zoomLevel}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            disabled={zoomLevel >= 200}
            aria-label="Perbesar tampilan"
            title="Zoom In (+10%)"
            className="p-1 rounded hover:bg-ink/5 disabled:opacity-25 disabled:hover:bg-transparent text-ink/70 hover:text-ink cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <ZoomIn size={12} />
          </button>
        </div>

        <button
          type="button"
          onClick={handleInclude}
          disabled={!url}
          aria-label="Sertakan halaman ini di draft chat"
          title={included ? 'Konteks halaman ditambahkan ke draft' : 'Sertakan halaman ini di draft chat'}
          className={ICON_BUTTON}
        >
          {included ? <Check size={14} className="text-success" /> : <MessageSquarePlus size={14} />}
        </button>

        <button
          type="button"
          onClick={handleCopy}
          disabled={!url}
          aria-label="Salin URL"
          title={copied ? 'Copied URL!' : 'Copy URL'}
          className={ICON_BUTTON}
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>

        <button
          type="button"
          onClick={onOpenExternal}
          disabled={!url}
          aria-label="Buka di tab baru"
          title="Buka di tab baru (untuk situs yang menolak iframe)"
          className={ICON_BUTTON}
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}
