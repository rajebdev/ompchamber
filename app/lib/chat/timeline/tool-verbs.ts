/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Activity phrases for the generating indicator, derived from the tool call the
 * agent is actually executing — so the docked row reads `Editing app/x.ts`
 * instead of a generic "Deep reasoning" while files are being written.
 *
 * Both render paths feed this module:
 *   - live omp events   → lib/chat/omp/agent-events.ts
 *                         (tool_execution_start + message_update.assistantMessageEvent)
 *   - mock SSE / reload → lib/chat/timeline/stream-callbacks.ts (ToolCallData)
 *
 * Canonical tool names are omp's builtin list
 * (`@oh-my-pi/pi-coding-agent` tools/builtin-names.ts). A `write xd://<device>`
 * call resolves through the inner device, so the phrase is `Running LSP …`
 * rather than `Writing xd://lsp`.
 */

import type { ToolCallData } from '@/types';
import { isRecord } from '@/lib/omp/session/parse-message-blocks';

/** Longest subject kept in the indicator; the tail is elided. */
const MAX_SUBJECT = 72;

/** Tool name → phrase stem. Stems ending in `:` take a noun-phrase subject. */
const TOOL_VERBS: Record<string, string> = {
  read: 'Reading',
  write: 'Writing',
  edit: 'Editing',
  ast_edit: 'Rewriting AST',
  ast_grep: 'Searching AST for',
  bash: 'Running',
  grep: 'Searching for',
  glob: 'Finding',
  task: 'Delegating to',
  todo: 'Updating plan:',
  hub: 'Hub:',
  eval: 'Running code in',
  lsp: 'Running LSP',
  debug: 'Debugging',
  github: 'GitHub:',
  web_search: 'Searching the web for',
  ask: 'Asking you',
  checkpoint: 'Checkpointing',
  rewind: 'Rewinding',
  context_notes: 'Updating context notes',
  new_context: 'Starting a fresh context',
  security_scan: 'Scanning for vulnerabilities',
  manage_skill: 'Updating skill',
  learn: 'Recording a lesson',
  retain: 'Retaining memory',
  recall: 'Recalling memory',
  reflect: 'Reflecting on',
  think: 'Thinking',
  yield: 'Wrapping up',
  goal: 'Tracking goal',
};

/**
 * Tools whose phrase is already complete without an object. Every other stem
 * reads as `<verb> <object>`, so a call that names no object — a model emitting
 * `bash` with empty arguments, or an argument key this module does not know —
 * falls back to the tool name instead of a dangling verb ("Running . . .").
 */
const SELF_CONTAINED: Record<string, true> = {
  debug: true,
  ask: true,
  checkpoint: true,
  rewind: true,
  context_notes: true,
  new_context: true,
  security_scan: true,
  manage_skill: true,
  learn: true,
  retain: true,
  recall: true,
  think: true,
  yield: true,
  goal: true,
};

/** Legacy chamber/MOCK tool aliases → canonical omp builtin name. */
const TOOL_ALIASES: Record<string, string> = {
  read_file: 'read',
  view_file: 'read',
  read_file_content: 'read',
  edit_file: 'edit',
  replace_file_content: 'edit',
  multi_edit_file: 'edit',
  write_to_file: 'write',
  create_file: 'write',
  search_fs: 'grep',
  terminal: 'bash',
  run_command: 'bash',
};

/** `xd://<device>` write phrases — the device, not `write`, names the action. */
const DEVICE_VERBS: Record<string, string> = {
  lsp: 'Running LSP',
  ast_edit: 'Rewriting AST',
  ast_grep: 'Searching AST for',
  resolve: 'Applying edit proposal',
  reject: 'Discarding edit proposal',
  report_issue: 'Reporting tool issue',
  debug: 'Debugging',
  browser: 'Driving the browser',
};

/** Phrase shown while the model streams reasoning / prose rather than tools. */
export const PHASE_VERBS = {
  thinking: 'Thinking',
  writing: 'Writing response',
  preparing: 'Preparing tool call',
  processing: 'Processing results',
} as const;

