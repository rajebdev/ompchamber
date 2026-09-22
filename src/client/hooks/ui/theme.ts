import { useCallback, useEffect, useState } from 'preact/hooks';
import { useChamberSettingsWriter } from '@/client/hooks/settings/use-chamber-setting';

/** Broadcast on every theme write. Detail is the new theme id; the
 *  `data-theme` attribute on `<html>` is the durable copy of the same fact. */
export const THEME_CHANGED_EVENT = 'omp:theme-changed';

/**
 * Point the document at `theme` and announce it.
 *
 * The single writer path for the theme: the navbar toggle and the settings
 * modal both call this, because a writer that only sets `data-theme` leaves
 * runtime consumers (the mermaid hydrator re-renders diagrams per theme) on the
 * previous palette until the next reload. CSS reads the attribute; listeners
 * watch the attribute too, so this stays correct even if the event is missed.
 */
export function applyDocumentTheme(theme: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: theme }));
}

export function useTheme() {
  const writeChamberSettings = useChamberSettingsWriter();
  const [theme, setThemeState] = useState<string>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.dataset.theme || document.documentElement.getAttribute('data-theme') || 'paper';
    }
    return 'paper';
  });

  const isDark = theme === 'one-dark-pro-soft' || theme === 'noir' || theme === 'dark';

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const updateTheme = () => {
      const current = document.documentElement.dataset.theme || document.documentElement.getAttribute('data-theme') || 'paper';
      setThemeState(current);
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', current === 'one-dark-pro-soft' ? '#282c34' : '#faf8f3');
      }
    };

    updateTheme();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'data-theme' || mutation.attributeName === 'class')
        ) {
          updateTheme();
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

    const handleCustomChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setThemeState(customEvent.detail);
      } else {
        updateTheme();
      }
    };

    window.addEventListener('omp:theme-changed', handleCustomChange);

    return () => {
      observer.disconnect();
      window.removeEventListener('omp:theme-changed', handleCustomChange);
    };
  }, []);

  const setTheme = useCallback((newTheme: string) => {
    applyDocumentTheme(newTheme);
    setThemeState(newTheme);
    writeChamberSettings({ theme: newTheme });
  }, [writeChamberSettings]);

  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'paper' : 'one-dark-pro-soft');
  }, [isDark, setTheme]);

  return { theme, isDark, setTheme, toggleTheme };
}
