import { useCallback, useMemo } from 'preact/hooks';
import { memo } from 'preact/compat';
import { Bell, Boxes, Brain, BrainCircuit, Camera, Check, Code2, Cpu, FileCode, FileText, GitPullRequest, Globe, HelpCircle, ListTodo, Search, Server, Shield, Terminal, Wrench } from 'lucide-preact';
import type { ToolCallData } from '@/shared/types';
import { stripAnsiCodes } from '@/shared/lib/code/ansi';
import { isReminderTag, unwrapXmlEnvelope } from '@/shared/lib/chat/xml-envelope';
import { CopyButton } from '@/client/components/common/CopyButton';
import { ToolCardShell } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/ToolCardShell';
import { DiffView } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/DiffView';
import { ToolDetailsPanel, hasToolDetailsPanel, resolveTargetFile, resolveToolKey } from '@/client/components/workspace/chat-timeline/tool-renderers';
import { toTitleCase } from '@/shared/lib/chat/title-case';
import { FallbackOutput } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/FallbackOutput';
import { tryParseJson } from '@/shared/lib/code/syntax-highlight';
import { JsonCodeBlock } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/JsonCodeBlock';
import { getTodoSummary } from '@/shared/lib/chat/todo/parser';
import { parseAskQuestions } from '@/shared/lib/chat/ask-questions';

interface ToolCallCardProps {
  tool: ToolCallData;
  isOpen?: boolean;
  onToggle?: (toolId: string) => void;
  defaultExpanded?: boolean;
}

function getToolIcon(key: string) {
  switch (key) {
    case 'bash':
    case 'terminal':
      return <Terminal size={14} />;
    case 'edit':
    case 'write':
    case 'edit_file':
    case 'create_file':
    case 'ast_edit':
      return <FileCode size={14} />;
    case 'read':
    case 'read_file':
    case 'view_file':
      return <FileText size={14} />;
    case 'glob':
    case 'grep':
    case 'search_fs':
    case 'ast_grep':
      return <Search size={14} />;
    case 'web_search':
      return <Globe size={14} />;
    case 'todo':
    case 'task':
      return <ListTodo size={14} />;
    case 'eval':
      return <Code2 size={14} />;
    case 'lsp':
      return <Cpu size={14} />;
    case 'resolve':
    case 'reject':
      return <Check size={14} />;
    case 'hub':
      return <Server size={14} />;
    case 'ask':
      return <HelpCircle size={14} />;
    case 'think':
      return <BrainCircuit size={14} />;
    case 'security_scan':
      return <Shield size={14} />;
    case 'checkpoint':
    case 'rewind':
      return <Camera size={14} />;
    case 'github':
      return <GitPullRequest size={14} />;
    case 'memory_edit':
    case 'retain':
    case 'recall':
    case 'reflect':
    case 'learn':
      return <Brain size={14} />;
    default:
      if (key.startsWith('mcp__')) return <Boxes size={14} />;
      return <Wrench size={14} />;
  }
}

function commandOrInputOf(tool: ToolCallData): string {
  if (tool.command) return tool.command;
  if (typeof tool.input === 'string') return tool.input;
  if (tool.input && typeof tool.input === 'object') return JSON.stringify(tool.input, null, 2);
  if (tool.target || tool.detail) return tool.target || tool.detail || '';
  return '';
}

/** Inner `xd://mcp__<tool>` (or `mcp__<tool>` name) carried by an MCP call.
 *  Returns the bare MCP tool name, e.g. `codegraph_explore`. */
