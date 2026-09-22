import { json, type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { runShell } from '@/server/lib/fs/shell';
import { resolveRoot } from '@/server/lib/fs/root';
import { scopeToRepo } from '@/server/lib/fs/repo-scope';

/**
 * Launch context for the terminal header: which directory the shell opens in,
 * the git branch checked out there, and the runtime versions.
 *
 * Command execution used to live here as a one-shot `action`; the PTY socket
 * replaced it, so only the display half remains.
 */
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
