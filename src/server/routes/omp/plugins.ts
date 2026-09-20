import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { isMockMode } from '@/server/mock.server';

/**
 * omp plugin CLI bridge — list/install/uninstall/enable/disable through the
 * real `omp plugin` command. The CLI is authoritative (own lockfile, npm/link
 * installs) so shelling out beats reimplementing its registry logic.
 */

const TIMEOUT_MS = 120_000;

function runPlugin(args: string[]): Promise<string> {
  return (async () => {
    const proc = Bun.spawn({
      cmd: ['omp', 'plugin', ...args],
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(stderr.trim() || `omp plugin ${args[0]} exited with code ${exitCode}`);
    return stdout;
  })();
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const mock = isMockMode();
  if (mock) {
    return json({ plugins: [], raw: '', isMock: true });
  }
  try {
    const raw = await runPlugin(['list']);
    return json({ plugins: parsePluginList(raw), raw, isMock: false });
  } catch (error: any) {
    return json({ plugins: [], raw: '', isMock: false, error: error.message }, { status: 500 });
  }
}

/** Parse `omp plugin list` text lines: "name  <detail>" per installed plugin. */
function parsePluginList(raw: string): Array<{ name: string; detail: string }> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^no plugins installed/i.test(line) && !/^install plugins with:/i.test(line))
    .map((line) => {
      const match = /^(\S+)\s*(.*)$/.exec(line);
      return match ? { name: match[1], detail: match[2] ?? '' } : { name: line, detail: '' };
    });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed({ request, params });
  }
  try {
    const body = await request.json();
    const action = typeof body.action === 'string' ? body.action : '';
    const allowed = ['install', 'uninstall', 'upgrade', 'enable', 'disable'];
    if (!allowed.includes(action)) {
      return json({ error: `action must be one of: ${allowed.join(', ')}` }, { status: 400 });
    }
    if (typeof body.source !== 'string' || !body.source.trim()) {
      return json({ error: 'source (plugin package name) is required' }, { status: 400 });
    }
    if (isMockMode()) {
      return json({ error: 'Plugin actions are unavailable in mock mode' }, { status: 400 });
    }
    const output = await runPlugin([action, body.source]);
    const list = await runPlugin(['list']);
    return json({ success: true, action, output, plugins: parsePluginList(list) });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
