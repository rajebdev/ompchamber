/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The write half of the file-editing contract: POST one buffer to
 * `/api/fs/action` and report whether the server took it.
 *
 * Kept out of `useFileEditor` because the multipart shape, the scope fields and
 * the failure rule are one self-contained concern, and because the hook carries
 * the read, cache and history concerns already.
 */

import type { LineEnding } from '@/shared/lib/code/line-endings';

interface SavableFile {
  path?: string;
  root?: string;
  repo?: string;
}

/**
 * Writes `lfText` to `file.path` in the file's own `eol`. Returns false on any
 * refusal — a non-2xx response, an `error` body, or a dropped connection —
 * because the caller's only decision is whether to mark the buffer clean.
 *
 * The ending travels as its own field and the server rebuilds the bytes: a
 * multipart body normalizes bare LF to CRLF, so the payload cannot carry the
 * distinction itself.
 */
export async function saveEditorFile(file: SavableFile, lfText: string, eol: LineEnding): Promise<boolean> {
  if (!file.path) return false;
  const formData = new FormData();
  formData.append('actionType', 'save');
  formData.append('path', file.path);
  formData.append('content', lfText);
  formData.append('eol', eol);
  if (file.root) formData.append('root', file.root);
  if (file.repo && file.repo !== '.') formData.append('repo', file.repo);
  try {
    const res = await fetch('/api/fs/action', { method: 'POST', body: formData });
    const data = await res.json().catch(() => null);
    return Boolean(res.ok && data?.success);
  } catch {
    return false;
  }
}

/**
 * Keeps only `keep`'s keys, returning the same object when nothing was
 * dropped so a render whose tab set is unchanged does not re-key its children.
 */
export function retainKeys<T>(record: Record<string, T>, keep: Set<string>): Record<string, T> {
  const keys = Object.keys(record);
  if (keys.every((key) => keep.has(key))) return record;
  const next: Record<string, T> = {};
  for (const key of keys) {
    if (keep.has(key)) next[key] = record[key];
  }
  return next;
}
