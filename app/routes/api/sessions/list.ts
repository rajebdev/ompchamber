/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GET /api/sessions/list — sidebar session list (folders + sessions + live
 * stream statuses). Client-fetched by `useSidebarData` so the folder list is
 * decoupled from SSR: the page shell (appSettings, mobile UA) renders
 * immediately while the heavy omp JSONL scan loads into the skeleton.
 *
 * No action handler — mutations go through their dedicated endpoints
 * (/api/folders/*, /api/sessions/:id/*) and refresh by re-loading this route.
 */

import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { loadSidebarData } from '@/lib/omp/session/sidebar-data.server';

export async function loader(_args: LoaderFunctionArgs) {
  const data = await loadSidebarData();
  return json(data, { headers: { 'Cache-Control': 'no-store' } });
}
