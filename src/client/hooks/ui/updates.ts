import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { UpdateApplyResult, UpdateCheckResult, UpdateTarget } from '@/shared/types/updates';

export interface UseUpdatesResult {
  info: UpdateCheckResult | null;
  checking: boolean;
  applying: UpdateTarget | null;
  error: string | null;
  hasUpdate: boolean;
  check: () => Promise<void>;
  apply: (target: UpdateTarget) => Promise<UpdateApplyResult | null>;
}

function responseMessage(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) return fallback;

  if ('error' in payload && typeof payload.error === 'string') return payload.error;
  if ('message' in payload && typeof payload.message === 'string') return payload.message;
  return fallback;
}

function isUpdateApplyResult(payload: unknown): payload is UpdateApplyResult {
  if (typeof payload !== 'object' || payload === null) return false;

  return (
    'success' in payload && typeof payload.success === 'boolean' &&
    'target' in payload && (payload.target === 'ompchamber' || payload.target === 'omp') &&
    'manual' in payload && typeof payload.manual === 'boolean' &&
    'message' in payload && typeof payload.message === 'string'
  );
}

export function useUpdates(): UseUpdatesResult {
  const [info, setInfo] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState<UpdateTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightCheckRef = useRef<Promise<void> | null>(null);
  const didAutoCheckRef = useRef(false);

  const check = useCallback(() => {
    if (inFlightCheckRef.current) return inFlightCheckRef.current;

    const request = (async () => {
      setChecking(true);
      setError(null);

      try {
        const response = await fetch('/api/updates/check');
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(responseMessage(payload, `Update check failed (HTTP ${response.status})`));
        }
        setInfo(payload as UpdateCheckResult);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to check for updates.');
      } finally {
        setChecking(false);
        inFlightCheckRef.current = null;
      }
    })();

    inFlightCheckRef.current = request;
    return request;
  }, []);

  const apply = useCallback(async (target: UpdateTarget): Promise<UpdateApplyResult | null> => {
    setApplying(target);
    setError(null);

    try {
      const response = await fetch('/api/updates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const payload: unknown = await response.json();

      if (!isUpdateApplyResult(payload)) {
        throw new Error(responseMessage(payload, `Update failed (HTTP ${response.status})`));
      }

      await check();
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to apply the update.');
      return null;
    } finally {
      setApplying(null);
    }
  }, [check]);

  useEffect(() => {
    if (didAutoCheckRef.current) return;
    didAutoCheckRef.current = true;
    void check();
  }, []);

  return {
    info,
    checking,
    applying,
    error,
    hasUpdate: Boolean(info?.ompchamber.updateAvailable || info?.omp.updateAvailable),
    check,
    apply,
  };
}
