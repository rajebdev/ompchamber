import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import path from 'path';
import fs from 'fs';
import { runShell } from '@/server/lib/fs/shell';
import { resolveRoot } from '@/server/lib/fs/root';
import { scopeToRepo } from '@/server/lib/fs/repo-scope';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rootDir = await resolveRoot(url.searchParams.get('root'), process.cwd());
  const targetDir = scopeToRepo(rootDir, url.searchParams.get('repo'));
  let bunVersion = '';
  let nodeVersion = process.version;
  let gitBranch = 'main';

  try {
    const bunOut = await runShell('bun --version', { cwd: targetDir });
    bunVersion = bunOut.stdout.trim();
  } catch {
    bunVersion = '1.4.0';
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
  const rootDir = scopeToRepo(baseDir, requestedRepo);
  let currentDir = rootDir;

  if (requestedCwd) {
    const resolved = path.isAbsolute(requestedCwd)
      ? path.resolve(requestedCwd)
      : path.resolve(rootDir, requestedCwd);

    // Keep within the scoped root for containment
    if ((resolved === rootDir || resolved.startsWith(rootDir + path.sep)) && fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      currentDir = resolved;
    }
  }

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
  const cdMatch = command.match(/^cd(?:\s+(.*))?$/);
  if (cdMatch) {
    const target = (cdMatch[1] || '').trim();
    if (!target || target === '~' || target === '/') {
      return json({
        stdout: '',
        stderr: '',
        exitCode: 0,
        durationMs: 1,
        cwd: '.',
      });
    }

    const nextDir = path.resolve(currentDir, target);
    if (!nextDir.startsWith(rootDir)) {
      return json({
        stdout: '',
        stderr: `cd: permission denied: cannot navigate above workspace root`,
        exitCode: 1,
        durationMs: 1,
        cwd: path.relative(rootDir, currentDir) || '.',
      });
    }

    if (!fs.existsSync(nextDir) || !fs.statSync(nextDir).isDirectory()) {
      return json({
        stdout: '',
        stderr: `cd: no such file or directory: ${target}`,
        exitCode: 1,
        durationMs: 1,
        cwd: path.relative(rootDir, currentDir) || '.',
      });
    }

    const rel = path.relative(rootDir, nextDir) || '.';
    return json({
      stdout: '',
      stderr: '',
      exitCode: 0,
      durationMs: 1,
      cwd: rel,
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
