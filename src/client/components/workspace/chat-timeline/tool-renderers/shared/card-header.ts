/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What a tool card's header says: its title and the one line under it.
 *
 * This was a chain of `else if` inside the card, which made the header
 * inseparable from the markup and pushed the file past the repo's size ceiling.
 * It is a pure function of the tool call now, so the naming rules can be read
 * (and tested) without mounting anything.
 *
 * The title comes from the tool's own name; the subtitle is the most specific
 * identifier available — a device's action, an eval's own label, an MCP tool's
 * subject, the target path. A subtitle is never a raw `xd://` URL: the device
 * names the action, and the URL is transport.
 */

import type { ToolCallData } from '@/shared/types/chat';
import { toTitleCase } from '@/shared/lib/chat/title-case';
import { parseAskQuestions } from '@/shared/lib/chat/ask-questions';
import { resolveTargetFile } from '@/client/components/workspace/chat-timeline/tool-renderers';
import {
  evalInputTitle,
  mcpSubjectOf,
  mcpToolNameOf,
  xdevOf,
} from '@/client/components/workspace/chat-timeline/tool-renderers/shared/card-helpers';

export interface ToolCardHeader {
  title: string;
  subtitle?: string;
}

/** One line under the title, capped so it never eats the header row. */
function clip(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function subtitleFromTitle(title: string): { title: string; subtitle?: string } | null {
  const parts = title.split(/\s+[—\-:]\s+/);
  if (parts.length < 2) return null;
  return { title: toTitleCase(parts[0].trim()), subtitle: parts.slice(1).join(' — ').trim() };
}

export function toolCardHeader(tool: ToolCallData, toolKey: string): ToolCardHeader {
  // ── device calls: the device's own action names it ────────────────────────
  if (toolKey === 'lsp' || toolKey === 'ast_edit') {
    const xdev = xdevOf(tool);
    const action = xdev?.args?.action;
    const file = xdev?.args?.file ?? xdev?.args?.paths?.[0];
    return {
      title: toolKey === 'lsp' ? 'LSP' : 'AST Edit',
      subtitle: [action, file].filter(Boolean).join(' · ') || undefined,
    };
  }
  if (toolKey === 'resolve' || toolKey === 'reject') {
    return { title: toolKey === 'resolve' ? 'Resolve Proposal' : 'Reject Proposal' };
  }

  // ── todo / ask ────────────────────────────────────────────────────────────
  // A todo's progress is a FACT, not a title line: `toolSummary` derives it from
  // `details.phases` — the same source the Todo panel reads — so it renders as a
  // chip. Naming it in the subtitle too would be the second reader of one
  // quantity, and the two disagreed: this used to parse the result's TEXT, which
  // a `todo` call does not always carry.
  if (toolKey === 'todo' || tool.name === 'todo' || tool.type === 'todo') {
    return { title: 'Todo' };
  }
  if (toolKey === 'ask') {
    const asked = parseAskQuestions(tool).length;
    return { title: 'Question', subtitle: asked > 0 ? `Asked ${asked} question${asked === 1 ? '' : 's'}` : undefined };
  }

  // ── eval: `input.title` is omp's own label for the cell ──────────────────
  const evalTitle = toolKey === 'eval' ? evalInputTitle(tool) : undefined;
  if (evalTitle) return { title: evalTitle, subtitle: undefined };

  // ── MCP: the tool names the action, never the transport ──────────────────
  const mcpName = mcpToolNameOf(tool);
  if (mcpName) {
    const subject = mcpSubjectOf(tool);
    return { title: toTitleCase(mcpName), subtitle: subject ? clip(subject) : undefined };
  }

  // ── generic: a "name — subject" title splits, otherwise the name stands ──
  const fromTitle = tool.title ? subtitleFromTitle(tool.title) : null;
  if (fromTitle) return { title: fromTitle.title, subtitle: fromTitle.subtitle };

  // The `task` tool carries its subagent in `tasks[0]`, not in its title.
  if (toolKey === 'task' && tool.input && typeof tool.input === 'object') {
    const tasks = (tool.input as Record<string, unknown>).tasks;
    const first = Array.isArray(tasks) ? tasks[0] : undefined;
    if (first && typeof first === 'object') {
      const name = (first as Record<string, unknown>).name;
      const agent = (first as Record<string, unknown>).agent;
      if (typeof name === 'string' && name) {
        return { title: toTitleCase(tool.title || 'Task'), subtitle: `${name}${typeof agent === 'string' && agent ? ` · ${agent}` : ''}` };
      }
    }
  }

  if (tool.title) return { title: toTitleCase(tool.title) };
  return { title: toTitleCase(toolKey || tool.name || 'Tool Call') };
}

/**
 * The subtitle to render: the header's own, else the target file, else the raw
 * detail. A value that is only an `xd://` URL is never shown — the device
 * already named the action in the title, and the URL is transport. The target
 * file is filtered the same way, because `resolveTargetFile` reads `tool.target`
 * and a device call's target IS the URL.
 */
export function toolCardSubtitle(tool: ToolCallData, header: ToolCardHeader): string | undefined {
  if (header.subtitle && !header.subtitle.startsWith('xd://')) return header.subtitle;
  const target = resolveTargetFile(tool);
  if (target && !target.startsWith('xd://')) return target;
  if (header.subtitle) return undefined;
  if (tool.detail && !tool.detail.startsWith('xd://')) return tool.detail;
  return undefined;
}
