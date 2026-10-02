/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The runner's own globals that test files replace, captured when this module is
 * FIRST imported.
 *
 * That import happens while a test file is being loaded — before its own hooks,
 * and therefore before any test has run — so the value here is the runner's own.
 * A file's own `const native = globalThis.X` is only as good as WHEN that file
 * was imported: a file imported after another suite installed its fake captures
 * the FAKE, and then faithfully restores it for everyone after. That is why
 * every file that installs a fake must import this module (the capture is taken
 * before the first fake exists), and why a file that only READS the global puts
 * this value back before each case. `fetch` has `Bun.fetch` for the same job;
 * `WebSocket` has no such handle.
 */
export const pristineWebSocket = globalThis.WebSocket;
