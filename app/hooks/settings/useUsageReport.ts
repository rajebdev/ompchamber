import { useCallback, useEffect, useState } from 'react';
import type { UsageReport } from '@/types';

export interface UsageReportState {
  report: UsageReport | null;
  isLoading: boolean;
  error: string | null;
  reload: (opts?: { silent?: boolean }) => void;
}

/**
 * Shared `GET /api/settings/usage` loader for the Settings → Usage panel and
 * the Usage right panel. Both surfaces mount independently, so each keeps its
 * own copy of the last successful report until reload completes.
 */
export function useUsageReport(): UsageReportState {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/usage');
      if (!response.ok) throw new Error(`Usage request failed (${response.status})`);
      const data = (await response.json()) as UsageReport;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provider usage');
    } finally {
      if (!opts?.silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { report, isLoading, error, reload };
}
