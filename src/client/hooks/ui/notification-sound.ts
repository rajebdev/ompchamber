import { useCallback } from 'preact/hooks';

/**
 * Web Audio API based notification sound synthesizer.
 * Generates an organic, pleasant two-tone chime without relying on external MP3 assets.
 */
export function playNotificationSound() {
  if (typeof window === 'undefined') return;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Tone 1: Gentle root frequency (587.33 Hz - D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.1);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.14, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.32);

    // Tone 2: Crisp overtone (880 Hz - A5 ramping up to 1174.66 Hz - D6)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.18);

    gain2.gain.setValueAtTime(0, now + 0.06);
    gain2.gain.linearRampToValueAtTime(0.1, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.06);
    osc2.stop(now + 0.42);

    // Automatically clean up audio context after playback completes
    setTimeout(() => {
      try {
        ctx.close();
      } catch {
        // Safe to ignore
      }
    }, 550);
  } catch (err) {
    console.warn('Unable to play notification audio chime:', err);
  }
}

/**
 * Checks whether chat completion sound is enabled in user preferences.
 */
export function isChatSoundEnabled(appSettings?: Record<string, any>): boolean {
  if (typeof window === 'undefined') return true;

  try {
    // 1. Check local storage if available
    const saved = localStorage.getItem('omp_chamber_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.chatCompletionSound !== undefined) {
        return Boolean(parsed.chatCompletionSound);
      }
      if (parsed.soundAlerts !== undefined) {
        return Boolean(parsed.soundAlerts);
      }
    }

    // 2. Check injected appSettings
    if (appSettings?.omp_chamber_settings?.chatCompletionSound !== undefined) {
      return Boolean(appSettings.omp_chamber_settings.chatCompletionSound);
    }
    if (appSettings?.omp_chamber_settings?.soundAlerts !== undefined) {
      return Boolean(appSettings.omp_chamber_settings.soundAlerts);
    }
  } catch {
    // ignore parsing errors
  }

  return true;
}

/**
 * Triggers the completion notification sound if the user setting is enabled.
 */
export function triggerChatCompletionSound(appSettings?: Record<string, any>) {
  if (isChatSoundEnabled(appSettings)) {
    playNotificationSound();
  }
}

export function useNotificationSound() {
  const play = useCallback(() => {
    playNotificationSound();
  }, []);

  const triggerOnComplete = useCallback((appSettings?: Record<string, any>) => {
    triggerChatCompletionSound(appSettings);
  }, []);

  return {
    playNotificationSound: play,
    triggerChatCompletionSound: triggerOnComplete,
    isChatSoundEnabled,
  };
}
