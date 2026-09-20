import { useCallback, useEffect, useState } from 'preact/hooks';
import { useChamberSettingsWriter } from '@/client/hooks/settings/use-chamber-setting';

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
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = newTheme;
      setThemeState(newTheme);
      writeChamberSettings({ theme: newTheme });
      window.dispatchEvent(new CustomEvent('omp:theme-changed', { detail: newTheme }));
    }
  }, [writeChamberSettings]);

  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'paper' : 'one-dark-pro-soft');
  }, [isDark, setTheme]);

  return { theme, isDark, setTheme, toggleTheme };
}
