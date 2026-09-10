import type { DiffLine } from '@/components/workspace/diff-panel/diff-parser';

interface UnifiedViewProps {
  lines: DiffLine[];
}

export function UnifiedView({ lines }: UnifiedViewProps) {
  if (lines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink/40 font-mono text-xs p-8">
        No differences between working file and target.
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto font-mono text-xs select-text bg-paper text-ink">
      <table className="w-max min-w-full border-collapse">
        <tbody>
          {lines.map((line, idx) => {
            if (line.type === 'meta') {
              return (
                <tr key={idx} className="bg-canvas border-y border-ink/10 text-meta select-none">
                  <td className="w-12 text-center py-1 px-2 text-[10px] opacity-60 border-r border-ink/10 font-mono">...</td>
                  <td className="w-12 text-center py-1 px-2 text-[10px] opacity-60 border-r border-ink/10 font-mono">...</td>
                  <td className="py-1 px-3 text-[11px] font-semibold text-meta font-mono tracking-tight">{line.text}</td>
                </tr>
              );
            }

            const isAdd = line.type === 'add';
            const isDel = line.type === 'del';

            return (
              <tr
                key={idx}
                className={`transition-colors group ${
                  isAdd
                    ? 'bg-success/10 hover:bg-success/15'
                    : isDel
                    ? 'bg-error/10 hover:bg-error/15'
                    : 'hover:bg-ink/[0.03]'
                }`}
              >
                {/* Old line number */}
                <td
                  className={`w-12 py-0.5 px-2 text-right text-[10px] select-none border-r border-ink/10 font-mono ${
                    isDel
                      ? 'bg-error/15 text-error font-semibold'
                      : isAdd
                      ? 'bg-success/15 text-success/70'
                      : 'bg-canvas/50 text-ink/40'
                  }`}
                >
                  {line.oldLineNumber || ''}
                </td>

                {/* New line number */}
                <td
                  className={`w-12 py-0.5 px-2 text-right text-[10px] select-none border-r border-ink/10 font-mono ${
                    isAdd
                      ? 'bg-success/15 text-success font-semibold'
                      : isDel
                      ? 'bg-error/15 text-error/70'
                      : 'bg-canvas/50 text-ink/40'
                  }`}
                >
                  {line.newLineNumber || ''}
                </td>

                {/* Change prefix & code text */}
                <td className="py-0.5 px-3 whitespace-pre text-ink pr-6">
                  <span
                    className={`inline-block w-4 text-center select-none font-bold ${
                      isAdd ? 'text-success' : isDel ? 'text-error' : 'opacity-0'
                    }`}
                  >
                    {isAdd ? '+' : isDel ? '-' : ' '}
                  </span>
                  <span>{line.text}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