export interface ToolActivity {
  /** Canonical omp tool name; legacy chamber aliases are normalized. */
  name?: string;
  /** Raw tool arguments (live event stream) — the richest subject source. */
  args?: unknown;
  /** Raw tool arguments from a chamber ToolCallData. */
  input?: unknown;
  /** Pre-extracted command/target from a chamber ToolCallData. */
  command?: string;
  target?: string;
  /** omp's `i` field: the model's own one-line intent, used as a fallback. */
  intent?: string;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** First string found for any key; array values yield their first string. */
function pick(args: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    const direct = asString(value);
    if (direct) return direct;
    if (Array.isArray(value)) {
      const first = value.find((entry) => asString(entry) !== undefined);
      if (first !== undefined) return asString(first);
    }
  }
  return undefined;
}

function truncate(value: string): string {
  return value.length <= MAX_SUBJECT ? value : `${value.slice(0, MAX_SUBJECT - 1)}…`;
}

function quote(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^["'`]/.test(value) ? value : `"${value}"`;
}

function taskSubject(args: Record<string, unknown>): string | undefined {
  const name = asString(args.name);
  const tasks = Array.isArray(args.tasks) ? args.tasks : [];
  const first = tasks.find(isRecord);
  const label = name ?? (first ? asString(first.name) : undefined);
  const agent = asString(args.agent) ?? (first ? asString(first.agent) : undefined);
  if (label && agent) return `${label} (${agent})`;
  return label ?? agent;
}

function askSubject(args: Record<string, unknown>): string | undefined {
  const questions = Array.isArray(args.questions) ? args.questions : [];
  const first = questions.find(isRecord);
  if (!first) return undefined;
  return asString(first.header) ?? asString(first.question);
}

function retainSubject(args: Record<string, unknown>): string | undefined {
  const items = Array.isArray(args.items) ? args.items : [];
  const first = items.find(isRecord);
  return first ? quote(asString(first.content)) : undefined;
}

/** Subject (object of the phrase) for one canonical tool name. */
function subjectFor(name: string, args: Record<string, unknown>): string | undefined {
  switch (name) {
    case 'read':
    case 'write':
    case 'edit':
      return pick(args, ['path', 'file', 'AbsolutePath', 'TargetFile']);
    case 'ast_edit':
      return pick(args, ['paths', 'path']);
    case 'ast_grep':
      return quote(pick(args, ['pat']));
    case 'bash':
      return pick(args, ['command', 'cmd', 'CommandLine']);
    case 'grep': {
      const pattern = pick(args, ['pattern']);
      const scope = pick(args, ['path', 'paths']);
      if (!pattern) return scope;
      return scope ? `${quote(pattern)} in ${scope}` : quote(pattern);
    }
    case 'glob':
      return pick(args, ['path', 'pattern']);
    case 'web_search':
      return quote(pick(args, ['query']));
    case 'task':
      return taskSubject(args);
    case 'hub':
      return [pick(args, ['op']), pick(args, ['name'])].filter(Boolean).join(' ') || undefined;
    case 'todo':
      return pick(args, ['op']);
    case 'eval':
      return pick(args, ['language']);
    case 'lsp':
      return [pick(args, ['action']), pick(args, ['symbol', 'file'])].filter(Boolean).join(' ') || undefined;
    case 'debug':
      return pick(args, ['action', 'program']);
    case 'github':
      return [pick(args, ['op']), pick(args, ['repo', 'pr', 'query'])].filter(Boolean).join(' ') || undefined;
    case 'ask':
      return askSubject(args);
    case 'checkpoint':
      return pick(args, ['goal']);
    case 'manage_skill':
      return pick(args, ['name']);
    case 'recall':
    case 'reflect':
      return quote(pick(args, ['query']));
    case 'security_scan':
      return pick(args, ['target_kind', 'include_paths']);
    case 'retain':
      return retainSubject(args);
    default:
      return pick(args, ['path', 'command', 'query', 'pattern', 'name', 'target', 'prose']);
  }
}

/** Inner `xd://<device>` name carried by a write call, if any. */
function xdDeviceOf(args: Record<string, unknown>, tool: ToolActivity): string | undefined {
  const candidate = pick(args, ['path', 'target']) ?? asString(tool.target) ?? asString(tool.command);
  if (!candidate || !candidate.startsWith('xd://')) return undefined;
  const device = candidate.slice('xd://'.length).split(/[/?#\s]/)[0];
  return device || undefined;
}

/** Inner device arguments: a `write xd://…` payload is JSON in `content`.
 *  The transport keys are always dropped so the phrase never echoes the
 *  device URL; prose payloads (resolve/reject/report_issue) surface their
 *  first line as the subject instead. */
function deviceArgs(args: Record<string, unknown>): Record<string, unknown> {
  const { path: _path, target: _target, command: _command, i: _i, ...rest } = args;
  const content = args.content;
  if (typeof content !== 'string') return rest;
  try {
    const parsed: unknown = JSON.parse(content);
    if (isRecord(parsed)) return { ...rest, ...parsed };
  } catch {
    // Not JSON: fall through to the prose form.
  }
  const firstLine = content.trim().split('\n', 1)[0]?.trim();
  return firstLine ? { ...rest, prose: firstLine } : rest;
}

/** Build the args record for a call, backfilling from chamber ToolCallData fields. */
function argsOf(tool: ToolActivity): Record<string, unknown> {
  const source = isRecord(tool.args) ? tool.args : isRecord(tool.input) ? tool.input : {};
  const args: Record<string, unknown> = { ...source };
  if (tool.command && asString(args.command) === undefined && asString(args.cmd) === undefined) {
    args.command = tool.command;
  }
  if (tool.target && asString(args.path) === undefined) args.path = tool.target;
  return args;
}

/** Phrase for the tool call the agent is executing right now. */
export function describeToolActivity(tool: ToolActivity): string {
  const rawName = asString(tool.name) ?? '';
  const name = TOOL_ALIASES[rawName.toLowerCase()] ?? rawName.toLowerCase();
  const args = argsOf(tool);
  // The model's own one-liner (omp's `i` field, or the intent it resolved for
  // the execution event) is a better subject than anything derived here.
  const intent = asString(tool.intent) ?? pick(args, ['i']);

  const device = xdDeviceOf(args, tool);
  if (device) {
    const known = DEVICE_VERBS[device];
    const verb = known ?? `Running ${device}`;
    const subject = subjectFor(device, deviceArgs(args));
    if (subject) return truncate(`${verb} ${subject}`);
    if (intent) return truncate(intent);
    return truncate(Boolean(known) && !SELF_CONTAINED[device] ? device : verb);
  }

  const stem = TOOL_VERBS[name];
  const verb = stem ?? (name ? `Running ${name}` : 'Working');
  const subject = subjectFor(name, args);
  if (subject) return truncate(`${verb} ${subject}`);
  if (intent) return truncate(intent);
  // An object-taking stem with nothing to name would dangle ("Running . . ."),
  // so the tool itself becomes the phrase. Derived (`Running <tool>`) and
  // self-contained stems already read as complete activities.
  return truncate(Boolean(stem) && Boolean(name) && !SELF_CONTAINED[name] ? name : verb);
}

/** Phrase for a chamber ToolCallData row (mock SSE path and reloaded history). */
export function describeToolCall(tool: ToolCallData): string {
  return describeToolActivity({
    name: tool.name ?? tool.type,
    input: tool.input,
    command: tool.command,
    target: tool.target,
    intent: tool.intent,
  });
}

/**
 * Phrase for an `AssistantMessageEvent` riding a `message_update` frame —
 * `thinking_delta` → Thinking, `text_delta` → Writing response, and
 * `toolcall_end` → the concrete tool phrase before execution even starts.
 */
export function describeAssistantPhase(event: unknown): string | undefined {
  if (!isRecord(event)) return undefined;
  const type = asString(event.type);
  if (!type) return undefined;
  if (type.startsWith('thinking')) return PHASE_VERBS.thinking;
  if (type.startsWith('text')) return PHASE_VERBS.writing;
  if (type === 'toolcall_start' || type === 'toolcall_delta') return PHASE_VERBS.preparing;
  if (type === 'toolcall_end') {
    const call = event.toolCall;
    if (!isRecord(call)) return undefined;
    return describeToolActivity({ name: asString(call.name), args: call.arguments });
  }
  return undefined;
}
