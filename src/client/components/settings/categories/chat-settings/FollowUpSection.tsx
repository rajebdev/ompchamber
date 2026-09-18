import { Check, Compass, ListOrdered } from 'lucide-preact';
import type { SettingsState } from '@/shared/types';

interface ChatFollowUpSectionProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function ChatFollowUpSection({ settings, onUpdate }: ChatFollowUpSectionProps) {
  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-ink">Follow-up Dispatch</h4>
        <p className="text-[11px] text-ink/60 mt-0.5">
          Choose how new user prompts are handled while the AI agent is actively executing.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Queue Mode Card */}
        <div
          onClick={() => onUpdate({ followUpBehavior: 'queue' })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onUpdate({ followUpBehavior: 'queue' })}
          className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between select-none ${
            settings.followUpBehavior === 'queue'
              ? 'border-ink bg-ink/5 ring-1 ring-ink/20 shadow-xs'
              : 'border-ink/15 bg-paper hover:border-ink/30 hover:bg-ink/[0.02]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center ${
                    settings.followUpBehavior === 'queue'
                      ? 'bg-ink text-paper'
                      : 'bg-ink/5 text-ink/70'
                  }`}
                >
                  <ListOrdered size={15} />
                </div>
                <span className="font-semibold text-xs text-ink">Queue Mode</span>
              </div>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-ink/10 text-ink/70 font-medium">
                Sequential
              </span>
            </div>
            <p className="text-[11px] text-ink/65 leading-relaxed">
              Messages wait in an execution queue and run in succession once current inference completes.
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-ink/10 flex items-center justify-between text-[11px]">
            <span className="text-ink/50 text-[10px]">Recommended for batch operations</span>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                settings.followUpBehavior === 'queue'
                  ? 'border-ink bg-ink text-paper'
                  : 'border-ink/30 bg-transparent'
              }`}
            >
              {settings.followUpBehavior === 'queue' && <Check size={10} strokeWidth={3} />}
            </div>
          </div>
        </div>

        {/* Steering Mode Card */}
        <div
          onClick={() => onUpdate({ followUpBehavior: 'steering' })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onUpdate({ followUpBehavior: 'steering' })}
          className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between select-none ${
            settings.followUpBehavior === 'steering'
              ? 'border-ink bg-ink/5 ring-1 ring-ink/20 shadow-xs'
              : 'border-ink/15 bg-paper hover:border-ink/30 hover:bg-ink/[0.02]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center ${
                    settings.followUpBehavior === 'steering'
                      ? 'bg-ink text-paper'
                      : 'bg-ink/5 text-ink/70'
                  }`}
                >
                  <Compass size={15} />
                </div>
                <span className="font-semibold text-xs text-ink">Steering Mode</span>
              </div>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-ink/10 text-ink/70 font-medium">
                Intervention
              </span>
            </div>
            <p className="text-[11px] text-ink/65 leading-relaxed">
              Immediately redirects current agent trajectory and focuses runtime resources onto the new instruction.
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-ink/10 flex items-center justify-between text-[11px]">
            <span className="text-ink/50 text-[10px]">Recommended for active debugging</span>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                settings.followUpBehavior === 'steering'
                  ? 'border-ink bg-ink text-paper'
                  : 'border-ink/30 bg-transparent'
              }`}
            >
              {settings.followUpBehavior === 'steering' && <Check size={10} strokeWidth={3} />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
