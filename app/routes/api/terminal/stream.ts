import { type LoaderFunctionArgs } from '@remix-run/node';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { resolveRoot } from '@/lib/fs-root';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const command = (url.searchParams.get('cmd') || '').trim();
  const requestedCwd = (url.searchParams.get('cwd') || '').trim();
  const rootDir = await resolveRoot(url.searchParams.get('root'), process.cwd());
  let currentDir = rootDir;

  if (requestedCwd) {
    const resolved = path.isAbsolute(requestedCwd)
      ? path.resolve(requestedCwd)
      : path.resolve(rootDir, requestedCwd);
    if ((resolved === rootDir || resolved.startsWith(rootDir + path.sep)) && fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      currentDir = resolved;
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
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
        if (!fs.existsSync(nextDir) || !fs.statSync(nextDir).isDirectory()) {
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

      // Spawn process in pseudo-terminal mode with full ANSI color support
      const proc = spawn(command, {
        shell: true,
        cwd: currentDir,
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          TERM: 'xterm-256color',
        },
      });

      request.signal.addEventListener('abort', () => {
        try {
          proc.kill('SIGINT');
        } catch {}
      });

      proc.stdout?.on('data', (chunk: Buffer) => {
        sendEvent('data', { text: chunk.toString() });
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        sendEvent('data', { text: chunk.toString() });
      });

      proc.on('error', (err) => {
        sendEvent('data', { text: `\x1b[31mExecution error: ${err.message}\x1b[0m\r\n` });
        sendEvent('exit', { exitCode: 1, cwd: path.relative(rootDir, currentDir) || '.' });
        try { controller.close(); } catch {}
      });

      proc.on('close', (code) => {
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
