import React from 'react';

export interface Attachment {
  id: string;
  name?: string;
  file: File;
  preview: string;
  type?: string;
  size?: number;
  /** Base64 payload for image attachments (sent to the omp model). */
  dataBase64?: string;
}

export type ChatAttachment = Attachment;

/** Nama tool omp asli (built-in + hidden + MCP). `string` menampung tool
 *  custom/plugin dan MCP (`mcp__<server>_<tool>`). */
export type ToolType =
  | 'bash'
  | 'terminal'
  | 'read'
  | 'edit'
  | 'write'
  | 'ast_grep'
  | 'ast_edit'
  | 'ask'
  | 'debug'
  | 'eval'
  | 'github'
  | 'glob'
  | 'grep'
  | 'lsp'
  | 'checkpoint'
  | 'rewind'
  | 'context_notes'
  | 'new_context'
  | 'security_scan'
  | 'task'
  | 'hub'
  | 'todo'
  | 'web_search'
  | 'memory_edit'
  | 'retain'
  | 'recall'
  | 'reflect'
  | 'learn'
  | 'manage_skill'
  | 'yield'
  | 'goal'
  | 'think'
  | 'edit_file' // legacy alias (MOCK path)
  | 'read_file' // legacy alias (MOCK path)
  | 'view_file' // legacy alias (MOCK path)
  | 'create_file' // legacy alias (MOCK path)
  | 'search_fs' // legacy alias (MOCK path)
  | 'custom'
  | (string & {});

export type ToolStatus = 'pending' | 'running' | 'success' | 'error' | 'aborted' | 'skipped';

export interface ToolDiffChunk {
  file: string;
  added?: number;
  removed?: number;
  diffText?: string;
}

export interface ToolCallData {
  /** toolCallId dari omp — kunci pairing dengan toolResult. */
  id: string;
  type: ToolType;
  title: string;
  name?: string;
  /** Short human intent (omp arguments.i) — ditampilkan sebelum tools. */
  intent?: string;
  target?: string;
  command?: string;
  /** Raw arguments tool call (object dari omp, string dari MOCK path). */
  input?: string | Record<string, any>;
  output?: string;
  error?: string;
  status?: ToolStatus;
  duration?: string;
  /** Raw duration ms dari toolResult (untuk format ulang). */
  durationMs?: number;
  diff?: ToolDiffChunk;
  /** RAW details toolResult — dipakai renderer diff/task/usage. */
  details?: Record<string, any>;
  isError?: boolean;
  /** details.__synthetic === true → call emitted tapi tidak dieksekusi. */
  synthetic?: boolean;
  icon?: React.ReactNode;
  detail?: string;
  time?: string;
}

export interface ThinkingData {
  duration?: string;
  thought: string;
  summary?: string;
  steps?: string[];
  isGenerating?: boolean;
}

export interface AgentActionData {
  icon?: React.ReactNode;
  title: string;
  time?: string;
  detail: string;
  type?: ToolType;
  command?: string;
  output?: string;
  status?: ToolStatus;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'ai' | 'assistant';
  date?: string;
  timestamp?: string;
  content: string;
  attachments?: { id?: string; name: string; preview?: string; type?: string; size?: number }[];
  thinking?: ThinkingData | string;
  /** Short human intent for tool calls (omp arguments.i) shown before the tools. */
  intent?: string;
  /** System notice surfaced by omp (e.g. ultrathink-notice) — rendered as an
   *  alert row, not as assistant content. */
  notice?: string;
  toolCalls?: ToolCallData[];
  actions?: (AgentActionData | ToolCallData)[];
  systemNote?: string;
  actions2?: (AgentActionData | ToolCallData)[];
  attribution?: 'user' | 'agent' | string;
  model?: string;
  durationMs?: number;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number };
  };
  summary?: string;
  monologue?: string;
  /** Provider/API error attached to an assistant turn (e.g. 401 auth failure). */
  error?: {
    status?: number;
    id?: number;
    message?: string;
    stopReason?: string;
  };
}

export interface AIModelOption {
  id: string;
  name: string;
  provider: string;
  providerIcon?: string;
  contextWindow?: string | number;
  isCmdAgent?: boolean;
  isFavorite?: boolean;
  isRecent?: boolean;
  thinkingLevel?: string;
  /** Baked thinking ladder for this model: `["off", ...efforts]`. */
  thinkingLevels?: string[];
  capabilities?: string[];
  input?: string;
  output?: string;
  cost?: {
    input: string | number;
    output: string | number;
    cacheRead?: string | number;
    cacheWrite?: string | number;
  };
  description?: string;
}

// ── Real omp model registry (forked from omp-web) ──────────────────────────

/** One pickable model from the omp catalog (`/api/models` modelList). */
export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  supportsFastMode?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  /** Baked thinking ladder for this model: `["off", ...efforts]`. */
  thinkingLevels?: string[];
  /** Cost in $/1M tokens (omp catalog). */
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
}

/** A model selected by provider + modelId (omp's set_model shape). */
export interface SelectedModel {
  provider: string;
  modelId: string;
}

/** Model-level thinking metadata read off the live session state. */
export interface ThinkingModelMeta {
  provider: string;
  modelId: string;
  name?: string;
  reasoning?: boolean;
  thinking?: { efforts?: string[] };
}

/** Response shape of GET /api/models (mirrors omp-web ModelsData). */
export interface ModelsData {
  models: Record<string, string>;
  modelList: ModelEntry[];
  defaultModel: SelectedModel | null;
  thinkingLevels: Record<string, string[]>;
  connectedProviders?: { id: string; name: string; disabled: boolean }[];
  modelError?: string;
}

// ── Composer autocomplete (@file/agent / /command+skill) ───────────────────

/** Trigger group that opened the composer autocomplete: `@` → mention, `/` → command. */
export type ComposerPickKind = 'mention' | 'command';
/** Origin of a pickable item: an `@` mention is an agent or a workspace file. */
export type ComposerPickSource = 'agent' | 'file' | 'command' | 'skill';

/** A detected trigger: the `@`/`/` char plus the query typed after it. */
export interface ComposerTrigger {
  kind: ComposerPickKind;
  query: string;
  /** Index of the trigger char (`@` or `/`). */
  start: number;
  /** Caret index when detected. */
  end: number;
}

/** One autocomplete item surfaced in the composer popover. */
export interface ComposerPickItem {
  id: string;
  name: string;
  description: string;
  /** The item's own category (agent / file / command / skill). */
  kind: ComposerPickSource;
  source: ComposerPickSource;
  /** Exact insertion text WITHOUT trailing space: `@architect` | `@file:path/to/file` | `/review` | `/skill:capacity`. */
  token: string;
  /** Workspace-relative path (file items only). */
  path?: string;
}

/** A pick item after filtering, with the matched range within `name` (or null). */
export interface ComposerMatchItem extends ComposerPickItem {
  /** Matched range within `name`; null = matched via description or empty query. */
  match: { start: number; end: number } | null;
}

