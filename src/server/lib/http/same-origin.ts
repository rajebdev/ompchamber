/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Origin check for WebSocket upgrades.
 *
 * A WebSocket upgrade carries the page's `Origin`, and no preflight protects
 * it: browsers happily open a socket to `localhost` from any page it loads, so
 * without this check a cross-origin page could drive a shell on this machine
 * (the terminal PTY) or trigger real work (dictation's model download and
 * decode). Requests without an Origin — curl, tests — are allowed: they are not
 * a browser being tricked into dialing localhost.
 */
export function isSameOriginUpgrade(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
