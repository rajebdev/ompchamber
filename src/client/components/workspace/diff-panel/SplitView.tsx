import { useMemo } from 'preact/hooks';
import type { SplitDiffRow } from '@/shared/lib/fs/diff-parser';
import { highlightLines } from '@/shared/lib/code/syntax-highlight';
import { useSyntaxReady } from '@/client/hooks/ui/syntax-ready';

interface SplitViewProps {
  rows: SplitDiffRow[];
  language: string;
}

export function SplitView({ rows, language }: SplitViewProps) {
  const syntaxReady = useSyntaxReady();

  const htmlByIndex = useMemo(() => {
    const left = new Array<string>(rows.length).fill('');
    const right = new Array<string>(rows.length).fill('');
    let start = -1;
    const flush = (end: number) => {
      if (start < 0) return;
      const group = rows.slice(start, end);
      const leftHtml = highlightLines(group.map((r) => r.left?.text ?? '').join('\n'), language);
      const rightHtml = highlightLines(group.map((r) => r.right?.text ?? '').join('\n'), language);
      for (let i = start; i < end; i++) {
        left[i] = leftHtml[i - start] ?? '';
        right[i] = rightHtml[i - start] ?? '';
      }
      start = -1;
    };
    rows.forEach((row, idx) => {
      if (row.isMeta) flush(idx);
      else if (start < 0) start = idx;
    });
    flush(rows.length);
    return { left, right };
  }, [rows, language, syntaxReady]);

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink/40 font-mono text-xs p-8">
        No differences between working file and target.
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto font-mono text-xs select-text bg-paper text-ink code-surface">
      <div className="w-max min-w-full min-w-[700px]">
        <div className="grid grid-cols-2 sticky top-0 z-10 bg-canvas border-b border-ink/10 text-[11px] text-ink/70 font-sans select-none shadow-xs">
          <div className="px-3 py-1 font-medium border-r border-ink/10 flex items-center justify-between">
            <span>Original (HEAD / Base)</span>
          </div>
          <div className="px-3 py-1 font-medium flex items-center justify-between">
            <span>Modified (Working Tree)</span>
          </div>
        </div>

        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, idx) => {
              if (row.isMeta) {
                return (
                  <tr key={idx} className="bg-canvas border-y border-ink/10 text-meta select-none">
                    <td colSpan={4} className="py-1 px-3 text-[11px] font-semibold text-meta text-center font-mono">
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
                <tr key={idx} className="border-b border-ink/[0.04]">
                  {/* Left Line Number */}
                  <td
                    className={`w-12 py-0.5 px-2 text-right text-[10px] select-none border-r border-ink/10 font-mono ${
                      isLeftDel
                        ? 'bg-error/15 text-error font-semibold'
                        : left
                        ? 'bg-canvas/50 text-ink/40'
                        : 'bg-canvas/80 text-transparent'
                    }`}
                  >
                    {left?.lineNumber || ''}
                  </td>

                  {/* Left Content (Original) */}
                  <td
                    className={`min-w-[320px] py-0.5 px-2 whitespace-pre border-r border-ink/10 text-ink ${
                      isLeftDel
                        ? 'bg-error/10'
                        : left
                        ? 'hover:bg-ink/[0.02]'
                        : 'bg-canvas/40 select-none'
                    }`}
                  >
                    {left ? (
                      <>
                        <span className={`inline-block w-4 text-center select-none font-bold ${isLeftDel ? 'text-error' : 'opacity-0'}`}>
                          {isLeftDel ? '-' : ' '}
                        </span>
                        <span
                          className="shiki"
                          dangerouslySetInnerHTML={{
                            __html: left.text ? htmlByIndex.left[idx] || '&nbsp;' : '&nbsp;',
                          }}
                        />
                      </>
                    ) : (
                      <span className="opacity-0">&nbsp;</span>
                    )}
                  </td>

                  {/* Right Line Number */}
                  <td
                    className={`w-12 py-0.5 px-2 text-right text-[10px] select-none border-r border-ink/10 font-mono ${
                      isRightAdd
                        ? 'bg-success/15 text-success font-semibold'
                        : right
                        ? 'bg-canvas/50 text-ink/40'
                        : 'bg-canvas/80 text-transparent'
                    }`}
                  >
                    {right?.lineNumber || ''}
                  </td>

                  {/* Right Content (Modified) */}
                  <td
                    className={`min-w-[320px] py-0.5 px-2 whitespace-pre text-ink ${
                      isRightAdd
                        ? 'bg-success/10'
                        : right
                        ? 'hover:bg-ink/[0.02]'
                        : 'bg-canvas/40 select-none'
                    }`}
                  >
                    {right ? (
                      <>
                        <span className={`inline-block w-4 text-center select-none font-bold ${isRightAdd ? 'text-success' : 'opacity-0'}`}>
                          {isRightAdd ? '+' : ' '}
                        </span>
                        <span
                          className="shiki"
                          dangerouslySetInnerHTML={{
                            __html: right.text ? htmlByIndex.right[idx] || '&nbsp;' : '&nbsp;',
                          }}
                        />
                      </>
                    ) : (
                      <span className="opacity-0">&nbsp;</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
