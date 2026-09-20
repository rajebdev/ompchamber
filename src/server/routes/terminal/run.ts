import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import path from 'path';
import { runShell } from '@/server/lib/fs/shell';
import { resolveRoot } from '@/server/lib/fs/root';
import { scopeToRepo } from '@/server/lib/fs/repo-scope';
import { matchCdCommand, resolveCdTarget, resolveTerminalCwd } from '@/server/lib/fs/terminal-cwd';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rootDir = await resolveRoot(url.searchParams.get('root'), process.cwd());
  const targetDir = await scopeToRepo(rootDir, url.searchParams.get('repo'));
  let bunVersion = '';
  // `process.version` is the Node version Bun emulates, not a real Node binary.
  const nodeVersion = process.version;
  let gitBranch = 'main';

  try {
    const bunOut = await runShell('bun --version', { cwd: targetDir });
    bunVersion = bunOut.stdout.trim();
  } catch {
    bunVersion = Bun.version;
  }

  try {
    const branchOut = await runShell('git rev-parse --abbrev-ref HEAD', { cwd: targetDir });
    gitBranch = branchOut.stdout.trim() || 'main';
  } catch {
    gitBranch = 'main';
  }

  return json({
    bunVersion,
    nodeVersion,
    gitBranch,
    cwd: targetDir,
    relativePath: '.',
  });
}

export async function action({ request }: ActionFunctionArgs) {
  let command = '';
  let requestedCwd = '';
  let requestedRoot = '';
  let requestedRepo = '';

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json();
    command = (body.command || '').trim();
    requestedCwd = (body.cwd || '').trim();
    requestedRoot = (body.root || '').trim();
    requestedRepo = (body.repo || '').trim();
  } else {
    const formData = await request.formData();
    command = ((formData.get('command') as string) || '').trim();
    requestedCwd = ((formData.get('cwd') as string) || '').trim();
    requestedRoot = ((formData.get('root') as string) || '').trim();
    requestedRepo = ((formData.get('repo') as string) || '').trim();
  }

  const baseDir = await resolveRoot(requestedRoot, process.cwd());
  const rootDir = await scopeToRepo(baseDir, requestedRepo);
  const currentDir = await resolveTerminalCwd(rootDir, requestedCwd);

  if (!command) {
    return json({
      stdout: '',
      stderr: '',
      exitCode: 0,
      durationMs: 0,
      cwd: path.relative(rootDir, currentDir) || '.',
    });
  }

  // Handle 'cd' commands directly to track directory state across calls
  const cdTarget = matchCdCommand(command);
  if (cdTarget !== null) {
    if (!cdTarget || cdTarget === '~' || cdTarget === '/') {
      return json({
        stdout: '',
        stderr: '',
        exitCode: 0,
        durationMs: 1,
        cwd: '.',
      });
    }

    const cd = await resolveCdTarget(rootDir, currentDir, cdTarget);
    if (!cd.ok) {
      return json({
        stdout: '',
        stderr: cd.reason === 'above-root'
          ? `cd: permission denied: cannot navigate above workspace root`
          : `cd: no such file or directory: ${cdTarget}`,
        exitCode: 1,
        durationMs: 1,
        cwd: path.relative(rootDir, currentDir) || '.',
      });
    }

    return json({
      stdout: '',
      stderr: '',
      exitCode: 0,
      durationMs: 1,
      cwd: cd.cwd,
    });
  }

  const startTime = Date.now();
  const result = await runShell(command, {
    cwd: currentDir,
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 2,
    env: {
      PAGER: 'cat',
      FORCE_COLOR: '0',
    },
  });
  const durationMs = Date.now() - startTime;
  // Timeout detection uses signalCode (SIGTERM from Bun), not `killed` —
  // Bun 1.4 sets killed=true even for normal non-zero exits.
  const timedOut = result.signalCode !== null;
  const exitCode = timedOut ? 1 : (result.exitCode ?? 1);
  const stderr = result.stderr || (timedOut ? 'Command timed out' : '') || (exitCode === 0 ? '' : result.error?.message || 'Command execution failed');

  return json({
    stdout: result.stdout,
    stderr,
    exitCode,
    durationMs,
    cwd: path.relative(rootDir, currentDir) || '.',
    ...(exitCode === 0 ? {} : { error: result.error?.message || (timedOut ? 'Command timed out' : `Command exited with code ${exitCode}`) }),
  });
}
