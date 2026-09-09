import { useMemo } from 'react';

interface DiffLine {
  kind: 'add' | 'del' | 'meta' | 'context';
  text: string;
}

interface DiffFile {
  oldPath: string;
  newPath: string;
  lines: DiffLine[];
}

function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) files.push(current);
      current = null;
      continue;
    }
    if (line.startsWith('--- ')) {
      if (!current) current = { oldPath: line.slice(4).replace(/^[ab]\//, ''), newPath: '', lines: [] };
      else current.oldPath = line.slice(4).replace(/^[ab]\//, '');
      continue;
    }
    if (line.startsWith('+++ ')) {
      if (!current) current = { oldPath: '', newPath: '', lines: [] };
      current.newPath = line.slice(4).replace(/^[ab]\//, '');
      continue;
    }
    if (!current) {
      if (line.startsWith('@@') || line.startsWith('+') || line.startsWith('-')) {
        current = { oldPath: '', newPath: '', lines: [] };
      } else {
        continue;
      }
    }
    if (line.startsWith('@@')) {
      current.lines.push({ kind: 'meta', text: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      current.lines.push({ kind: 'add', text: line.slice(1) });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.lines.push({ kind: 'del', text: line.slice(1) });
    } else {
      current.lines.push({ kind: 'context', text: line.startsWith(' ') ? line.slice(1) : line });
    }
  }
  if (current) files.push(current);
  return files;
}

/** Split diff view untuk details.patch / details.diff dari toolResult. */
export function DiffView({ text }: { text: string }) {
  const files = useMemo(() => parseUnifiedDiff(text), [text]);
  if (files.length === 0) {
    return (
      <pre className="max-h-48 overflow-auto whitespace-pre overflow-x-auto rounded-lg border border-ink/8 bg-paper p-3 font-mono text-[11px] leading-relaxed text-ink/80 select-text">
        {text}
      </pre>
    );
  }

  const stats = files.reduce(
    (acc, file) => {
      for (const line of file.lines) {
        if (line.kind === 'add') acc.added++;
        else if (line.kind === 'del') acc.removed++;
      }
      return acc;
    },
    { added: 0, removed: 0 },
  );

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8">
      <div className="flex items-center gap-2 border-b border-ink/8 bg-paper px-2.5 py-1.5">
        <span className="truncate font-mono text-[10.5px] text-ink/60">
          {files[0]?.newPath || files[0]?.oldPath || 'diff'}
        </span>
        {files.length > 1 && (
          <span className="rounded-full bg-ink/5 px-1.5 py-px font-mono text-[9.5px] text-ink/45">
            {files.length} files
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px]">
          <span className="text-success">+{stats.added}</span>
          <span className="text-error">-{stats.removed}</span>
        </span>
      </div>
      <div className="max-h-56 overflow-auto bg-paper font-mono text-[11px] leading-relaxed select-text">
        {files.map((file, fileIndex) => (
          <div key={fileIndex} className={fileIndex > 0 ? 'border-t border-ink/6' : ''}>
            {file.lines.map((line, i) => {
              const bg =
                line.kind === 'add'
                  ? 'bg-success/[0.07]'
                  : line.kind === 'del'
                    ? 'bg-error/[0.07]'
                    : line.kind === 'meta'
                      ? 'bg-ink/[0.04]'
                      : '';
              const color =
                line.kind === 'add'
                  ? 'text-success'
                  : line.kind === 'del'
                    ? 'text-error'
                    : line.kind === 'meta'
                      ? 'text-ink/45'
                      : 'text-ink/70';
              const marker = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : line.kind === 'meta' ? '@' : ' ';
              return (
                <div key={i} className={`flex px-2.5 ${bg}`}>
                  <span className={`w-4 shrink-0 select-none font-bold ${color}`}>{marker}</span>
                  <span className={`min-w-0 flex-1 whitespace-pre-wrap break-all ${color}`}>
                    {line.text || '\u00a0'}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
