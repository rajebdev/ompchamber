import type { SplitDiffRow } from '@/components/workspace/diff-panel/diff-parser';

interface SplitViewProps {
  rows: SplitDiffRow[];
}

export function SplitView({ rows }: SplitViewProps) {
  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink/40 font-mono text-xs p-8">
        No differences between working file and target.
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto font-mono text-xs select-text bg-paper">
      <div className="grid grid-cols-2 sticky top-0 z-10 bg-canvas border-b border-ink/10 text-[11px] text-ink/60 font-sans select-none">
        <div className="px-3 py-1 font-medium border-r border-ink/10">Original (HEAD / Base)</div>
        <div className="px-3 py-1 font-medium">Modified (Working Tree)</div>
      </div>

      <table className="w-full border-collapse table-fixed">
        <tbody>
          {rows.map((row, idx) => {
            if (row.isMeta) {
              return (
                <tr key={idx} className="bg-ink/[0.04] border-y border-ink/10 text-ink/50 select-none">
                  <td colSpan={4} className="py-1 px-3 text-[11px] font-medium text-ink/60 text-center">
                    {row.metaText}
                  </td>
                </tr>
              );
            }

            const left = row.left;
            const right = row.right;

            const isLeftDel = left?.type === 'del';
            const isRightAdd = right?.type === 'add';

            return (
              <tr key={idx} className="border-b border-ink/[0.03]">
                {/* Left Line Number */}
                <td className="w-10 py-0.5 px-1.5 text-right text-[10px] text-ink/40 select-none border-r border-ink/5 font-mono bg-paper">
                  {left?.lineNumber || ''}
                </td>

                {/* Left Content (Original) */}
                <td
                  className={`w-[calc(50%-2.5rem)] py-0.5 px-2 whitespace-pre overflow-hidden text-ellipsis border-r border-ink/10 ${
                    isLeftDel
                      ? 'bg-error/10 text-error dark:text-red-300'
                      : left
                      ? 'text-ink'
                      : 'bg-ink/[0.02]'
                  }`}
                >
                  {left && (
                    <>
                      <span className="inline-block w-3 text-center select-none font-semibold opacity-75">
                        {isLeftDel ? '-' : ' '}
                      </span>
                      <span>{left.text}</span>
                    </>
                  )}
                </td>

                {/* Right Line Number */}
                <td className="w-10 py-0.5 px-1.5 text-right text-[10px] text-ink/40 select-none border-r border-ink/5 font-mono bg-paper">
                  {right?.lineNumber || ''}
                </td>

                {/* Right Content (Modified) */}
                <td
                  className={`w-[calc(50%-2.5rem)] py-0.5 px-2 whitespace-pre overflow-hidden text-ellipsis ${
                    isRightAdd
                      ? 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                      : right
                      ? 'text-ink'
                      : 'bg-ink/[0.02]'
                  }`}
                >
                  {right && (
                    <>
                      <span className="inline-block w-3 text-center select-none font-semibold opacity-75">
                        {isRightAdd ? '+' : ' '}
                      </span>
                      <span>{right.text}</span>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
