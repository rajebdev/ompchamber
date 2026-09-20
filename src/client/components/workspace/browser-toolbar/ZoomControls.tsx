import { ZoomIn, ZoomOut } from 'lucide-preact';

interface ZoomControlsProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

/**
 * The −/reset/+ zoom cluster shared by both browser address bars. Bounds match
 * the panels' own step logic (50% floor, 200% ceiling) so the buttons disable
 * exactly when the owning setter would stop moving.
 */
export function ZoomControls({ zoomLevel, onZoomIn, onZoomOut, onResetZoom }: ZoomControlsProps) {
  return (
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
  );
}
