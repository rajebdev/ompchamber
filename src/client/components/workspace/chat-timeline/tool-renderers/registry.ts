/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which specialized panel renders a tool call — as DATA, not as a chain of
 * `if`s plus a probe render.
 *
 * The previous shape dispatched by walking 33 aliases and asked whether a tool
 * had a panel by CALLING the renderer and discarding its VNode
 * (`hasToolDetailsPanel` → `ToolDetailsPanel({tool}) !== null`). That probe ran
 * on every render of every card, and because the timeline re-renders a tool on
 * each streaming frame, it built the panel's tree twice per frame for a call
 * that had not finished. It also could not be tested without mounting, and
 * adding a tool meant editing two places.
 *
 * `toolPanelKind` is pure and total; the component map in `index.tsx` is keyed
 * by the same strings, so a new tool is one row here.
 */

import type { ToolCallData } from '@/shared/types/chat';

/** Legacy chamber/MOCK alias → canonical omp tool name. */
export const TOOL_ALIASES: Record<string, string> = {
  read_file: 'read',
  view_file: 'read',
  read_file_content: 'read',
  edit_file: 'edit',
  create_file: 'write',
  write_to_file: 'write',
  replace_file_content: 'edit',
  multi_edit_file: 'edit',
  terminal: 'bash',
  run_command: 'bash',
  ast_grep: 'grep',
  new_context: 'context_notes',
  rewind: 'checkpoint',
  retain: 'memory_edit',
  recall: 'memory_edit',
  reflect: 'memory_edit',
  learn: 'memory_edit',
  yield: 'goal',
};

/** Panel key. `search_fs` is deliberately distinct from `grep`: the two render
 *  different components (a filesystem item list vs. a match list). */
export type ToolPanelKind =
  | 'read' | 'edit' | 'write' | 'bash' | 'eval' | 'grep' | 'search_fs'
  | 'todo' | 'task' | 'web_search' | 'lsp' | 'ast_edit'
  | 'resolve' | 'reject' | 'hub' | 'github' | 'checkpoint'
  | 'security_scan' | 'debug' | 'manage_skill' | 'context_notes'
  | 'memory_edit' | 'goal' | 'ask' | 'think' | 'mcp';

/** Keys that have a panel — a lookup, not a branch. */
const PANEL_KINDS: Record<string, ToolPanelKind> = {
  read: 'read', edit: 'edit', write: 'write', bash: 'bash', eval: 'eval',
  grep: 'grep', glob: 'grep', search_fs: 'search_fs',
  todo: 'todo', task: 'task', web_search: 'web_search',
  lsp: 'lsp', ast_edit: 'ast_edit', resolve: 'resolve', reject: 'reject',
  hub: 'hub', github: 'github', checkpoint: 'checkpoint',
  security_scan: 'security_scan', debug: 'debug', manage_skill: 'manage_skill',
  context_notes: 'context_notes', memory_edit: 'memory_edit', goal: 'goal',
  ask: 'ask', think: 'think',
};

/** Devices whose panel is not named after the device itself. */
const DEVICE_KINDS: Record<string, ToolPanelKind> = {
  ast_grep: 'grep',
  resolve: 'resolve',
  reject: 'reject',
  lsp: 'lsp',
  ast_edit: 'ast_edit',
  debug: 'debug',
};

function inputRecord(tool: ToolCallData): Record<string, unknown> | undefined {
  return tool.input && typeof tool.input === 'object' && tool.input !== null
    ? (tool.input as Record<string, unknown>)
    : undefined;
}

/**
 * The `xd://<device>` an omp virtual-device call targets, if any. A device call
 * arrives as `write xd://lsp` (or an `mcp__<tool>` name), so the device — not
 * the transport `write` — is what names the panel.
 *
 * `details.xdev.tool` carries the device in both spellings (`lsp` and
 * `xd://lsp` were both measured), so the prefix is stripped when present rather
 * than assumed absent.
 */
export function xdDevice(tool: ToolCallData): string | undefined {
  const details = tool.details as Record<string, unknown> | undefined;
  const xdev = details?.xdev;
  if (xdev && typeof xdev === 'object') {
    const name = (xdev as Record<string, unknown>).tool;
    if (typeof name === 'string' && name) {
      const bare = name.startsWith('xd://') ? name.slice('xd://'.length) : name;
      const device = bare.split(/[/?#\s]/)[0].toLowerCase();
      if (device) return device;
    }
  }
  const input = inputRecord(tool);
  const path = typeof input?.path === 'string' ? input.path : tool.target ?? '';
  if (!path.startsWith('xd://')) return undefined;
  return path.slice('xd://'.length).split(/[/?#\s]/)[0].toLowerCase() || undefined;
}

/**
 * The panel key for a tool call, or null when it has no specialized panel.
 *
 * Order is load-bearing: an omp virtual-device call names its panel through the
 * device (so `write xd://lsp` is an LSP panel, not a write panel), an MCP call
 * through its `mcp__` name, and only then does the tool's own name decide.
 */
export function toolPanelKind(tool: ToolCallData): ToolPanelKind | null {
  const device = xdDevice(tool);
  if (device) {
    if (device.startsWith('mcp__')) return 'mcp';
    const byDevice = DEVICE_KINDS[device];
    if (byDevice) return byDevice;
  }

  const raw = (tool.name || tool.type || '').toLowerCase();
  if (raw.startsWith('mcp__')) return 'mcp';
  return PANEL_KINDS[TOOL_ALIASES[raw] ?? raw] ?? null;
}
