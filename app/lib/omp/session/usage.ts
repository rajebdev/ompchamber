/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Real token/cost usage aggregation from oh-my-pi session files
 * (~/.omp/agent/sessions/<project>/*.jsonl). Faithful to the omp session
 * format parsed by lib/omp/session (usage blocks with input/output/cache/
 * reasoning tokens and per-message cost). Powers /api/telemetry/tokens in
 * real mode so telemetry reflects actual omp activity instead of zeros.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { getSessionsDir } from '@/lib/omp/core/paths';
import { parseJsonlLenient } from '@/lib/omp/session/jsonl';
import type { TokenUsageMetricSet, BreakdownRow, ChartSeriesPoint, CadenceType, TimeRangeType } from '@/types';

interface OmpUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number };
}

interface UsageEntry {
  type?: string;
  timestamp?: string;
  message?: { usage?: OmpUsage; model?: string; provider?: string };
}

export type UsageWindow =
  | { kind: 'preset'; range: Exclude<TimeRangeType, 'custom'> }
  | { kind: 'custom'; from: string; to: string }
  | { kind: 'all' };

const PRESET_DAYS: Record<Exclude<TimeRangeType, 'custom' | 'all'>, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 };

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: UsageAggregate }>();

export interface UsageAggregate {
  scannedTranscripts: number;
  usageRecords: number;
  costTotal: number;
  costInput: number;
  costOutput: number;
  costCacheRead: number;
  costCacheWrite: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  activeDays: Set<string>;
  byModel: Map<string, { tokens: number; cost: number }>;
  byDay: Map<string, { tokens: number; cost: number }>;
  byProject: Map<string, { tokens: number; cost: number }>;
}

function emptyAggregate(): UsageAggregate {
  return {
    scannedTranscripts: 0,
    usageRecords: 0,
    costTotal: 0,
    costInput: 0,
    costOutput: 0,
    costCacheRead: 0,
    costCacheWrite: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    activeDays: new Set(),
    byModel: new Map(),
    byDay: new Map(),
    byProject: new Map(),
  };
}

function bump(map: Map<string, { tokens: number; cost: number }>, key: string, tokens: number, cost: number): void {
  const current = map.get(key) ?? { tokens: 0, cost: 0 };
  current.tokens += tokens;
  current.cost += cost;
  map.set(key, current);
}

function inRange(timestampIso: string | undefined, window: UsageWindow, now: number): boolean {
  if (window.kind === 'all') return true;
  if (!timestampIso) return true; // keep entries without timestamps (conservative)
  const ts = Date.parse(timestampIso);
  if (Number.isNaN(ts)) return true;
  if (window.kind === 'custom') {
    const from = Date.parse(`${window.from}T00:00:00`);
    const to = Date.parse(`${window.to}T23:59:59.999`);
    if (Number.isNaN(from) || Number.isNaN(to) || from > to) return true;
    return ts >= from && ts <= to;
  }
  if (window.range === 'today') {
    const d = new Date(ts);
    const n = new Date(now);
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  if (window.range === 'all') return true;
  return now - ts <= PRESET_DAYS[window.range] * 24 * 60 * 60 * 1000;
}

function cacheKey(window: UsageWindow): string {
  if (window.kind === 'all') return 'all';
  if (window.kind === 'custom') return `custom:${window.from}:${window.to}`;
  return window.range;
}

/** Aggregate all omp session files within a time window. Cached for 60s. */
export function aggregateUsage(window: UsageWindow): UsageAggregate {
  const key = cacheKey(window);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  const sessionsRoot = getSessionsDir();
  const aggregate = emptyAggregate();
  const now = Date.now();
  let projectDirs: string[] = [];
  try {
    projectDirs = readdirSync(sessionsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() || d.isFile())
      .map((d) => d.name);
  } catch {
    cache.set(key, { at: Date.now(), data: aggregate });
    return aggregate;
  }

  for (const project of projectDirs) {
    const projectPath = join(sessionsRoot, project);
    let files: string[] = [];
    try {
      if (statSync(projectPath).isFile()) {
        files = project.endsWith('.jsonl') ? [projectPath] : [];
      } else {
        files = readdirSync(projectPath)
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => join(projectPath, f));
      }
    } catch {
      continue;
    }

    for (const file of files) {
      aggregate.scannedTranscripts++;
      try {
        if (statSync(file).size > 64 * 1024 * 1024) continue;
        const entries = parseJsonlLenient<UsageEntry>(readFileSync(file, 'utf8'));
        for (const entry of entries) {
          if (entry.type !== 'message' || !entry.message?.usage) continue;
          const ts = entry.timestamp;
          if (!inRange(ts, window, now)) continue;
          const usage = entry.message.usage;
          const cost = usage.cost?.total ?? 0;
          const total = usage.totalTokens ?? (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
          aggregate.usageRecords++;
          aggregate.costTotal += cost;
          aggregate.costInput += usage.cost?.input ?? 0;
          aggregate.costOutput += usage.cost?.output ?? 0;
          aggregate.costCacheRead += usage.cost?.cacheRead ?? 0;
          aggregate.costCacheWrite += usage.cost?.cacheWrite ?? 0;
          aggregate.inputTokens += usage.input ?? 0;
          aggregate.outputTokens += usage.output ?? 0;
          aggregate.cacheReadTokens += usage.cacheRead ?? 0;
          aggregate.cacheWriteTokens += usage.cacheWrite ?? 0;
          aggregate.reasoningTokens += usage.reasoningTokens ?? 0;
          if (ts) {
            const day = ts.slice(0, 10);
            aggregate.activeDays.add(day);
            bump(aggregate.byDay, day, total, cost);
          }
          const model = entry.message.model || 'unknown';
          bump(aggregate.byModel, model, total, cost);
          bump(aggregate.byProject, project, total, cost);
        }
      } catch {
        // Unreadable transcript — skip rather than failing the whole report.
      }
    }
  }

  const data = aggregate;
  if (cache.size > 20) cache.clear();
  cache.set(key, { at: Date.now(), data });
  return data;
}

const fmtInt = (value: number): string => value.toLocaleString('en-US');
const fmtUsd = (value: number): string => `$${value.toFixed(2)}`;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function dayLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00`);
  return Number.isNaN(date.getTime()) ? dayKey : `${MONTH_LABELS[date.getMonth()]} ${date.getDate()}`;
}

function bucketKey(dayKey: string, cadence: CadenceType): string {
  if (cadence === 'monthly') return dayKey.slice(0, 7);
  if (cadence === 'weekly') {
    const date = new Date(`${dayKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dayKey;
    const monday = new Date(date);
    const shift = (date.getDay() + 6) % 7;
    monday.setDate(date.getDate() - shift);
    return monday.toISOString().slice(0, 10);
  }
  return dayKey;
}

