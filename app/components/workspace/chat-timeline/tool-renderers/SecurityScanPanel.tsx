import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface ScanFinding {
  severity?: unknown;
  message?: unknown;
  file?: unknown;
  path?: unknown;
  line?: unknown;
  rule?: unknown;
}

function severityOf(f: ScanFinding): 'high' | 'medium' | 'low' | 'info' {
  const s = typeof f.severity === 'string' ? f.severity.toLowerCase() : '';
  if (s === 'high' || s === 'critical' || s === 'error') return 'high';
  if (s === 'medium' || s === 'warning') return 'medium';
  if (s === 'low') return 'low';
  return 'info';
}

const SEVERITY_STYLES = {
  high: 'bg-error/10 text-error',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-ink/8 text-ink/60',
  info: 'bg-ink/5 text-ink/50',
} as const;

function countBySeverity(findings: ScanFinding[]): Record<string, number> {
  const counts: Record<string, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[severityOf(f)]++;
  return counts;
}

function parseScanFindings(output: string): ScanFinding[] {
  if (!output) return [];
  try {
    const data = JSON.parse(output);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.findings)) return data.findings;
      if (Array.isArray(data.vulnerabilities)) return data.vulnerabilities;
      if (Array.isArray(data.issues)) return data.issues;
    }
  } catch {}
  return [];
}

/** Panel untuk tool `security_scan` — ringkasan + temuan scan. */
export function SecurityScanPanel({ tool }: { tool: ToolCallData }) {
  const details = tool.details ?? {};
  const findings: ScanFinding[] = Array.isArray(details.findings)
    ? details.findings
    : parseScanFindings(tool.output ?? '');

  if (findings.length === 0) {
    const lines = (tool.output ?? '').split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/[0.04] px-3 py-2.5 text-[11.5px] text-success">
          <ShieldCheck size={13} className="shrink-0" />
          <span>No issues found</span>
        </div>
      );
    }
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

  const counts = countBySeverity(findings);

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8">
      <div className="flex items-center gap-2 border-b border-ink/8 bg-paper px-2.5 py-1.5">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Findings</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[9.5px]">
          {counts.high > 0 && <span className="rounded-full bg-error/10 px-1.5 py-px text-error">{counts.high} high</span>}
          {counts.medium > 0 && <span className="rounded-full bg-warning/10 px-1.5 py-px text-warning">{counts.medium} med</span>}
          {counts.low > 0 && <span className="rounded-full bg-ink/8 px-1.5 py-px text-ink/55">{counts.low} low</span>}
        </span>
      </div>
      <div className="divide-y divide-ink/6 bg-canvas/40 py-1">
        {findings.map((f, index) => {
          const sev = severityOf(f);
          const msg = typeof f.message === 'string' ? f.message : '';
          const file = typeof f.file === 'string' ? f.file : typeof f.path === 'string' ? f.path : '';
          const line = typeof f.line === 'number' ? f.line : undefined;
          const rule = typeof f.rule === 'string' ? f.rule : undefined;
          return (
            <div key={index} className="flex items-start gap-2 px-2.5 py-1.5 text-[11.5px]">
              <ShieldAlert size={11} className={`mt-0.5 shrink-0 ${sev === 'high' ? 'text-error' : sev === 'medium' ? 'text-warning' : 'text-ink/40'}`} />
              <span className="min-w-0 flex-1 break-words">
                <span className={`mr-1.5 rounded-full px-1.5 py-px font-mono text-[9px] ${SEVERITY_STYLES[sev]}`}>{sev}</span>
                {file && <span className="font-mono text-[10px] text-ink/45">{file}{line !== undefined ? `:${line}` : ''}: </span>}
                <span className="text-ink/80">{msg}</span>
                {rule && <span className="ml-1 font-mono text-[9.5px] text-ink/35">({rule})</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
