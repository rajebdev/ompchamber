export const CONTEXT_LIMIT = 1_000_000;

export interface OmpUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  /** Anchored prompt occupancy reported by the provider (never a per-turn total). */
  contextTokens?: number;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number };
}

export interface OmpContextSnapshot {
  promptTokens?: number;
  /** Estimated prompt tokens removed by local history rewrites after the snapshot. */
  historyRewriteTokensRemoved?: number;
  nonMessageTokens?: number;
  compactionEpoch?: number;
}

export interface OmpMessage {
  role?: string;
  content?: unknown;
  model?: string;
  provider?: string;
  usage?: OmpUsage;
  contextSnapshot?: OmpContextSnapshot;
  stopReason?: string;
  isError?: boolean;
}

export interface SessionEntry {
  type?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string | number;
  cwd?: string;
  title?: string;
  shortSummary?: string;
  message?: OmpMessage;
}
