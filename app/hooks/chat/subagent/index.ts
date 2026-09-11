import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageData, SubagentInfo } from '@/types';
import { isRecord } from '@/lib/omp/session/parse-message-blocks';
import { parseSubagentLifecycle, parseSubagentProgress } from '@/lib/omp/subagent/parse';
import {
  convertMessages,
  mergeMessages,
  requestHistoryPage,
  requestSubagentPage,
} from '@/lib/omp/subagent/transcript-client';

/**
 * Transcript viewer state for one subagent of an omp session.
 *
 * Live subagents load through the `get_subagent_messages` RPC (paged by byte
 * offset) and keep their tail up to date while the parent SSE stream dispatches
 * live window frames. History subagents (`source === 'history'`, recovered from
 * the parent session file after the process is gone) load a single paged pass
 * from the on-disk history route instead and need no live listeners.
 */

/** Initial-load page cap — a runaway byte cursor must not freeze the view. */
const MAX_INITIAL_PAGES = 20;
/** Coalescing window for live subagent_event tail refetches. */
const TAIL_FLUSH_MS = 150;

export interface UseSubagentTranscriptResult {
  messages: ChatMessageData[];
  isLoading: boolean;
  status: SubagentInfo | null;
  isActive: boolean;
}

interface SubagentFrameDetail {
  sessionId?: string;
  payload?: unknown;
}

const PROGRESS_STATUS: Record<string, SubagentInfo['status']> = {
  pending: 'started',
  running: 'started',
  completed: 'completed',
  failed: 'failed',
  aborted: 'aborted',
};

function isTerminal(status: SubagentInfo['status'] | undefined): boolean {
  return status === 'completed' || status === 'failed' || status === 'aborted';
}

/** Merge a status copy without regressing terminal states, clobbering a real
 *  agent name with the lifecycle "subagent" default, or losing progress. */
function mergeStatus(prev: SubagentInfo | null, incoming: SubagentInfo): SubagentInfo {
  if (!prev || prev.id !== incoming.id) return incoming;
  const next: SubagentInfo = {
    ...prev,
    ...incoming,
    agent: incoming.agent !== 'subagent' ? incoming.agent : prev.agent,
    index: prev.index >= 0 ? prev.index : incoming.index,
    status: isTerminal(prev.status) && !isTerminal(incoming.status) ? prev.status : incoming.status,
  };
  const progress = { ...prev.progress, ...incoming.progress };
  if (Object.keys(progress).length > 0) next.progress = progress;
  else delete next.progress;
  return next;
}

