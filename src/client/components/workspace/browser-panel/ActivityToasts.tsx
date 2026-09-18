import { Camera, CheckCircle2, CornerDownLeft, Globe, Hourglass, MousePointerClick, MoveVertical, Send, Type, Upload, XCircle, type LucideIcon } from 'lucide-preact';
import type { BrowserActionKind, BrowserPanelAction } from '@/shared/types';

const ICONS: Record<BrowserActionKind, LucideIcon> = {
  open: Globe,
  navigate: Globe,
  loaded: CheckCircle2,
  click: MousePointerClick,
  type: Type,
  press: CornerDownLeft,
  submit: Send,
  wait: Hourglass,
  screenshot: Camera,
  scroll: MoveVertical,
  upload: Upload,
  close: XCircle,
  error: XCircle,
};

interface ActivityToastsProps {
  actions: BrowserPanelAction[];
}

/** Transient activity toasts overlaid on the screencast. */
export function ActivityToasts({ actions }: ActivityToastsProps) {
  if (actions.length === 0) return null;
  return (
    <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none max-w-[320px]">
      {actions.map((action) => {
        const Icon = ICONS[action.kind];
        const isError = action.kind === 'error';
        return (
          <div
            key={action.id}
            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur-sm ${
              isError ? 'border-error/30 bg-error/10 text-error' : 'border-ink/15 bg-paper/95 text-ink'
            }`}
          >
            <Icon size={12} className={`flex-shrink-0 ${isError ? 'text-error' : 'text-ink/60'}`} />
            <span className="truncate">{action.label}</span>
          </div>
        );
      })}
    </div>
  );
}
