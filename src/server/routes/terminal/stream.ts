import { type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import path from 'path';
import { resolveRoot } from '@/server/lib/fs/root';
import { scopeToRepo } from '@/server/lib/fs/repo-scope';

/** True when `dir` resolves to an existing directory (async stat probe). */
async function isDirectory(dir: string): Promise<boolean> {
  const stat = await Bun.file(dir).stat().catch(() => null);
  return stat?.isDirectory() ?? false;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const command = (url.searchParams.get('cmd') || '').trim();
  const requestedCwd = (url.searchParams.get('cwd') || '').trim();
  const baseDir = await resolveRoot(url.searchParams.get('root'), process.cwd());
  const rootDir = await scopeToRepo(baseDir, url.searchParams.get('repo'));
  let currentDir = rootDir;

  if (requestedCwd) {
    const resolved = path.isAbsolute(requestedCwd)
      ? path.resolve(requestedCwd)
      : path.resolve(rootDir, requestedCwd);
    if ((resolved === rootDir || resolved.startsWith(rootDir + path.sep)) && (await isDirectory(resolved))) {
      currentDir = resolved;
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected
        }
      };

      if (!command) {
        sendEvent('exit', { exitCode: 0, cwd: path.relative(rootDir, currentDir) || '.' });
        try { controller.close(); } catch {}
        return;
      }

      // Special handling for cd navigation
      const cdMatch = command.match(/^cd(?:\s+(.*))?$/);
      if (cdMatch) {
        const target = (cdMatch[1] || '').trim();
        if (!target || target === '~' || target === '/') {
          sendEvent('exit', { exitCode: 0, cwd: '.' });
          try { controller.close(); } catch {}
          return;
        }
        const nextDir = path.resolve(currentDir, target);
        if (!nextDir.startsWith(rootDir)) {
          sendEvent('data', { text: `\x1b[31mcd: permission denied: cannot navigate above workspace root\x1b[0m\r\n` });
          sendEvent('exit', { exitCode: 1, cwd: path.relative(rootDir, currentDir) || '.' });
          try { controller.close(); } catch {}
          return;
        }
        if (!(await isDirectory(nextDir))) {
          sendEvent('data', { text: `\x1b[31mcd: no such file or directory: ${target}\x1b[0m\r\n` });
          sendEvent('exit', { exitCode: 1, cwd: path.relative(rootDir, currentDir) || '.' });
          try { controller.close(); } catch {}
          return;
        }
        const rel = path.relative(rootDir, nextDir) || '.';
        sendEvent('exit', { exitCode: 0, cwd: rel });
        try { controller.close(); } catch {}
        return;
      }

      // Spawn via /bin/sh so shell syntax (pipes, &&) keeps working, with full
      // ANSI color support for the xterm viewer.
      const proc = Bun.spawn({
        cmd: ['sh', '-c', command],
        cwd: currentDir,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...Bun.env,
          FORCE_COLOR: '1',
          TERM: 'xterm-256color',
        },
      });

      request.signal.addEventListener('abort', () => {
        try {
          proc.kill('SIGINT');
        } catch {}
      });

      const decoder = new TextDecoder();
      const pump = async (stream: ReadableStream<Uint8Array> | undefined) => {
        if (!stream) return;
        const reader = stream.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            sendEvent('data', { text: decoder.decode(value, { stream: true }) });
          }
        } catch {
          // Stream died with the process; exit handling below reports it.
        } finally {
          reader.releaseLock();
        }
      };
      const stdoutDone = pump(proc.stdout);
      const stderrDone = pump(proc.stderr);

      void Promise.all([stdoutDone, stderrDone, proc.exited]).then(([_, __, code]) => {
        sendEvent('exit', {
          exitCode: code ?? 0,
          cwd: path.relative(rootDir, currentDir) || '.',
        });
        try { controller.close(); } catch {}
      });
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
