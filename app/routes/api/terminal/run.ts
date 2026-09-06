import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = util.promisify(exec);

export async function loader({ request }: LoaderFunctionArgs) {
  const rootDir = process.cwd();
  let bunVersion = '';
  let nodeVersion = process.version;
  let gitBranch = 'main';

  try {
    const { stdout } = await execAsync('bun --version', { cwd: rootDir });
    bunVersion = stdout.trim();
  } catch {
    bunVersion = '1.4.0';
  }

  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir });
    gitBranch = stdout.trim() || 'main';
  } catch {
    gitBranch = 'main';
  }

  return json({
    bunVersion,
    nodeVersion,
    gitBranch,
    cwd: rootDir,
    relativePath: '.',
  });
}

export async function action({ request }: ActionFunctionArgs) {
  let command = '';
  let requestedCwd = '';

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json();
    command = (body.command || '').trim();
    requestedCwd = (body.cwd || '').trim();
  } else {
    const formData = await request.formData();
    command = ((formData.get('command') as string) || '').trim();
    requestedCwd = ((formData.get('cwd') as string) || '').trim();
  }

  const rootDir = process.cwd();
  let currentDir = rootDir;

  if (requestedCwd) {
    const resolved = path.isAbsolute(requestedCwd)
      ? path.resolve(requestedCwd)
      : path.resolve(rootDir, requestedCwd);

    // Keep within rootDir for containment
    if (resolved.startsWith(rootDir) && fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
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
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: currentDir,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 2, // 2MB
      env: {
        ...process.env,
        PAGER: 'cat',
        FORCE_COLOR: '0',
      },
    });

    const durationMs = Date.now() - startTime;
    return json({
      stdout,
      stderr,
      exitCode: 0,
      durationMs,
      cwd: path.relative(rootDir, currentDir) || '.',
    });
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const stdout = error.stdout ? String(error.stdout) : '';
    const stderr = error.stderr ? String(error.stderr) : error.message || 'Command execution failed';
    const exitCode = typeof error.code === 'number' ? error.code : 1;

    return json({
      stdout,
      stderr,
      exitCode,
      durationMs,
      cwd: path.relative(rootDir, currentDir) || '.',
      error: error.message,
    });
  }
}
