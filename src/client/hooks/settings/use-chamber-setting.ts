import { useCallback } from 'preact/hooks';
import { writeChamberSettings } from '@/shared/lib/settings/client';

/**
 * Stable writer for the chamber settings blob: applies the patch to the
 * in-memory snapshot, then persists the merged blob to SQLite.
 */
export function useChamberSettingsWriter(): (patch: Record<string, any>) => void {
  return useCallback((patch: Record<string, any>) => {
    writeChamberSettings(patch);
  }, []);
}
