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

import fs from 'fs';
import * as path from 'path';
import { getSessionsDir } from '@/server/lib/omp/core/paths';
import { countMessageMarkers, extractFirstDisplayMessageFromPrefix, extractStringProperty, extractTextFromContent, parseJsonlLenient, parseSessionListHeader } from '@/shared/lib/omp/session/jsonl';
import { isRecord } from '@/shared/lib/util/guards';

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
  /** Last activity: the newest JSONL entry's own `timestamp`, falling back to
   *  the file mtime for a file the tail window cannot date. */
  modified: Date;
  /** Filesystem mtime. Scan-cache version only — never user-visible, and never
   *  an ordering key (see readLastEntryTimestamp for why). */
  fileMtime: Date;
  messageCount: number;
  size: number;
  firstMessage: string;
}

// ============================================================================
// Per-file scan (4 KiB prefix + bounded tail window)
// ============================================================================

const SESSION_LIST_PREFIX_BYTES = 4096;

/**
 * Tail window for the last-activity timestamp. The distance from EOF to the
 * newest timestamped line measured at most ~4 KiB across every session on this
 * machine, so 16 KiB carries 4x headroom over the largest final entry seen.
 */
const SESSION_TAIL_BYTES = 16 * 1024;

/**
 * Ceiling for the escalating tail read. A session can legitimately end with an
 * entry larger than the first window — a tool result carrying a big file read
 * or build log — and that entry is usually the newest timestamped line, so
 * falling back to mtime there would reintroduce the bug this exists to fix.
 * The window quadruples up to this ceiling, which is one read per step and
 * only for a session whose final entry is genuinely that large.
 */
const SESSION_TAIL_MAX_BYTES = 1024 * 1024;

async function readTextPrefix(filePath: string, prefixBytes: number): Promise<[string, number, Date]> {
  const file = Bun.file(filePath);
  const stat = await file.stat();
  const prefixLength = Math.min(prefixBytes, stat.size);
  const prefix = prefixLength > 0 ? await file.slice(0, prefixLength).text() : '';
  return [prefix, stat.size, new Date(stat.mtimeMs)];
}

/**
 * omp lifecycle markers: entries the agent writes about the SESSION PROCESS,
 * not about the conversation. `session_exit` is emitted every time an omp
 * child is disposed — an idle timeout, a chamber restart, a shutdown — and a
 * session accumulates one per dispose (the file that prompted this rule holds
 * three). Treating the newest one as last activity floats a session that has
 * been quiet for days to the top of `LATEST_SESSION`: measured across a real
 * agent dir, 255 of 319 sessions were ranked by a marker like that, the worst
 * by ~14 days.
 *
 * Only markers KNOWN to be lifecycle are excluded. `tool_execution_start` is
 * the commonest custom entry in the same files (16k occurrences) and IS
 * activity — a run that ends mid-tool-call is still the newest one — so an
 * unrecognised customType is counted rather than ignored.
 */
const LIFECYCLE_CUSTOM_TYPES = new Set(['session_exit']);

/** A parsed entry timestamp, flagged when the entry is process bookkeeping. */
interface EntryStamp {
  at: Date;
  lifecycle: boolean;
}

/** Timestamp + lifecycle flag from one JSONL line, or undefined when the line
 *  carries no usable timestamp. */
function entryStampOfLine(line: string): EntryStamp | undefined {
  let type: unknown;
  let customType: unknown;
  let value: unknown;
  let parsedOk = false;
  try {
    const parsed: unknown = JSON.parse(line);
    if (isRecord(parsed)) {
      parsedOk = true;
      type = parsed.type;
      customType = parsed.customType;
      value = parsed.timestamp;
    }
  } catch {
    // Torn or window-truncated line — fall back to the raw-text scan.
  }
  if (!parsedOk) {
    value = extractStringProperty(line, 'timestamp');
    type = extractStringProperty(line, 'type');
    customType = extractStringProperty(line, 'customType');
  }
  let at: Date | undefined;
  if (typeof value === 'number' && Number.isFinite(value)) at = new Date(value);
  else if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) at = parsed;
  }
  if (!at) return undefined;
  const lifecycle = type === 'custom'
    && typeof customType === 'string'
    && LIFECYCLE_CUSTOM_TYPES.has(customType);
  return { at, lifecycle };
}

