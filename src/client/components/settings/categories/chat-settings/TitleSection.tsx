import { Check, Sparkles, Type } from 'lucide-preact';
import type { SettingsState } from '@/shared/types';

interface ChatTitleSectionProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

const OPTIONS: Array<{
  enabled: boolean;
  label: string;
  badge: string;
  icon: typeof Sparkles;
  description: string;
  note: string;
}> = [
  {
    enabled: true,
    label: 'Generate Automatically',
    badge: 'Default',
    icon: Sparkles,
    description:
      'As soon as your first message lands, the session is named from it using omp\'s own tiny title model — retried once when the run ends if that first attempt came back empty. Sessions stop showing "New Session - <timestamp>" in the sidebar.',
    note: 'One small model call per session',
  },
  {
    enabled: false,
    label: 'Manual Only',
    badge: 'Opt-out',
    icon: Type,
    description:
      'Sessions keep their timestamp placeholder until you rename them from the sidebar. Choose this when every title should be deliberate, or to avoid the extra model call.',
    note: 'No background model calls',
  },
];

export function ChatTitleSection({ settings, onUpdate }: ChatTitleSectionProps) {
  const active = settings.autoSessionTitle ?? true;

  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-ink">Session Titles</h4>
        <p className="text-[11px] text-ink/60 mt-0.5">
          How a session gets its display name. A name you set yourself is never replaced.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map(({ enabled, label, badge, icon: Icon, description, note }) => {
          const selected = active === enabled;
          const select = () => onUpdate({ autoSessionTitle: enabled });
          return (
            <div
              key={label}
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
                <p className="text-[11px] text-ink/70 leading-relaxed">{description}</p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-ink/10 flex items-center justify-between text-[11px]">
                <span className="text-ink/50">{note}</span>
                {selected && (
                  <span className="flex items-center gap-1 text-ink font-medium">
                    <Check size={12} /> Active
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