function labelForBucket(key: string, cadence: CadenceType): string {
  if (cadence === 'monthly') {
    const [year, month] = key.split('-');
    const monthIndex = Number(month) - 1;
    const label = MONTH_LABELS[monthIndex] ?? key;
    return year && Number(year) !== new Date().getFullYear() ? `${label} ${year}` : label;
  }
  return dayLabel(key);
}

/** Shape the per-day aggregate into an ordered chart series for the cadence:
 * weekly buckets align to Monday, monthly to YYYY-MM, and the series is
 * truncated to the last 60 buckets so the SVG path stays readable. */
export function buildChartSeries(a: UsageAggregate, cadence: CadenceType): ChartSeriesPoint[] {
  const buckets = new Map<string, { cost: number; tokens: number }>();
  for (const [dayKey, v] of a.byDay) {
    const key = bucketKey(dayKey, cadence);
    const current = buckets.get(key) ?? { cost: 0, tokens: 0 };
    current.cost += v.cost;
    current.tokens += v.tokens;
    buckets.set(key, current);
  }
  return [...buckets.entries()]
    .sort(([aKey], [bKey]) => (aKey < bKey ? -1 : aKey > bKey ? 1 : 0))
    .slice(-60)
    .map(([key, v]) => ({ label: labelForBucket(key, cadence), cost: v.cost, tokens: v.tokens }));
}

export function toMetricSet(a: UsageAggregate, cadence: CadenceType = 'daily'): TokenUsageMetricSet {
  const observedInput = a.inputTokens + a.cacheReadTokens;
  const cachedPercent = observedInput > 0 ? ((a.cacheReadTokens / observedInput) * 100).toFixed(1) : '0.0';
  const unit = cadence === 'weekly' ? 'week' : cadence === 'monthly' ? 'month' : 'day';
  return {
    rawCost: fmtUsd(a.costTotal),
    processedTokens: fmtInt(a.inputTokens + a.outputTokens + a.cacheReadTokens + a.cacheWriteTokens),
    activeRate: `${a.activeDays.size} active ${unit}${a.activeDays.size === 1 ? '' : 's'}`,
    cachedInput: fmtInt(a.cacheReadTokens),
    cachedPercent: `${cachedPercent}% of observed input`,
    uncachedInput: fmtInt(a.inputTokens),
    outputTokens: fmtInt(a.outputTokens),
    reasoning: `includes ${fmtInt(a.reasoningTokens)} reasoning`,
    cacheSavings: fmtUsd(a.costCacheRead),
    scannedTranscripts: a.scannedTranscripts,
    usageRecords: a.usageRecords,
  };
}

const BREAKDOWN_DOT_COLORS = [
  'bg-[var(--theme-ink)]',
  'bg-[var(--theme-ink)]/70',
  'bg-[var(--theme-ink)]/50',
  'bg-[var(--theme-ink)]/35',
  'bg-[var(--theme-ink)]/20',
] as const;

/** Build breakdown rows (model/day/project) from the aggregate; the `day` tab
 * is bucketed by the cadence (day/week/month) so it stays consistent with the chart. */
export function toBreakdownRows(
  a: UsageAggregate,
  tab: 'model' | 'day' | 'project',
  cadence: CadenceType = 'daily',
): BreakdownRow[] {
  if (tab === 'day' && cadence !== 'daily') {
    const buckets = new Map<string, { tokens: number; cost: number }>();
    for (const [dayKey, v] of a.byDay) {
      const key = bucketKey(dayKey, cadence);
      const current = buckets.get(key) ?? { tokens: 0, cost: 0 };
      current.tokens += v.tokens;
      current.cost += v.cost;
      buckets.set(key, current);
    }
    const merged: UsageAggregate = { ...a, byDay: buckets };
    return toBreakdownRows(merged, 'day', 'daily');
  }
  const source = tab === 'model' ? a.byModel : tab === 'day' ? a.byDay : a.byProject;
  return [...source.entries()]
    .map(([name, v]) => ({
      name: tab === 'day' ? labelForBucket(name, cadence) : name,
      tokens: v.tokens,
      cost: v.cost,
      sharePercent: a.costTotal > 0 ? Math.round((v.cost / a.costTotal) * 100) : 0,
    }))
    .sort((x, y) => y.cost - x.cost)
    .slice(0, 12)
    .map((row, index) => ({
      name: row.name,
      tokens: fmtInt(row.tokens),
      cost: fmtUsd(row.cost),
      share: `${row.sharePercent}%`,
      sharePercent: row.sharePercent,
      dotColorClass: BREAKDOWN_DOT_COLORS[index % BREAKDOWN_DOT_COLORS.length],
    }));
}
