/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Default display titles for sessions that have no user/auto name yet.
 *
 * A brand-new session must still be distinguishable in the sidebar and navbar
 * before omp derives a real title (first prompt / JSONL title slot), so the
 * default carries the creation timestamp:
 *
 *   New Session - yyyy-mm-ddThh:mm:ss
 *
 * The timestamp is local time and is stable per session: pending sessions take
 * it from their `new-<epochMs>` id, persisted sessions from the JSONL header
 * timestamp — two nameless sessions can never render the same title.
 */

const PENDING_SESSION_PREFIX = 'new-';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `New Session - yyyy-mm-ddThh:mm:ss` (local time); plain "New Session" when
 *  the date is invalid. */
export function formatNewSessionTitle(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return 'New Session';
  return `New Session - ${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** True for client-side pending session ids (`new-<epochMs>`, pre-spawn). */
export function isPendingSessionId(sessionId: string | null | undefined): boolean {
  return Boolean(sessionId?.startsWith(PENDING_SESSION_PREFIX));
}

/** Default title of a client-side pending session; the id carries its
 *  creation epoch (`new-<epochMs>`). */
export function pendingSessionTitle(sessionId: string | null | undefined): string {
  const epochMs = sessionId?.startsWith(PENDING_SESSION_PREFIX)
    ? Number(sessionId.slice(PENDING_SESSION_PREFIX.length))
    : Number.NaN;
  return formatNewSessionTitle(Number.isFinite(epochMs) ? new Date(epochMs) : new Date());
}
