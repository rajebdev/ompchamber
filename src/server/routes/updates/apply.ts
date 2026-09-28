import { json, type ActionFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { scheduleSelfRestart } from '@/server/lib/lifecycle/restart';
import { createSseStream } from '@/server/lib/sse';
import { applyUpdate } from '@/server/lib/updates/apply';

/** Longest a buffered output chunk waits before it is flushed anyway. */
const FLUSH_DELAY_MS = 50;

/**
 * POST /api/updates/apply — body `{ target: 'omp' | 'ompchamber' }`.
 *
 * Answers with an SSE stream rather than one JSON body: the update runs for
 * minutes and prints as it goes, and a buffered response showed the user a
 * spinner and nothing else until it finished. Frames:
 *
 *   `line`   — raw command output
 *   `stage`  — a step heading
 *   `result` — the UpdateApplyResult, last before the stream closes
 *
 * A non-SSE answer is still possible and still meaningful: an unknown target or
 * a malformed body is a plain JSON error with its own status, because there is
 * no run to report on.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') return methodNotAllowed({ request, params });

  let target: unknown;
  try {
    target = ((await request.json()) as { target?: unknown }).target;
  } catch {
    return json({ error: 'Request body is not valid JSON' }, { status: 400 });
  }
  if (target !== 'omp' && target !== 'ompchamber') {
    return json({ error: 'Unknown update target' }, { status: 400 });
  }

  const stream = createSseStream({
    heartbeatMs: 15_000,
    signal: request.signal,
    onStart: async (handlers) => {
      // Output arrives in arbitrary chunks, so a small buffer collapses a burst
      // of writes into one frame without splitting a line in half.
      let pending = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (!pending || handlers.isClosed()) return;
        const chunk = pending;
        pending = '';
        handlers.send('line', chunk);
      };

      try {
        const { result, updated } = await applyUpdate(target, {
          onLine: (chunk) => {
            if (handlers.isClosed()) return;
            pending += chunk;
            if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
          },
          onStage: (label) => {
            if (handlers.isClosed()) return;
            flush();
            handlers.send('stage', label);
          },
        });

        flush();
        // A run that replaced files leaves this process serving the build it
        // just replaced. `scheduleSelfRestart` ARMS the detached restart on its
        // own grace timer (`RESTART_GRACE_MS`) — long enough for the frames
        // below to reach the browser — and it is the only place that knows
        // whether this instance is one the CLI can restart at all. Its plan is
        // folded into the message before the result is sent: "updated" over a
        // server still on the old build would mislead.
        if (target === 'ompchamber' && result.success && updated) {
          const plan = scheduleSelfRestart();
          result.message = `${result.message} ${plan.message}`;
        }
        handlers.send('result', result);
      } catch (err) {
        flush();
        handlers.send('result', {
          success: false,
          target,
          manual: false,
          message: err instanceof Error ? err.message : 'Failed to apply the update',
        });
      }

      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      handlers.close();
    },
  });

  return stream.response;
}
