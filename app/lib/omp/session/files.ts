/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-only session-file scanner for oh-my-pi (format v3).
 *
 * Faithful, trimmed port of omp-web/lib/omp/session-files.ts (itself a port of
 * oh-my-pi packages/coding-agent/src/session/session-listing.ts): it lists the
 * per-project session directories under ~/.omp/agent/sessions and derives a
 * compact summary per session from a small 4 KiB prefix window of each file —
 * enough for a sidebar list without ever loading a full session into memory.
 *
 * File layout: optional fixed-width 256-byte title-slot line, then the
 * {"type":"session"} header line, then message entries. Legacy pi v1/v2
 * shapes parse leniently (raw-text scans); nothing here mutates on-disk data.
 * The lenient JSONL + header parsing lives in ./session-jsonl.ts.
 */

import {
  closeSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  statSync,
  type Dirent,
} from 'fs';
import * as path from 'path';
import { getSessionsDir } from '@/lib/omp/core/paths';
import {
  countMessageMarkers,
  extractFirstDisplayMessageFromPrefix,
  extractTextFromContent,
  isRecord,
  parseJsonlLenient,
  parseSessionListHeader,
} from '@/lib/omp/session/jsonl';

export const SESSION_TITLE_SLOT_BYTES = 256;

/** Compact summary of one session file — the sidebar list row. */
export interface OmpSessionInfo {
  /** Absolute path of the .jsonl file. */
  path: string;
  id: string;
  /** Working directory the session ran in (from the header). */
  cwd: string;
  /** User-facing title (title slot wins; falls back to header title). */
  title?: string;
  parentSessionPath?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  size: number;
  firstMessage: string;
}

// ============================================================================
// Per-file scan (4 KiB prefix window)
// ============================================================================

const SESSION_LIST_PREFIX_BYTES = 4096;

function readTextPrefix(filePath: string, prefixBytes: number): [string, number, Date] {
  const stat = statSync(filePath);
  const fd = openSync(filePath, 'r');
  try {
    const prefixLength = Math.min(prefixBytes, stat.size);
    const prefixBuffer = Buffer.allocUnsafe(prefixLength);
    const prefixRead = prefixLength > 0 ? readSync(fd, prefixBuffer, 0, prefixLength, 0) : 0;
    return [prefixBuffer.subarray(0, prefixRead).toString('utf8'), stat.size, stat.mtime];
  } finally {
    closeSync(fd);
  }
}

/**
 * Scan a single session file into an OmpSessionInfo using only a 4 KiB prefix
 * window. Faithful port of omp's scanSessionFile — messageCount is a
 * prefix-derived lower bound. Missing/unreadable/header-less files yield
 * undefined instead of throwing.
 */
export function scanSessionInfo(filePath: string): OmpSessionInfo | undefined {
  try {
    const [content, size, mtime] = readTextPrefix(filePath, SESSION_LIST_PREFIX_BYTES);
    const entries = parseJsonlLenient<Record<string, unknown>>(content);
    const header = parseSessionListHeader(content, entries);
    if (!header) return undefined;

    let parsedMessageCount = 0;
    let firstMessage = '';
    let shortSummary: string | undefined;
    for (let i = 1; i < entries.length; i++) {
      const entry = entries[i] as {
        type?: string;
        message?: { role?: string; content?: unknown };
        shortSummary?: string;
      };
      if (entry.type === 'compaction' && typeof entry.shortSummary === 'string') {
        shortSummary = entry.shortSummary;
      }
      if (entry.type === 'message' && entry.message) {
        parsedMessageCount++;
        if (entry.message.role === 'user' && !firstMessage) {
          firstMessage = extractTextFromContent(entry.message.content);
        }
      }
    }

    firstMessage ||= extractFirstDisplayMessageFromPrefix(content) ?? '';
    return {
      path: filePath,
      id: header.id,
      cwd: header.cwd ?? '',
      title: header.title ?? shortSummary,
      parentSessionPath: header.parentSession,
      created: new Date(header.timestamp ?? ''),
      modified: mtime,
      messageCount: Math.max(parsedMessageCount, countMessageMarkers(content)),
      size,
      firstMessage: firstMessage || '(no messages)',
    };
  } catch {
    return undefined;
  }
}

// ============================================================================
// File-list walk + per-file memo, both mtime-keyed
// ============================================================================

interface SessionFileListCacheEntry {
  /** mtimeMs of every project subdirectory, keyed by directory name. A new
   *  session file bumps its project dir's mtime, so the cache invalidates for
   *  free on add/remove even though the sessions root itself never changes. */
  dirMtimes: Map<string, number>;
  files: string[];
}