/**
 * Timestamp of the newest entry in a session file, read from a bounded tail
 * window — the session's real last activity.
 *
 * File mtime is NOT that value. A title-slot rename rewrites the first 256
 * bytes in place and bumps mtime without a turn having happened; a full-file
 * title rewrite on a slot-less legacy file does the same; and a session
 * restored or copied from a backup carries an mtime unrelated to its content.
 * Every one of those moved the sidebar's `LATEST_SESSION` order. The last
 * entry's own `timestamp` is what "latest session" means, and it survives all
 * three.
 *
 * Process bookkeeping does not count either — see LIFECYCLE_CUSTOM_TYPES.
 *
 * `prefix` is the already-read 4 KiB head; a file that fits inside it needs no
 * second read — a third of the sessions on a real machine are that small.
 *
 * The window starts at SESSION_TAIL_BYTES and widens toward
 * SESSION_TAIL_MAX_BYTES while it holds no usable entry, so a session ending
 * on one oversized entry is still dated correctly. Only when even the ceiling
 * holds nothing but lifecycle markers — an empty file, or a single entry
 * larger than a megabyte — does this return undefined and let the caller fall
 * back to mtime.
 */
async function readLastEntryTimestamp(
  filePath: string,
  size: number,
  prefix: string,
): Promise<Date | undefined> {
  if (size <= 0) return undefined;
  let windowBytes = SESSION_TAIL_BYTES;
  for (;;) {
    const start = Math.max(0, size - windowBytes);
    let text: string;
    if (size <= SESSION_LIST_PREFIX_BYTES) {
      // The whole file is inside the prefix window already.
      text = prefix;
    } else if (start === 0) {
      try {
        text = await Bun.file(filePath).text();
      } catch {
        return undefined;
      }
    } else {
      try {
        // Read one byte before the window: if it is a newline the window opens
        // on a line boundary, otherwise the first line is a fragment. Either
        // way the leading split element is not a complete entry.
        text = await Bun.file(filePath).slice(start - 1).text();
      } catch {
        return undefined;
      }
    }
    const lines = text.split('\n');
    if (start > 0) lines.shift();
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.includes('"timestamp"')) continue;
      const stamp = entryStampOfLine(line);
      if (stamp && !stamp.lifecycle) return stamp.at;
    }
    // The window is already the whole file, or it has reached its ceiling.
    if (start === 0 || windowBytes >= SESSION_TAIL_MAX_BYTES) return undefined;
    windowBytes = Math.min(windowBytes * 4, SESSION_TAIL_MAX_BYTES);
  }
}

/**
 * Scan a single session file into an OmpSessionInfo from a 4 KiB prefix window
 * (header, title, first message) plus a bounded tail window (last activity).
 * Faithful port of omp's scanSessionFile except for `modified`, which is the
 * last entry's timestamp rather than the file mtime. Missing/unreadable/
 * header-less files yield undefined instead of throwing.
 */
