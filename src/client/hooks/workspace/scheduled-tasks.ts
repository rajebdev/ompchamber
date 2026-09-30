/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client view of the scheduled tasks (SQLite `scheduled_tasks`, owned by the
 * server). Every mutation returns the canonical list, which replaces local
 * state wholesale — the same contract the follow-up queue panel uses, and for
 * the same reason: the runtime advances `next_run_at` on its own clock, so a
 * locally-merged list would drift from the one the server is actually running.
 *
 * Polled while the modal is open, because the interesting change is the one the
 * SERVER makes — a fire that just happened. A closed modal costs nothing.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { usePanelRefresh } from '@/client/hooks/workspace/panel-refresh';
import {
  SCHEDULE_BADGE_POLL_MS,
  SCHEDULE_POLL_MS,
  SCHEDULE_UPDATED_EVENT,
} from '@/shared/lib/workspace/refresh-cadence';
import type { ScheduleKind, ScheduledTask, ScheduledTaskModel, ScheduledTaskRun } from '@/shared/types/schedule';

export interface ScheduleDraft {
  name: string;
  prompt: string;
  kind: ScheduleKind;
  spec: string;
  folderId: number | null;
  sessionId: string | null;
  model: ScheduledTaskModel | null;
}

async function readList(res: Response): Promise<ScheduledTask[] | null> {
  const data = (await res.json().catch(() => null)) as { tasks?: ScheduledTask[]; error?: string } | null;
  if (!res.ok || !data || data.error) return null;
  return data.tasks ?? [];
}

export interface ScheduleController {
  tasks: ScheduledTask[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (draft: ScheduleDraft) => Promise<string | null>;
  patch: (id: string, patch: Partial<ScheduleDraft> & { enabled?: boolean }) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  runNow: (id: string) => Promise<string | null>;
  loadRuns: (id: string) => Promise<ScheduledTaskRun[]>;
}

export function useScheduledTasks(active: boolean): ScheduleController {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await readList(await fetch('/api/schedule'));
      if (list) {
        setTasks(list);
        setError(null);
      } else {
        setError('Could not load scheduled tasks.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load once on open, then keep up with the runtime's own writes while the
  // modal is visible. `usePanelRefresh` skips the first tick by design, which
  // is why the mount effect exists separately.
  useEffect(() => {
    if (!active || loadedRef.current) return;
    loadedRef.current = true;
    void refresh();
  }, [active, refresh]);
  usePanelRefresh(() => refresh(), active, SCHEDULE_POLL_MS);

  /** One write path for every mutation: POST/PATCH/DELETE all answer with the
   *  canonical list, so a success never needs a second round trip. */
  const mutate = useCallback(async (input: string, init: RequestInit): Promise<string | null> => {
    try {
      const res = await fetch(input, init);
      const data = (await res.json().catch(() => null)) as { tasks?: ScheduledTask[]; error?: string; sessionId?: string } | null;
      if (!res.ok || !data || data.error) {
        const message = data?.error ?? `HTTP ${res.status}`;
        setError(message);
        return message;
      }
      if (data.tasks) setTasks(data.tasks);
      setError(null);
      // Every write is announced: the toolbar badge polls on a slower cadence
      // than this modal, and without the event a task the user just paused
      // would keep its count until that poll came round.
      window.dispatchEvent(new CustomEvent(SCHEDULE_UPDATED_EVENT));
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return message;
    }
  }, []);

  const create = useCallback(async (draft: ScheduleDraft) => {
    const failure = await mutate('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    return failure;
  }, [mutate]);

  const patch = useCallback(async (id: string, body: Partial<ScheduleDraft> & { enabled?: boolean }) => {
    return mutate(`/api/schedule?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }, [mutate]);

  const remove = useCallback(async (id: string) => {
    return mutate(`/api/schedule?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  }, [mutate]);

  const runNow = useCallback(async (id: string) => {
    const failure = await mutate(`/api/schedule?id=${encodeURIComponent(id)}&run=now`, { method: 'POST' });
    return failure;
  }, [mutate]);

  const loadRuns = useCallback(async (id: string): Promise<ScheduledTaskRun[]> => {
    try {
      const res = await fetch(`/api/schedule/${encodeURIComponent(id)}/runs`);
      const data = (await res.json().catch(() => null)) as { runs?: ScheduledTaskRun[] } | null;
      return res.ok ? data?.runs ?? [] : [];
    } catch {
      return [];
    }
  }, []);

  return { tasks, loading, error, refresh, create, patch, remove, runNow, loadRuns };
}

/**
 * How many tasks are armed, for the sidebar button's badge.
 *
 * A separate read from `useScheduledTasks` because the sidebar renders it on
 * every session list refresh — where the modal is closed and the full task list
 * (with its run history columns) would be payload nobody looks at. The count is
 * what makes the Calendar button say whether anything is scheduled at all; a
 * button that opens a list you cannot see the state of is what the mock was.
 */
export function useScheduledTaskCount(): number {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/schedule');
      const data = (await res.json().catch(() => null)) as { tasks?: ScheduledTask[] } | null;
      if (!res.ok || !data?.tasks) return;
      setCount(data.tasks.filter((task) => task.enabled).length);
    } catch {
      // A badge is decorative: a failed read leaves the last known count.
    }
  }, []);
  usePanelRefresh(refresh, true, SCHEDULE_BADGE_POLL_MS);
  useEffect(() => {
    void refresh();
    // The badge is a derived read of the same table the modal writes to, so it
    // follows that write rather than waiting out its own interval.
    const onUpdate = () => void refresh();
    window.addEventListener(SCHEDULE_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(SCHEDULE_UPDATED_EVENT, onUpdate);
  }, [refresh]);
  return count;
}