function mcpToolNameOf(tool: ToolCallData): string | undefined {
  const inputObj = typeof tool.input === 'object' && tool.input !== null ? (tool.input as Record<string, any>) : undefined;
  const path = typeof inputObj?.path === 'string' ? inputObj.path : tool.target || '';
  const raw = path.startsWith('xd://') ? path.slice(5) : typeof tool.name === 'string' && tool.name.startsWith('mcp__') ? tool.name : '';
  const name = raw.split(/[/?#]/)[0].trim();
  return name.startsWith('mcp__') ? name.slice(5) : undefined;
}

/** Human subject for an MCP call: the intent line wins, else first meaningful
 *  argument (query/pattern/path/…), else nothing. */
function mcpSubjectOf(tool: ToolCallData, inputObj: Record<string, any> | undefined): string | undefined {
  if (tool.intent) return tool.intent;
  const content = typeof inputObj?.content === 'string' ? inputObj.content : '';
  const parsed = content ? tryParseJson(content) : { isValid: false, data: undefined };
  const data = parsed.isValid ? (parsed.data as Record<string, any>) : inputObj;
  if (data && typeof data === 'object') {
    const first = ['query', 'q', 'pattern', 'pat', 'name', 'sql', 'path', 'symbol', 'url', 'command'].find((k) => typeof data[k] === 'string' && data[k]);
    if (first) return data[first];
  }
  return undefined;
}

function diffTextOf(tool: ToolCallData): string | undefined {
  if (tool.diff?.diffText) return tool.diff.diffText;
  const details = tool.details;
  if (details && typeof details === 'object') {
    if (typeof details.patch === 'string') return details.patch;
    if (typeof details.diff === 'string') return details.diff;
  }
  return undefined;
}

interface XdevDetails {
  args?: { action?: string; file?: string; paths?: string[] };
}

/** `details.xdev` of an oh-my-pi virtual device call, if present. */
function xdevOf(tool: ToolCallData): XdevDetails | undefined {
  const xdev = tool.details?.xdev;
  return xdev && typeof xdev === 'object' ? (xdev as XdevDetails) : undefined;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
      {children}
    </div>
  );
}

export const ToolCallCard = memo(function ToolCallCard({ tool, isOpen, onToggle, defaultExpanded = false }: ToolCallCardProps) {
  const toolKey = resolveToolKey(tool);
  // hasToolDetailsPanel invokes the renderer once as a plain probe — cache it per tool identity
  // so the probe does not re-run on every timeline re-render.
  const hasPanel = useMemo(() => hasToolDetailsPanel(tool), [tool]);
  const commandOrInput = commandOrInputOf(tool);
  const outputText = tool.output || (tool.error ? `Error: ${tool.error}` : '');
  const diffText = diffTextOf(tool);

  const handleToggle = useCallback(() => {
    onToggle?.(tool.id);
  }, [onToggle, tool.id]);

  const inputJson = useMemo(
    () => (!hasPanel && commandOrInput ? tryParseJson(commandOrInput) : null),
    [hasPanel, commandOrInput]
  );

  // A reminder envelope in the result is the runtime interrupting the call, not
  // its outcome — the header flags it next to the status badge.
  const isReminder = useMemo(() => {
    const envelope = unwrapXmlEnvelope(stripAnsiCodes(outputText));
    return Boolean(envelope && isReminderTag(envelope.tag));
  }, [outputText]);

  // Clean title & subtitle extraction
  let displayTitle = '';
  let displaySubtitle: string | undefined;

  if (toolKey === 'lsp') {
    displayTitle = 'LSP';
    const xdev = xdevOf(tool);
    if (xdev?.args?.action) {
      displaySubtitle = `${xdev.args.action}${xdev.args.file ? ` · ${xdev.args.file}` : ''}`;
    }
  } else if (toolKey === 'ast_edit') {
    displayTitle = 'AST Edit';
    const xdev = xdevOf(tool);
    if (xdev?.args?.paths?.[0]) {
      displaySubtitle = xdev.args.paths[0];
    }
  } else if (toolKey === 'resolve') {
    displayTitle = 'Resolve Proposal';
  } else if (toolKey === 'reject') {
    displayTitle = 'Reject Proposal';
  } else if (toolKey === 'yield') {
    displayTitle = tool.status === 'error' ? 'Yield' : outputText ? `Yield - ${outputText}` : 'Yield';
  } else if (toolKey === 'todo' || tool.name === 'todo' || tool.type === 'todo' || (tool.title && tool.title.toLowerCase().startsWith('todo'))) {
    displayTitle = 'Todo';
    const todoSummary = getTodoSummary(tool);
    if (todoSummary) {
      displaySubtitle = todoSummary;
    } else if (tool.title && (tool.title.includes('—') || tool.title.includes(' - ') || tool.title.includes(': '))) {
      const parts = tool.title.split(/\s+[—\-:]\s+/);
      const sub = parts.slice(1).join(' — ').trim();
      const cleaned = sub
        .split(/\s*·\s*/)
        .filter((p) => !/^0\s+(complete|in progress|pending)/i.test(p))
        .join(' · ');
      displaySubtitle = cleaned || sub;
    }
  } else if (toolKey === 'ask') {
    // The question itself is the card's body; the header says how many were
    // asked, matching the summary the same card shows once they are answered.
    displayTitle = 'Question';
    const asked = parseAskQuestions(tool).length;
    if (asked > 0) displaySubtitle = `Asked ${asked} question${asked === 1 ? '' : 's'}`;
  } else if (mcpToolNameOf(tool)) {
    // MCP call: `write xd://mcp__<tool>` (or a direct `mcp__<tool>` name) —
    // the MCP tool names the action, never the transport `write`.
    const inputObj = typeof tool.input === 'object' && tool.input !== null ? (tool.input as Record<string, any>) : undefined;
    displayTitle = toTitleCase(mcpToolNameOf(tool)!);
    const subject = mcpSubjectOf(tool, inputObj);
    if (subject) {
      displaySubtitle = subject.length > 80 ? `${subject.slice(0, 79)}…` : subject;
    }
  } else if (tool.title && (tool.title.includes('—') || tool.title.includes(' - ') || tool.title.includes(': '))) {
    const parts = tool.title.split(/\s+[—\-:]\s+/);
    displayTitle = toTitleCase(parts[0].trim());
    displaySubtitle = parts.slice(1).join(' — ').trim();
  } else if (tool.title) {
    displayTitle = toTitleCase(tool.title);
  } else {
    displayTitle = toTitleCase(toolKey || tool.name || 'Tool Call');
  }

  // Resolve task tool subagent name/target
  if ((toolKey === 'task' || tool.name === 'task') && !displaySubtitle) {
    const inputObj = typeof tool.input === 'object' && tool.input !== null ? (tool.input as Record<string, any>) : undefined;
    const firstTask = Array.isArray(inputObj?.tasks) ? inputObj.tasks[0] : undefined;
    if (firstTask?.name) {
      displaySubtitle = `${firstTask.name}${firstTask.agent ? ` · ${firstTask.agent}` : ''}`;
    }
  }

  const targetFilePath = resolveTargetFile(tool);
  const subtitle =
    displaySubtitle && !displaySubtitle.startsWith('xd://')
      ? displaySubtitle
      : targetFilePath && !targetFilePath.startsWith('xd://')
        ? targetFilePath
        : displaySubtitle || (tool.detail && !targetFilePath ? tool.detail : undefined);

  const duration = tool.duration || tool.time;
  const meta =
    duration || isReminder ? (
      <span className="flex items-center gap-2">
        {duration ? <span className="font-mono text-[10px] text-ink/40">{duration}</span> : null}
        {isReminder && (
          <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-semibold text-error">
            <Bell size={10} /> Reminder
          </span>
        )}
      </span>
    ) : null;

  return (
    <ToolCardShell
      tool={tool}
      icon={tool.icon || getToolIcon(toolKey)}
      title={displayTitle}
      subtitle={subtitle}
      meta={meta}
      isOpen={isOpen}
      onToggle={onToggle ? handleToggle : undefined}
      defaultExpanded={defaultExpanded}
      alwaysExpanded={hasPanel && (toolKey === 'yield' || toolKey === 'ask')}
    >
      <ToolDetailsPanel tool={tool} />

      {!hasPanel && commandOrInput && (
        <div className="space-y-1.5 code-surface">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <SectionLabel>Input</SectionLabel>
              {inputJson?.isValid && (
                <span className="rounded bg-ink/5 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-ink/45">
                  JSON
                </span>
              )}
            </div>
            <CopyButton
              text={inputJson?.isValid && inputJson.pretty ? inputJson.pretty : commandOrInput}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
              onClick={(e) => e.stopPropagation()}
              label="Copy"
            />
          </div>
          {inputJson?.isValid && inputJson.pretty ? (
            <JsonCodeBlock
              jsonString={inputJson.pretty}
              maxHeightClass="max-h-60"
              showHeader={false}
            />
          ) : (
            <pre className="overflow-x-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-ink/80 select-text">
              {commandOrInput}
            </pre>
          )}
        </div>
      )}

      {!hasPanel && diffText && (
        <div className="space-y-1.5">
          <SectionLabel>Diff</SectionLabel>
          <DiffView text={diffText} />
        </div>
      )}

      {!hasPanel && outputText && (
        <FallbackOutput text={outputText} />
      )}
    </ToolCardShell>
  );
});
