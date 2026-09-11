import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { SubagentStatusIcon } from '@/components/common/SubagentStatusIcon';
import { isRecord } from '@/lib/omp/session/parse-message-blocks';
import { fetchSubagentHistory, formatSubagentMeta, historyEntryToSubagentInfo } from '@/lib/omp/subagent/history-client';
import { mergeSubagentRoster, parseSubagentActivityEvent, parseSubagentLifecycle, parseSubagentProgress, parseSubagentRosterResponse } from '@/lib/omp/subagent/parse';
import type { SubagentActivityEvent, SubagentInfo, SubagentProgress } from '@/types';

type SubagentListProps = { sessionId: string | number; isActiveSession: boolean };

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
 * Subagent roster nested under a session row: seeded from the on-disk history
 * route for every session (finished runs survive reloads and dead parents),
 * then — for the active session only — hydrated from `get_subagents` and folded
 * from the live window frames the parent SSE stream dispatches.
 */
export function SubagentList({ sessionId, isActiveSession }: SubagentListProps) {
  const [subagents, setSubagents] = useState<SubagentInfo[]>([]);
  const [activities, setActivities] = useState<Record<string, SubagentActivityEvent>>({});
  const [isLoading, setIsLoading] = useState(false);

  // History pass: the roster floor for every session. Live entries merged in
  // by the effect below always win for the same id (`mergeSubagentRoster`).
  useEffect(() => {
    let cancelled = false;
    const sid = String(sessionId);
    setSubagents([]);
    setActivities({});
    setIsLoading(true);
    void fetchSubagentHistory(sid)
      .then((entries) => {
        if (cancelled || !entries) return;
        setSubagents((prev) => mergeSubagentRoster(prev, entries.map(historyEntryToSubagentInfo)));
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  // Live pass: active session only. `requestedAt` fences the get_subagents
  // snapshot so entries touched by a newer frame cannot regress to it.
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
      if (entry) setSubagents((prev) => mergeSubagentRoster(prev, [entry]));
    };
    const onProgress = (event: Event) => {
      const progress = readProgress(detailOf(event)?.payload);
      if (progress) setSubagents((prev) => applyProgress(prev, progress));
    };
    const onActivity = (event: Event) => {
      const payload = detailOf(event)?.payload;
      if (!isRecord(payload)) return;
      const id = payload.id;
      if (typeof id !== 'string' || id.length === 0) return;
      const activity = parseSubagentActivityEvent(payload);
      if (activity) setActivities((prev) => ({ ...prev, [id]: activity }));
    };

    window.addEventListener('subagent_lifecycle', onLifecycle);
    window.addEventListener('subagent_progress', onProgress);
    window.addEventListener('subagent_event', onActivity);

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
      window.removeEventListener('subagent_event', onActivity);
    };
  }, [isActiveSession, sessionId]);

  const hint = isLoading ? 'Loading subagents…' : subagents.length === 0 ? 'No subagent activity' : null;

  return (
    <div className="ml-3 space-y-0.5 border-l border-ink/10 py-0.5 pl-2">
      {hint ? (
        <div className="px-1.5 py-1 text-[10px] italic text-ink/40">{hint}</div>
      ) : (
        subagents.map((subagent) => {
          const isHistory = subagent.source === 'history';
          const isRunning = subagent.status === 'started';
          const activity = isRunning && !isHistory ? activities[subagent.id] : undefined;
          const taskText = subagent.task ?? subagent.description ?? subagent.assignment ?? '';
          const meta = formatSubagentMeta(subagent);
          return (
            <button
              key={subagent.id}
              type="button"
              title={taskText || subagent.agent}
              onClick={() => window.dispatchEvent(new CustomEvent('omp:view-subagent', { detail: { sessionId: String(sessionId), subagent } }))}
              className="flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-ink/5"
            >
              <SubagentStatusIcon status={subagent.status} live={isRunning && !isHistory} size={12} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="shrink-0 font-mono text-[10px] text-ink/80">{subagent.agent}</span>
                  {taskText && <span className="truncate text-[10px] text-ink/45">{taskText}</span>}
                </span>
                {activity && (
                  <span className="mt-0.5 block truncate text-[10px] text-ink/40" title={activity.label}>
                    {activity.label}
                  </span>
                )}
              </span>
              {meta && <span className="shrink-0 font-mono text-[9px] text-ink/40">{meta}</span>}
              <ChevronRight size={10} className="shrink-0 text-ink/30" />
            </button>
          );
        })
      )}
    </div>
  );
}
