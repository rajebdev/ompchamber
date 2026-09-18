import { json, type ActionFunctionArgs } from '@/server/lib/remix-compat';
import { ripgrep } from 'ripgrep';
import { isMockMode } from '@/server/mock.server';
import { getDefaultFsRoot, resolveRoot } from '@/server/lib/fs/root';
import { scopeToRepo } from '@/server/lib/fs/repo-scope';

export interface SearchMatch {
  file: string;
  line: string;
  content: string;
}

interface RgMatchFrame {
  type: string;
  data?: {
    path?: { text?: string };
    line_number?: number;
    lines?: { text?: string };
  };
}

/**
 * Builds the rg argument vector from the search form fields. Flag semantics
 * match the previous `grep -r` call: literal search by default, `-e` opts into
 * regex, `-w` whole word, `-i` case-insensitive.
 */
function buildArgs(q: string, matchCase: boolean, wholeWord: boolean, useRegex: boolean, includeFiles: string): string[] {
  const args: string[] = ['--json', '--glob', '!node_modules/**', '--glob', '!.git/**', '--glob', '!dist/**'];
  if (!matchCase) args.push('-i');
  if (wholeWord) args.push('-w');
  args.push(useRegex ? '-e' : '-F');
  if (includeFiles) {
    includeFiles.split(',').map(p => p.trim()).filter(Boolean).forEach(p => args.push('--glob', p));
  }
  args.push(q, '.');
  return args;
}

/** Parses one rg `--json` line into a match; null for begin/end/summary frames. */
function parseRgLine(line: string): SearchMatch | null {
  if (!line.startsWith('{')) return null;
  try {
    const frame = JSON.parse(line) as RgMatchFrame;
    if (frame.type !== 'match') return null;
    const data = frame.data;
    const file = data?.path?.text;
    const text = data?.lines?.text;
    if (!file || text === undefined || data?.line_number === undefined) return null;
    return {
      file: file.replace(/^\.\//, ''),
      line: String(data.line_number),
      content: text,
    };
  } catch {
    return null;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const q = formData.get('q') as string;
  const matchCase = formData.get('matchCase') === 'true';
  const wholeWord = formData.get('wholeWord') === 'true';
  const useRegex = formData.get('useRegex') === 'true';
  const includeFiles = formData.get('includeFiles') as string;

  if (!q) {
    return json({ results: [] });
  }

  let targetDir: string;
  try {
    const baseDir = await resolveRoot(formData.get('root') as string, getDefaultFsRoot(isMockMode()));
    targetDir = scopeToRepo(baseDir, formData.get('repo') as string);
  } catch (error: unknown) {
    console.error(error);
    return json({ error: String(error) }, { status: 500 });
  }

  // SSE frame per flushed batch so the panel paints results while rg is still
  // walking the tree. `--json` output is line-delimited, so newline buffering
  // suffices to slice match frames.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // WASI preopens map the guest "." onto the real target directory.
      const preopens = { '.': targetDir };
      const decoder = new TextDecoder();
      let pending = '';
      let count = 0;
      let stderrText = '';

      try {
        const { code } = await ripgrep(buildArgs(q, matchCase, wholeWord, useRegex, includeFiles), {
          preopens,
          // ripgrep accepts any `{ write(chunk) }` sink — feed it the raw
          // WritableStream sink so matches flush incrementally.
          stdout: {
            write(chunk) {
              pending += decoder.decode(chunk, { stream: true });
              const lines = pending.split('\n');
              pending = lines.pop() ?? '';
              const batch: SearchMatch[] = [];
              for (const line of lines) {
                const match = parseRgLine(line);
                if (match) batch.push(match);
              }
              if (batch.length) {
                count += batch.length;
                send('matches', batch);
              }
            },
          },
          stderr: {
            write(chunk) {
              stderrText += decoder.decode(chunk, { stream: true });
            },
          },
        });
        // rg exit codes: 0 = matches, 1 = no matches, 2 = error (bad regex, IO failure).
        if (code === 2) send('error', { error: stderrText.trim() || 'ripgrep failed' });
      } catch (error: unknown) {
        send('error', { error: String(error) });
      }

      send('done', { count });
      closed = true;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
