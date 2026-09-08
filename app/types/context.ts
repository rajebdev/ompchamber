export interface ContextTokenBreakdown {
  total: number;
  input: number;
  output: number;
  reasoning: number;
  cache: {
    write: number;
    read: number;
  };
}

export interface RawMessageInfo {
  id: string;
  parentID?: string;
  role: 'user' | 'assistant' | 'system';
  mode?: string;
  agent?: string;
  path?: {
    cwd: string;
    root: string;
  };
  cost: number;
  tokens: ContextTokenBreakdown;
  modelID: string;
  contentSnippet?: string;
  toolSummary?: string;
  timestamp?: string;
}

export interface RawMessageItem {
  id: string;
  type: string;
  badgeLabel: string;
  tokenSummary: string;
  timestamp: string;
  info: RawMessageInfo;
  rawPayload: Record<string, any>;
}

export interface ContextCostBreakdown {
  /** Fresh (uncached) prompt cost — often labelled "cache miss". */
  input: number;
  output: number;
  /** Served-from-cache cost — labelled "cache hit". */
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface SessionContextTelemetry {
  sessionId: string;
  sessionTitle: string;
  modelId: string;
  modelName: string;
  timestamp: string;
  contextUsed: number;
  contextLimit: number;
  contextPercent: number;
  messagesCount: number;
  userCount: number;
  assistantCount: number;
  totalCost: number;
  costFormatted: string;
  /** Average cache-hit rate (%) across assistant turns. */
  cacheHitAverage?: number;
  /** Per-category cost breakdown for the cost detail popup. */
  costBreakdown?: ContextCostBreakdown;
  lastMessage: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    cacheHitPercent: number;
  };
  distribution: {
    userTokens: number;
    userPercent: number;
    assistantTokens: number;
    assistantPercent: number;
    toolTokens: number;
    toolPercent: number;
    otherTokens: number;
    otherPercent: number;
  };
  rawMessages: RawMessageItem[];
}
