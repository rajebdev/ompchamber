/**
 * Live update state: the check that reports what is available, and the apply
 * that runs it.
 *
 * The apply is a POST whose response is an SSE stream, not a JSON body. An
 * `omp update` or an OMPChamber install runs for minutes; a buffered response
 * left the console with a spinner and nothing else until it finished, and
 * discarded the command output the server had already collected. Every frame
 * the stream carries is folded into `progress`, which survives the modal being
 * closed — the hook lives on the sidebar, so leaving the dialog no longer hides
 * the run.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { readSseStream } from '@/shared/lib/chat/read-sse';
import { appendUpdateLog, type UpdateLogState } from '@/shared/lib/updates/progress';
import type { UpdateApplyResult, UpdateCheckResult, UpdateTarget } from '@/shared/types/updates';

export interface UseUpdatesResult {
  info: UpdateCheckResult | null;
  checking: boolean;
  applying: UpdateTarget | null;
  /** Log of the run in flight (or the last one), null before any apply. */
  progress: UpdateLogState | null;
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

export function isUpdateApplyResult(payload: unknown): payload is UpdateApplyResult {
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
  const [progress, setProgress] = useState<UpdateLogState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightCheckRef = useRef<Promise<void> | null>(null);
  const didAutoCheckRef = useRef(false);
  const applyAbortRef = useRef<AbortController | null>(null);

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
    setProgress({ lines: [], pending: '', truncated: false });
    setError(null);

    const controller = new AbortController();
    applyAbortRef.current = controller;
    // The fold is mirrored in a local so each frame is one setState, rather
    // than a read-modify-write against the previous render's state.
    let log: UpdateLogState = { lines: [], pending: '', truncated: false };
    let result: UpdateApplyResult | null = null;

    try {
      const response = await fetch('/api/updates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ target }),
        signal: controller.signal,
      });

      if (!response.ok && !(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
        const payload: unknown = await response.json().catch(() => null);
        const message = responseMessage(payload, `Update failed (HTTP ${response.status})`);
        // 409 is the server saying another run holds the slot. That is a state,
        // not a failure of this request, so it is reported by toast alone: an
        // error state would replace the update rows with a block the user
        // cannot act on, and its Retry only re-checks.
        if (response.status === 409) return { success: false, target, manual: false, message };
        throw new Error(message);
      }

      await readSseStream(
        response,
        (event, data) => {
          if (event === 'line') {
            log = appendUpdateLog(log, JSON.parse(data) as string);
            setProgress(log);
            return;
          }
          if (event === 'stage') {
            // A stage is its own line: the updater's heading and the output
            // under it must not be glued into one line.
            log = appendUpdateLog(log, `${JSON.parse(data) as string}\n`);
            setProgress(log);
            return;
          }
          if (event === 'result') {
            const payload: unknown = JSON.parse(data);
            if (isUpdateApplyResult(payload)) {
              result = payload;
              // A finished run's output is not a report to come back to. An
              // update that worked said everything it had to say in its toast,
              // and an install log left standing is noise the next time the
              // dialog is opened. A run that FAILED keeps its output: the
              // reason is in those lines, and the toast carries only a summary.
              if (payload.success) setProgress(null);
            }
          }
        },
        controller.signal,
      );

      if (!controller.signal.aborted) await check();
      return result;
    } catch (cause) {
      if (controller.signal.aborted) return null;
      const message = cause instanceof Error ? cause.message : 'Unable to apply the update.';
      setError(message);
      // Returned rather than swallowed: the caller's toast is the only surface
      // the user sees, and a generic "could not be completed" would hide a
      // refusal the server explained — an update already running, in the case
      // that matters most, because a reload has just erased this panel's own
      // record that one was.
      return { success: false, target, manual: false, message };
    } finally {
      if (applyAbortRef.current === controller) {
        applyAbortRef.current = null;
        setApplying(null);
      }
    }
  }, [check]);

  useEffect(() => {
    if (didAutoCheckRef.current) return;
    didAutoCheckRef.current = true;
    void check();
  }, [check]);

  useEffect(() => () => applyAbortRef.current?.abort(), []);

  return {
    info,
    checking,
    applying,
    progress,
    error,
    hasUpdate: Boolean(info?.ompchamber.updateAvailable || info?.omp.updateAvailable),
    check,
    apply,
  };
}
