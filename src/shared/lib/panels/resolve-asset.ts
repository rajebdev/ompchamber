/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Path resolution for the panel asset route.
 *
 * Split out and unit-tested because the HTTP layer cannot be trusted to
 * exercise it: a request carrying a literal `../` is normalised by the router
 * before this code ever sees it, so a live probe returns the router's 404 and
 * says nothing about whether the guard works. The guard is the thing that
 * matters — it is what stops a manifest whose `entry` was hand-written to
 * escape its plugin directory from becoming a read of any file the server can
 * open.
 */

import { resolve, sep } from 'path';

/**
 * Resolve a request's relative path under a plugin root, or null when it
 * escapes.
 *
 * `resolve` collapses `..` and `.` segments before the comparison, so the test
 * is on the RESOLVED path rather than the written one — a check for the literal
 * substring `..` would miss `a/../../x` and would also refuse a legitimate
 * filename containing two dots. Equality with the root is allowed (a request for
 * the directory itself), and a sibling whose name merely starts with the root's
 * name (`/a/bc` against `/a/b`) is refused by comparing against `root + sep`.
 */
export function resolveInsideRoot(root: string, relative: string): string | null {
  const target = resolve(root, relative);
  return target === root || target.startsWith(root + sep) ? target : null;
}
