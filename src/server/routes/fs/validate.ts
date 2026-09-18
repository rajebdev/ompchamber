/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Real workspace path validation — adapted from omp-web/app/api/cwd/validate/
 * route.ts. Checks existence, directory-ness, and git-repo-ness. Additive
 * endpoint for programmatic use; the locked settings UI does not consume it yet.
 */

import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs } from '@/server/lib/remix-compat';
import { existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';

function hasGitCommand(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  try {
    const body = await request.json();
    if (typeof body.path !== 'string' || body.path.trim() === '') {
      return json({ error: 'path is required' }, { status: 400 });
    }
    const target = resolve(body.path);
    const exists = existsSync(target);
    const isDirectory = exists ? statSync(target).isDirectory() : false;
    const gitInstalled = hasGitCommand();
    const gitRepo = isDirectory && gitInstalled ? (() => {
      try {
        execFileSync('git', ['-C', target, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    })() : existsSync(join(target, '.git'));

    return json({
      valid: isDirectory,
      exists,
      isDirectory,
      isGitRepo: gitRepo,
      path: target,
    });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
