import { type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import path from 'path';
import { resolveRoot } from '@/server/lib/fs/root';
import { scopeToRepo } from '@/server/lib/fs/repo-scope';
import { createSseStream } from '@/server/lib/sse';
import { matchCdCommand, resolveCdTarget, resolveTerminalCwd } from '@/server/lib/fs/terminal-cwd';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const command = (url.searchParams.get('cmd') || '').trim();
  const requestedCwd = (url.searchParams.get('cwd') || '').trim();
  const baseDir = await resolveRoot(url.searchParams.get('root'), process.cwd());
  const rootDir = await scopeToRepo(baseDir, url.searchParams.get('repo'));
  const currentDir = await resolveTerminalCwd(rootDir, requestedCwd);

  const stream = createSseStream({
    headers: { 'Cache-Control': 'no-cache, no-transform' },
    async onStart(handlers) {
      if (!command) {
        handlers.send('exit', { exitCode: 0, cwd: path.relative(rootDir, currentDir) || '.' });
        handlers.close();
        return;
      }

      // Special handling for cd navigation
      const cdTarget = matchCdCommand(command);
      if (cdTarget !== null) {
        if (!cdTarget || cdTarget === '~' || cdTarget === '/') {
          handlers.send('exit', { exitCode: 0, cwd: '.' });
          handlers.close();
          return;
        }
        const cd = await resolveCdTarget(rootDir, currentDir, cdTarget);
        if (!cd.ok) {
          handlers.send('data', {
            text: cd.reason === 'above-root'
              ? `\x1b[31mcd: permission denied: cannot navigate above workspace root\x1b[0m\r\n`
              : `\x1b[31mcd: no such file or directory: ${cdTarget}\x1b[0m\r\n`,
          });
          handlers.send('exit', { exitCode: 1, cwd: path.relative(rootDir, currentDir) || '.' });
          handlers.close();
          return;
        }
        handlers.send('exit', { exitCode: 0, cwd: cd.cwd });
        handlers.close();
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
            handlers.send('data', { text: decoder.decode(value, { stream: true }) });
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
        handlers.send('exit', {
          exitCode: code ?? 0,
          cwd: path.relative(rootDir, currentDir) || '.',
        });
        handlers.close();
      });
    },
  });

  return stream.response;
}