export async function scanSessionInfo(filePath: string): Promise<OmpSessionInfo | undefined> {
  try {
    const [prefix, size, mtime] = await readTextPrefix(filePath, SESSION_LIST_PREFIX_BYTES);
    const lastEntryAt = await readLastEntryTimestamp(filePath, size, prefix);
    const entries = parseJsonlLenient<Record<string, unknown>>(prefix);
    const header = parseSessionListHeader(prefix, entries);
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

    firstMessage ||= extractFirstDisplayMessageFromPrefix(prefix) ?? '';
    return {
      path: filePath,
      id: header.id,
      cwd: header.cwd ?? '',
      title: header.title ?? shortSummary,
      parentSessionPath: header.parentSession,
      created: new Date(header.timestamp ?? ''),
      modified: lastEntryAt ?? mtime,
      fileMtime: mtime,
      messageCount: Math.max(parsedMessageCount, countMessageMarkers(prefix)),
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

/**
 * Shape version of a cached OmpSessionInfo. The caches hang off `globalThis`
 * so they survive a module reload, which means an entry written by an older
 * build of this file is still readable after an edit — and a field added or
 * renamed since then reads as undefined at the point of use rather than
 * missing a scan. Bump this whenever OmpSessionInfo changes; the cache is
 * discarded instead of misread.
 */
const SESSION_SCAN_CACHE_VERSION = 2;

interface SessionScanCache {
  version: number;
  entries: Map<string, OmpSessionInfo>;
}

declare global {
  var __ompChamberSessionFileListCache: Map<string, SessionFileListCacheEntry> | undefined;
  var __ompChamberSessionScanCache: SessionScanCache | undefined;
}

const MAX_SESSION_SCAN_CACHE_ENTRIES = 2048;

/**
 * Walk `<sessionsRoot>/<project>/*.jsonl`, caching on the root directory's
 * mtimeMs: creating/deleting a session bumps the parent directory's mtime, so
 * the cache invalidates for free on every add/remove. A directory that no
 * longer exists yields [] rather than throwing.
 */
export async function listSessionFiles(sessionsRoot: string = getSessionsDir()): Promise<string[]> {
  try {
    await Bun.file(sessionsRoot).stat();
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
    for (const dirent of await fs.promises.readdir(sessionsRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      try {
        const stat = await Bun.file(path.join(sessionsRoot, dirent.name)).stat();
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
  let dirents: fs.Dirent[] = [];
  try {
    dirents = await fs.promises.readdir(sessionsRoot, { withFileTypes: true });
  } catch {
    // Unreadable sessions root — treat as empty.
  }
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const projectDir = path.join(sessionsRoot, dirent.name);
    try {
      dirMtimes.set(dirent.name, (await Bun.file(projectDir).stat()).mtimeMs);
    } catch {
      continue;
    }
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(projectDir, { withFileTypes: true });
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
  const slot = globalThis.__ompChamberSessionScanCache;
  if (slot && slot.version === SESSION_SCAN_CACHE_VERSION) return slot.entries;
  const fresh: SessionScanCache = { version: SESSION_SCAN_CACHE_VERSION, entries: new Map() };
  globalThis.__ompChamberSessionScanCache = fresh;
  return fresh.entries;
}

/** scanSessionInfo memoized on (path, size, mtimeMs) — an unchanged file costs
 *  a single stat. Cache hits share one object; callers must treat results as
 *  immutable. Exported so the id locator shares this cache with the sidebar
 *  list instead of re-reading every prefix and tail on each resolve. */
export async function scanSessionInfoCached(filePath: string): Promise<OmpSessionInfo | undefined> {
  let stat: { size: number; mtimeMs: number };
  try {
    stat = await Bun.file(filePath).stat();
  } catch {
    return undefined;
  }
  const cache = getSessionScanCache();
  const cached = cache.get(filePath);
  if (cached) {
    const info = cached;
    // Re-scan when size or mtime changed. The version is the FILE mtime, not
    // `modified` — the latter is now an entry timestamp, and a title-slot
    // rewrite that bumps the file without appending an entry must still be
    // picked up (it can change the title the row displays).
    if (info.size === stat.size && info.fileMtime.getTime() === stat.mtimeMs) {
      cache.delete(filePath);
      cache.set(filePath, info);
      return info;
    }
    cache.delete(filePath);
  }
  const info = await scanSessionInfo(filePath);
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
export async function listAllSessionInfos(sessionsRoot: string = getSessionsDir()): Promise<OmpSessionInfo[]> {
  const files = await listSessionFiles(sessionsRoot);
  const sessions: OmpSessionInfo[] = [];
  for (const file of files) {
    const info = await scanSessionInfoCached(file);
    if (info) sessions.push(info);
  }
  sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  return sessions;
}

/** Clear in-memory file-list and per-file scan caches (e.g. after a mutation
 *  that mtime keys cannot detect). */
export function clearSessionFileCaches(): void {
  globalThis.__ompChamberSessionFileListCache?.clear();
  globalThis.__ompChamberSessionScanCache?.entries.clear();
}

/** Exported for tests/spot-checks: read a raw JSONL session header directly. */
export async function readRawHeaderLine(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const head = (await Bun.file(filePath).text()).slice(0, SESSION_TITLE_SLOT_BYTES + 4096);
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
