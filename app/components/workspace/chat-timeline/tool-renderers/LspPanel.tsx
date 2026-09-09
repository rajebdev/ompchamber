import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface Diagnostic {
  file?: unknown;
  path?: unknown;
  line?: unknown;
  column?: unknown;
  message?: unknown;
  severity?: unknown;
  code?: unknown;
}

function severityOf(d: Diagnostic): 'error' | 'warning' | 'info' {
  const s = typeof d.severity === 'string' ? d.severity.toLowerCase() : '';
  if (s === 'error' || s === '1') return 'error';
  if (s === 'warning' || s === '2') return 'warning';
  return 'info';
}

const SEVERITY_STYLES = {
  error: {
    icon: <AlertCircle size={11} className="shrink-0 text-error" />,
    text: 'text-error',
    badge: 'bg-error/10 text-error',
  },
  warning: {
    icon: <AlertTriangle size={11} className="shrink-0 text-warning" />,
    text: 'text-warning',
    badge: 'bg-warning/10 text-warning',
  },
  info: {
    icon: <Info size={11} className="shrink-0 text-ink/40" />,
    text: 'text-ink/70',
    badge: 'bg-ink/5 text-ink/50',
  },
} as const;

function locationOf(d: Diagnostic): string {
  const file = typeof d.file === 'string' ? d.file : typeof d.path === 'string' ? d.path : '';
  const line = typeof d.line === 'number' ? d.line : undefined;
  const col = typeof d.column === 'number' ? d.column : undefined;
  if (!file) return '';
  if (line === undefined) return file;
  return col === undefined ? `${file}:${line}` : `${file}:${line}:${col}`;
}

/** Daftar diagnostics untuk tool `lsp` — details.diagnostics[] atau output. */
export function LspPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const items: Diagnostic[] = Array.isArray(details.diagnostics) ? details.diagnostics : [];

  if (items.length === 0) {
    const lines = (tool.output ?? '').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return null;
    return (
      <ul className="divide-y divide-ink/6 overflow-hidden rounded-lg border border-ink/8 bg-canvas/40">
        {lines.map((line, i) => (
          <li key={i} className="px-2.5 py-1.5 font-mono text-[11px] break-words text-ink/75">
            {line}
          </li>
        ))}
      </ul>
    );
  }

  const bySeverity = (sev: 'error' | 'warning' | 'info') => items.filter((d) => severityOf(d) === sev);
  const errorN = bySeverity('error').length;
  const warningN = bySeverity('warning').length;

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8">
      <div className="flex items-center gap-2 border-b border-ink/8 bg-paper px-2.5 py-1.5">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
          Diagnostics
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10px]">
          {errorN > 0 && <span className="flex items-center gap-1 text-error"><AlertCircle size={9} />{errorN}</span>}
          {warningN > 0 && <span className="flex items-center gap-1 text-warning"><AlertTriangle size={9} />{warningN}</span>}
        </span>
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 py-1">
        {items.map((d, index) => {
          const sev = severityOf(d);
          const style = SEVERITY_STYLES[sev];
          const loc = locationOf(d);
          const msg = typeof d.message === 'string' ? d.message : '';
          const code = typeof d.code === 'string' ? d.code : undefined;
          return (
            <div key={index} className="flex items-start gap-2 px-2.5 py-1.5 text-[11.5px]">
              {style.icon}
              <span className="min-w-0 flex-1 break-words">
                {loc && <span className="font-mono text-[10px] text-ink/45">{loc}: </span>}
                <span className={style.text}>{msg}</span>
                {code && <span className="ml-1 font-mono text-[9.5px] text-ink/35">({code})</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