export function useSubagentTranscript(
  sessionId: string | null,
  subagent: SubagentInfo | null,
  onBack: () => void,
): UseSubagentTranscriptResult {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [status, setStatus] = useState<SubagentInfo | null>(subagent);
  const [isLoading, setIsLoading] = useState(false);

  const subagentId = subagent?.id ?? null;
  const isActive = Boolean(sessionId && subagentId);

  // Live refs — every async result is validated against the generation that
  // started it, so a stale page can never land on a switched session/subagent.
  const generationRef = useRef(0);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const subagentRef = useRef(subagent);
  subagentRef.current = subagent;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const nextByteRef = useRef(0);
  const sessionFileRef = useRef<string | undefined>(undefined);
  const readyRef = useRef(false);
  const flushingRef = useRef(false);
  const queuedRef = useRef(false);
  const flushTimerRef = useRef<number | null>(null);
  const tailRef = useRef<() => void>(() => {});

  /** Pull everything written since the last byte cursor and append it. */
  const runTailFetch = useCallback(async () => {
    const sid = sessionIdRef.current;
    const active = subagentRef.current;
    if (!sid || !active || !readyRef.current) return;
    if (flushingRef.current) {
      queuedRef.current = true;
      return;
    }
    flushingRef.current = true;
    const generation = generationRef.current;
    try {
      const page = await requestSubagentPage(sid, active.id, sessionFileRef.current, nextByteRef.current);
      if (generation !== generationRef.current || !page) return;
      sessionFileRef.current = page.sessionFile || sessionFileRef.current;
      const converted = convertMessages(page.messages, true);
      if (page.reset) {
        // The transcript was retruncated: the page starts at the head anyway.
        setMessages(converted);
        nextByteRef.current = page.nextByte;
      } else {
        setMessages(prev => mergeMessages(prev, converted));
        nextByteRef.current = Math.max(nextByteRef.current, page.nextByte);
      }
    } finally {
      flushingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        tailRef.current();
      }
    }
  }, []);

  // Reflect status/progress updates pushed down through the subagent prop.
  useEffect(() => {
    if (!subagent) return;
    setStatus(prev => mergeStatus(prev, subagent));
  }, [subagent]);

  // Escape closes the subagent view (the banner back button mirrors it).
  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      onBackRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive]);

  useEffect(() => {
    if (!sessionId || !subagentId) {
      setMessages([]);
      setStatus(null);
      setIsLoading(false);
      return;
    }

    const generation = ++generationRef.current;
    const initial = subagentRef.current;
    const isCurrent = () => generation === generationRef.current;
    const historySource = initial?.source === 'history';

    setMessages([]);
    setStatus(initial);
    setIsLoading(true);
    nextByteRef.current = 0;
    sessionFileRef.current = initial?.sessionFile;
    readyRef.current = false;

    const scheduleTail = () => {
      if (flushTimerRef.current !== null) return;
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        void runTailFetch();
      }, TAIL_FLUSH_MS);
    };
    tailRef.current = scheduleTail;

    const loadInitial = async () => {
      let fromByte = 0;
      let file = sessionFileRef.current;
      // A live roster click starts on the RPC path; everything else (history
      // entries, deep-link restores) goes straight to disk — no speculative
      // RPC probe that 400s for finished subagents.
      let viaHistory = historySource || !initial?.sessionFile;
      let collected: ChatMessageData[] = [];
      for (let page = 0; page < MAX_INITIAL_PAGES; page++) {
        let result = viaHistory
          ? await requestHistoryPage(sessionId, subagentId, fromByte)
          : await requestSubagentPage(sessionId, subagentId, file, fromByte);
        if (!isCurrent()) return;
        if (!result && !viaHistory && fromByte === 0) {
          // The parent RPC dropped this subagent (already finished) — the
          // on-disk transcript is authoritative from here on.
          viaHistory = true;
          result = await requestHistoryPage(sessionId, subagentId, 0);
          if (!isCurrent()) return;
        }
        if (!result) break;
        file = result.sessionFile || file;
        const converted = convertMessages(result.messages, false);
        collected = result.reset ? converted : mergeMessages(collected, converted);
        if (result.nextByte <= fromByte) break;
        fromByte = result.nextByte;
        // totalBytes came with the page — stop as soon as the cursor reaches
        // it instead of probing one empty page past the end of the file.
        if (result.totalBytes !== undefined && fromByte >= result.totalBytes) break;
      }
      if (!isCurrent()) return;
      sessionFileRef.current = file;
      nextByteRef.current = fromByte;
      readyRef.current = !viaHistory;
      setMessages(prev => mergeMessages(prev, collected));
      setIsLoading(false);
      // A transcript served from disk belongs to a finished process — the
      // registry can still say "started" long after the fact.
      if (viaHistory) {
        setStatus(prev => (prev && !isTerminal(prev.status) ? { ...prev, status: 'completed' } : prev));
      }
    };

    const readDetail = (event: Event): SubagentFrameDetail | null => {
      const detail = (event as CustomEvent<SubagentFrameDetail>).detail;
      return detail && detail.sessionId === sessionId ? detail : null;
    };

    const onLifecycle = (event: Event) => {
      const detail = readDetail(event);
      if (!detail) return;
      const parsed = parseSubagentLifecycle(detail.payload);
      if (!parsed || parsed.id !== subagentId) return;
      setStatus(prev => mergeStatus(prev, parsed));
      // A terminal frame means the child wrote its last turns — pull them.
      scheduleTail();
    };

    const onProgress = (event: Event) => {
      const detail = readDetail(event);
      if (!detail) return;
      const payload = isRecord(detail.payload) ? detail.payload : null;
      if (!payload) return;
      const payloadId = typeof payload.id === 'string' ? payload.id : null;
      if (payloadId && payloadId !== subagentId) return;
      if (!payloadId) {
        const payloadIndex = typeof payload.index === 'number' ? payload.index : null;
        // Index is only unique within a spawning batch — require the exact match.
        if (payloadIndex === null || payloadIndex !== (subagentRef.current?.index ?? -1)) return;
      }
      const progress = parseSubagentProgress(payload);
      if (!progress) return;
      setStatus(prev => {
        if (!prev || prev.id !== subagentId) return prev;
        const next: SubagentInfo = { ...prev, progress: { ...prev.progress, ...progress } };
        if (progress.status && !isTerminal(prev.status)) {
          next.status = PROGRESS_STATUS[progress.status] ?? prev.status;
        }
        return next;
      });
    };

    const onActivity = (event: Event) => {
      const detail = readDetail(event);
      if (!detail) return;
      const payload = isRecord(detail.payload) ? detail.payload : null;
      if (!payload || payload.id !== subagentId) return;
      scheduleTail();
    };

    // Dead-session history emits no live frames — skip the listeners entirely.
    if (!historySource) {
      window.addEventListener('subagent_lifecycle', onLifecycle);
      window.addEventListener('subagent_progress', onProgress);
      window.addEventListener('subagent_event', onActivity);
    }
    void loadInitial();

    return () => {
      generationRef.current += 1;
      readyRef.current = false;
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (!historySource) {
        window.removeEventListener('subagent_lifecycle', onLifecycle);
        window.removeEventListener('subagent_progress', onProgress);
        window.removeEventListener('subagent_event', onActivity);
      }
    };
  }, [sessionId, subagentId, runTailFetch]);

  return { messages, isLoading, status, isActive };
}
