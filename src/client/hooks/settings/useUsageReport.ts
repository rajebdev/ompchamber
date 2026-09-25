import { useCallback, useEffect, useState } from 'preact/hooks';
import type { UsageReport } from '@/shared/types';

export interface UsageReportState {
  report: UsageReport | null;
  isLoading: boolean;
  error: string | null;
  reload: (opts?: { silent?: boolean; force?: boolean }) => void;
}

/**
 * Shared `GET /api/settings/usage` loader for the Settings → Usage panel and
 * the Usage right panel. Both surfaces mount independently, so each keeps its
 * own copy of the last successful report until reload completes.
 *
 * `force` asks the server to re-probe the providers instead of answering from
 * its one-minute quota cache — used by the user's own Refresh button, never by
 * the background poll.
 */
export function useUsageReport(): UsageReportState {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!opts?.silent) setIsLoading(true);
    setError(null);
    try {
      const url = opts?.force ? '/api/settings/usage?refresh=1' : '/api/settings/usage';
      const response = await fetch(url);
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
