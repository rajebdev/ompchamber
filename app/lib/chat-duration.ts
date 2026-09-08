/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Duration helpers for the chat footer: measures how long an AI response run
 * took (from the preceding user message — or the first AI fragment when no
 * user timestamp exists — until the last AI message of that run).
 */

function parseMsgDate(msg: { date?: string; timestamp?: string } | undefined): number | null {
  const raw = msg?.date || msg?.timestamp;
  if (!raw) return null;
  // Live-stream messages carry a preformatted "Today, 10:30 AM" label that
  // `new Date()` cannot parse — resolve it against the current day.
  if (raw.startsWith('Today,')) {
    const time = raw.slice('Today,'.length).trim();
    const parsed = new Date(`${new Date().toDateString()} ${time}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Human-readable duration: "2m 3s" / "45s" / "1h 4m". Undefined when the run
 *  is under a second or cannot be measured. */
export function formatDuration(ms: number): string | undefined {
  if (!Number.isFinite(ms) || ms < 1000) return undefined;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Elapsed ms of the AI run ending at messages[lastAiIndex]. Walks back to the
 *  preceding user message (or the earliest AI fragment) to find the start. */
export function responseRunDurationMs(
  messages: Array<{ date?: string; timestamp?: string; role?: string }>,
  lastAiIndex: number,
): number | null {
  const end = parseMsgDate(messages[lastAiIndex]);
  if (end === null) return null;

  let start: number | null = null;
  for (let i = lastAiIndex - 1; i >= 0; i--) {
    const d = parseMsgDate(messages[i]);
    if (d === null) continue;
    if (messages[i]?.role === 'user') {
      start = d;
      break;
    }
    start = d;
  }
  if (start === null || end <= start) return null;
  return end - start;
}