declare global {
  var __ompChamberSessionFileListCache: Map<string, SessionFileListCacheEntry> | undefined;
  var __ompChamberSessionScanCache: Map<string, OmpSessionInfo> | undefined;
}

const MAX_SESSION_SCAN_CACHE_ENTRIES = 2048;

/**
 * Walk `<sessionsRoot>/<project>/*.jsonl`, caching on the root directory's
 * mtimeMs: creating/deleting a session bumps the parent directory's mtime, so
 * the cache invalidates for free on every add/remove. A directory that no
 * longer exists yields [] rather than throwing.
 */
export function listSessionFiles(sessionsRoot: string = getSessionsDir()): string[] {
  try {
    statSync(sessionsRoot);
  } catch {
    return [];
  }
  if (!globalThis.__ompChamberSessionFileListCache) {
    globalThis.__ompChamberSessionFileListCache = new Map();
  }
  const cache = globalThis.__ompChamberSessionFileListCache;
  const cached = cache.get(sessionsRoot);
  if (cached) {
    let fresh = true;
    for (const dirent of readdirSync(sessionsRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      try {
        const stat = statSync(path.join(sessionsRoot, dirent.name));
        if (cached.dirMtimes.get(dirent.name) !== stat.mtimeMs) {
          fresh = false;
          break;
        }
      } catch {
        fresh = false;
        break;
      }
    }
    if (fresh && cached.dirMtimes.size > 0) return cached.files;
  }

  const files: string[] = [];
  const dirMtimes = new Map<string, number>();
  let dirents: Dirent[] = [];
  try {
    dirents = readdirSync(sessionsRoot, { withFileTypes: true });
  } catch {
    // Unreadable sessions root — treat as empty.
  }
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const projectDir = path.join(sessionsRoot, dirent.name);
    try {
      dirMtimes.set(dirent.name, statSync(projectDir).mtimeMs);
    } catch {
      continue;
    }
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      // Skip per-session artifacts directories (file name minus .jsonl) —
      // only regular files ending in .jsonl are accepted.
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      files.push(path.join(projectDir, entry.name));
    }
  }

  cache.set(sessionsRoot, { dirMtimes, files });
  return files;
}

function getSessionScanCache(): Map<string, OmpSessionInfo> {
  if (!globalThis.__ompChamberSessionScanCache) {
    globalThis.__ompChamberSessionScanCache = new Map();
  }
  return globalThis.__ompChamberSessionScanCache;
}

/** scanSessionInfo memoized on (path, size, mtimeMs) — an unchanged file costs
 *  a single stat. Cache hits share one object; callers must treat results as
 *  immutable. */
function scanSessionInfoCached(filePath: string): OmpSessionInfo | undefined {
  let stat: { size: number; mtimeMs: number };
  try {
    stat = statSync(filePath);
  } catch {
    return undefined;
  }
  const cache = getSessionScanCache();
  const cached = cache.get(filePath);
  if (cached) {
    const info = cached;
    // Re-scan when size or mtime changed.
    if (info.size === stat.size && info.modified.getTime() === stat.mtimeMs) {
      cache.delete(filePath);
      cache.set(filePath, info);
      return info;
    }
    cache.delete(filePath);
  }
  const info = scanSessionInfo(filePath);
  // Failed scans are not negatively cached: a transient read error must not
  // hide a session until its next mtime bump.
  if (info) {
    cache.set(filePath, info);
    while (cache.size > MAX_SESSION_SCAN_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }
  }
  return info;
}

/**
 * List every session across all project subdirectories of the sessions root,
 * newest-modified first. Invalidates are automatic via mtime keys; callers
 * that mutate sessions may clear caches via clearSessionFileCaches().
 */
export function listAllSessionInfos(sessionsRoot: string = getSessionsDir()): OmpSessionInfo[] {
  const files = listSessionFiles(sessionsRoot);
  const sessions: OmpSessionInfo[] = [];
  for (const file of files) {
    const info = scanSessionInfoCached(file);
    if (info) sessions.push(info);
  }
  sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  return sessions;
}

/** Clear in-memory file-list and per-file scan caches (e.g. after a mutation
 *  that mtime keys cannot detect). */
export function clearSessionFileCaches(): void {
  globalThis.__ompChamberSessionFileListCache?.clear();
  globalThis.__ompChamberSessionScanCache?.clear();
}

/** Exported for tests/spot-checks: read a raw JSONL session header directly. */
export function readRawHeaderLine(filePath: string): Record<string, unknown> | undefined {
  try {
    const head = readFileSync(filePath, 'utf8').slice(0, SESSION_TITLE_SLOT_BYTES + 4096);
    const lines = head.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        if (isRecord(parsed) && parsed.type === 'session') return parsed;
      } catch {
        // Keep scanning lines.
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}
