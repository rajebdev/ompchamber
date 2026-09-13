import { useEffect, useState } from 'react';
import { useSearchParams } from '@remix-run/react';
import { SubagentStatusIcon } from '@/components/common/SubagentStatusIcon';
import { isRecord } from '@/lib/omp/session/parse-message-blocks';
import { fetchSubagentHistory, historyEntryToSubagentInfo } from '@/lib/omp/subagent/history/client';
import { mergeSubagentRoster, parseSubagentLifecycle, parseSubagentProgress, parseSubagentRosterResponse } from '@/lib/omp/subagent/parse';
import type { SubagentInfo, SubagentProgress } from '@/types';

type SubagentListProps = {
  sessionId: string | number;
  isActiveSession: boolean;
};

type SubagentFrameDetail = { sessionId?: string; payload?: unknown };

const PROGRESS_STATUS: Record<NonNullable<SubagentProgress['status']>, SubagentInfo['status']> = {
  pending: 'started', running: 'started', completed: 'completed', failed: 'failed', aborted: 'aborted',
};

/** Progress frames arrive AgentProgress-shaped; some wrappers nest the snapshot. */
function readProgress(payload: unknown): SubagentProgress | undefined {
  const direct = parseSubagentProgress(payload);
  if (!isRecord(payload) || !isRecord(payload.progress)) return direct;
  const nested = parseSubagentProgress(payload.progress);
  return nested ? { ...nested, id: nested.id ?? direct?.id, index: nested.index ?? direct?.index } : direct;
}

/** Fold one progress frame into the roster entry it names (id, else index). */
function applyProgress(roster: SubagentInfo[], progress: SubagentProgress): SubagentInfo[] {
  return roster.map((entry) => {
    if (progress.id !== undefined) {
      if (entry.id !== progress.id) return entry;
    } else if (progress.index === undefined || progress.index < 0 || entry.index !== progress.index) {
      return entry;
    }
    const status = progress.status && entry.status === 'started'
      ? PROGRESS_STATUS[progress.status] ?? entry.status
      : entry.status;
    return { ...entry, status, progress: { ...entry.progress, ...progress }, lastUpdate: Date.now() };
  });
}

/**
 * Subagent roster nested under a session row: renders clean, readable subagent
 * items matching the minimalist sidebar layout while preserving interactive inspection.
 */
export function SubagentList({ sessionId, isActiveSession }: SubagentListProps) {
  const [searchParams] = useSearchParams();
  const viewedSubagentId = searchParams.get('subagent');
  const [subagents, setSubagents] = useState<SubagentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // History pass: the roster floor for every session.
  useEffect(() => {
    let cancelled = false;
    const sid = String(sessionId);
    setSubagents([]);
    setIsLoading(true);
    void fetchSubagentHistory(sid)
      .then((entries) => {
        if (cancelled || !entries) return;
        const roster = entries.map(historyEntryToSubagentInfo);
        setSubagents((prev) => mergeSubagentRoster(prev, roster));
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  // Live pass: active session only.
  useEffect(() => {
    if (!isActiveSession) return;
    let cancelled = false;
    const sid = String(sessionId);
    const requestedAt = Date.now();
    const detailOf = (event: Event): SubagentFrameDetail | null => {
      const detail = (event as CustomEvent<SubagentFrameDetail>).detail;
      return detail && detail.sessionId === sid ? detail : null;
    };

    const onLifecycle = (event: Event) => {
      const entry = parseSubagentLifecycle(detailOf(event)?.payload);
      if (entry) {
        setSubagents((prev) => mergeSubagentRoster(prev, [entry]));
      }
    };
    const onProgress = (event: Event) => {
      const progress = readProgress(detailOf(event)?.payload);
      if (progress) setSubagents((prev) => applyProgress(prev, progress));
    };

    window.addEventListener('subagent_lifecycle', onLifecycle);
    window.addEventListener('subagent_progress', onProgress);

    fetch(`/api/agent/${encodeURIComponent(sid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'get_subagents' }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (cancelled || !isRecord(body)) return;
        const payload = 'data' in body ? body.data : body;
        setSubagents((prev) => mergeSubagentRoster(prev, parseSubagentRosterResponse(payload), requestedAt));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      window.removeEventListener('subagent_lifecycle', onLifecycle);
      window.removeEventListener('subagent_progress', onProgress);
    };
  }, [isActiveSession, sessionId]);

  const hint = isLoading ? 'Loading subagents…' : subagents.length === 0 ? 'No subagent activity' : null;

  return (
    <div className="pl-6 pr-0 space-y-0.5 py-0.5">
      {hint ? (
        <div className="px-2 py-1 text-xs italic text-ink/40 flex items-center">
          <span className="w-4 h-4 shrink-0" />
          <span className="w-2 shrink-0" />
          <span className="flex-1 min-w-0 truncate">{hint}</span>
        </div>
      ) : (
        subagents.map((subagent) => {
          const taskText = subagent.task ?? subagent.description ?? subagent.assignment ?? subagent.agent ?? '';
          const isViewed = subagent.id === viewedSubagentId;
          return (
            <button
              key={subagent.id}
              type="button"
              title={taskText}
              onClick={() => window.dispatchEvent(new CustomEvent('omp:view-subagent', { detail: { sessionId: String(sessionId), subagent } }))}
              className={`w-full flex items-center text-left text-xs rounded-md px-2 py-1 cursor-pointer transition-colors select-none group/subagent ${isViewed ? 'bg-ink/10 font-medium text-ink' : 'text-ink/70 hover:text-ink hover:bg-ink/5'}`}
            >
              {/* Subagent status icon slot - aligned straight with session item text */}
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                <SubagentStatusIcon status={subagent.status} live={isActiveSession && subagent.status === 'started'} size={11} />
              </span>

              {/* Gap between subagent icon and task text */}
              <span className="w-2 shrink-0" />

              {/* Subagent task description text */}
              <span className="flex-1 min-w-0 truncate leading-snug">{taskText}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
