/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers over `Target.getTargets` / `Target.targetInfoChanged` payloads.
 * Only `type === 'page'` entries are real browser tabs; devtools, service
 * workers, and browser-internal targets are ignored.
 */

import { isRecord, readString } from '@/lib/browser/util';

export interface PageTarget {
  targetId: string;
  url: string;
  title: string;
}

/** Parse the `Target.getTargets` result into page targets (in CDP order). */
export function parsePageTargets(result: unknown): PageTarget[] {
  const infos = isRecord(result) && Array.isArray(result.targetInfos) ? result.targetInfos : [];
  const pages: PageTarget[] = [];
  for (const info of infos) {
    if (!isRecord(info) || info.type !== 'page') continue;
    const targetId = readString(info, 'targetId');
    if (!targetId) continue;
    pages.push({ targetId, url: readString(info, 'url') ?? '', title: readString(info, 'title') ?? '' });
  }
  return pages;
}

/**
 * Choose the tab to view: an explicit preference while it is still live, else
 * the newest owned page (creation-ordered registry), else the newest page.
 */
export function pickTargetId(pages: PageTarget[], ownedIds: string[], preferTargetId?: string): string | null {
  if (pages.length === 0) return null;
  const live = new Set(pages.map((page) => page.targetId));
  if (preferTargetId && live.has(preferTargetId)) return preferTargetId;
  for (let index = ownedIds.length - 1; index >= 0; index -= 1) {
    const candidate = ownedIds[index];
    if (candidate && live.has(candidate)) return candidate;
  }
  return pages[pages.length - 1]?.targetId ?? null;
}

/** Extract a page-target patch from a `Target.targetInfoChanged` event. */
export function readTargetInfoPatch(params: unknown): PageTarget | null {
  if (!isRecord(params) || !isRecord(params.targetInfo)) return null;
  const info = params.targetInfo;
  if (info.type !== 'page') return null;
  const targetId = readString(info, 'targetId');
  if (!targetId) return null;
  return { targetId, url: readString(info, 'url') ?? '', title: readString(info, 'title') ?? '' };
}
