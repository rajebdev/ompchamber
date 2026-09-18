import { Check, Radio, Zap } from 'lucide-preact';
import type { SettingsState, StreamTransport } from '@/shared/types';

interface ChatTransportSectionProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

const OPTIONS: Array<{
  id: StreamTransport;
  label: string;
  badge: string;
  icon: typeof Zap;
  description: string;
  note: string;
}> = [
  {
    id: 'websocket',
    label: 'WebSocket',
    badge: 'Default',
    icon: Zap,
    description:
      'One duplex socket carries every agent frame — no per-event HTTP framing, protocol-level ping keepalive, and capped client backoff on drops.',
    note: 'Lowest overhead per frame',
  },
  {
    id: 'sse',
    label: 'Server-Sent Events',
    badge: 'Fallback',
    icon: Radio,
    description:
      'Long-lived HTTP response stream with automatic browser reconnection. Pick this when a proxy or network blocks the WebSocket upgrade.',
    note: 'Works through HTTP-only proxies',
  },
];

export function ChatTransportSection({ settings, onUpdate }: ChatTransportSectionProps) {
  const active = settings.streamTransport ?? 'websocket';

  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-ink">Streaming Transport</h4>
        <p className="text-[11px] text-ink/60 mt-0.5">
          Wire protocol for live agent events. Applies to the next connection — reconnect or send a new prompt to switch.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map(({ id, label, badge, icon: Icon, description, note }) => {
          const selected = active === id;
          const select = () => onUpdate({ streamTransport: id });
          return (
            <div
              key={id}
              onClick={select}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && select()}
              className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between select-none ${
                selected
                  ? 'border-ink bg-ink/5 ring-1 ring-ink/20 shadow-xs'
                  : 'border-ink/15 bg-paper hover:border-ink/30 hover:bg-ink/[0.02]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center ${
                        selected ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/70'
                      }`}
                    >
                      <Icon size={15} />
                    </div>
                    <span className="font-semibold text-xs text-ink">{label}</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-ink/10 text-ink/70 font-medium">
                    {badge}
                  </span>
                </div>
                <p className="text-[11px] text-ink/65 leading-relaxed">{description}</p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-ink/10 flex items-center justify-between text-[11px]">
                <span className="text-ink/50 text-[10px]">{note}</span>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    selected ? 'border-ink bg-ink text-paper' : 'border-ink/30 bg-transparent'
                  }`}
                >
                  {selected && <Check size={10} strokeWidth={3} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
