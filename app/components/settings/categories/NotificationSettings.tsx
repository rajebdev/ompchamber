import React, { useState } from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';
import type { SettingsState } from '@/types';
import { playNotificationSound } from '@/hooks/useNotificationSound';

interface NotificationSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function NotificationSettings({ settings, onUpdate }: NotificationSettingsProps) {
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  const handleTestSound = () => {
    setIsPlayingTest(true);
    playNotificationSound();
    setTimeout(() => setIsPlayingTest(false), 600);
  };

  const isSoundEnabled = settings.chatCompletionSound ?? settings.soundAlerts ?? true;

  return (
    <div className="w-full space-y-6 text-xs text-ink">
      {/* Primary Section: AI Response Sound Notification */}
      <div className="bg-paper border border-ink/15 rounded-lg p-4 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-md bg-ink/5 border border-ink/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              {isSoundEnabled ? (
                <Volume2 size={16} className="text-ink" />
              ) : (
                <VolumeX size={16} className="text-ink/40" />
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-ink flex items-center gap-2">
                <span>AI Response Completion Sound</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-ink/10 text-ink/80 font-bold">
                  Audio Chime
                </span>
              </div>
              <p className="text-ink/65 text-[11px] mt-1 leading-relaxed">
                Play an audible notification chime when the AI completes generating its response, thinking blocks, or diagnostic execution.
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={isSoundEnabled}
            onClick={() => {
              const next = !isSoundEnabled;
              onUpdate({
                chatCompletionSound: next,
                soundAlerts: next,
              });
              if (next) {
                playNotificationSound();
              }
            }}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isSoundEnabled ? 'bg-ink' : 'bg-ink/20'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-paper shadow ring-0 transition duration-200 ease-in-out ${
                isSoundEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Test Button & Audio Preview */}
        <div className="pt-3 border-t border-ink/10 flex items-center justify-between">
          <span className="text-[11px] text-ink/60 flex items-center gap-1.5">
            <Sparkles size={13} className="text-ink/60" />
            Warm harmonic chime synthesized natively via Web Audio
          </span>

          <button
            type="button"
            onClick={handleTestSound}
            className={`px-3 py-1.5 rounded-md border border-ink/20 bg-paper hover:bg-ink/5 text-ink font-medium text-[11px] flex items-center gap-1.5 transition-all shadow-xs active:scale-95 ${
              isPlayingTest ? 'border-ink bg-ink/10' : ''
            }`}
          >
            <Volume2 size={13} className={isPlayingTest ? 'animate-bounce text-ink' : 'text-ink/70'} />
            <span>{isPlayingTest ? 'Playing...' : 'Test Sound'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
