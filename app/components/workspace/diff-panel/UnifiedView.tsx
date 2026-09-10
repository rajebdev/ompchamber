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
    <div className="w-full h-full overflow-auto font-mono text-xs select-text bg-paper">
      <table className="w-full border-collapse table-fixed">
        <tbody>
          {lines.map((line, idx) => {
            if (line.type === 'meta') {
              return (
                <tr key={idx} className="bg-ink/[0.04] border-y border-ink/10 text-ink/50 select-none">
                  <td className="w-12 text-center py-1 px-2 text-[10px] opacity-70">...</td>
                  <td className="w-12 text-center py-1 px-2 text-[10px] opacity-70">...</td>
                  <td className="py-1 px-3 text-[11px] font-medium text-ink/60">{line.text}</td>
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
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-900 dark:text-emerald-200'
                    : isDel
                    ? 'bg-error/10 hover:bg-error/15 text-error dark:text-red-300'
                    : 'hover:bg-ink/[0.03] text-ink'
                }`}
              >
                {/* Old line number */}
                <td className="w-12 py-0.5 px-2 text-right text-[10px] text-ink/40 select-none border-r border-ink/5 font-mono">
                  {line.oldLineNumber || ''}
                </td>

                {/* New line number */}
                <td className="w-12 py-0.5 px-2 text-right text-[10px] text-ink/40 select-none border-r border-ink/10 font-mono">
                  {line.newLineNumber || ''}
                </td>

                {/* Change prefix & code text */}
                <td className="py-0.5 px-3 whitespace-pre overflow-x-visible break-all">
                  <span className="inline-block w-4 text-center select-none font-semibold opacity-75">
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
