import path from 'path';
import type { FileDiffData } from '@/shared/types/git';
import { runShell, shellOk } from '@/server/lib/fs/shell';

/**
 * Context lines requested when the reader wants the whole file rather than the
 * hunks. `--unified` takes any count, so this is a cap on the FILE, not on the
 * change: git emits every line it can reach around the edits.
 */
const FULL_CONTEXT = 1000000;

/** Runs one git diff probe and returns its stdout ('' on failure). */
async function gitOut(command: string, cwd: string, timeout: number, maxBuffer: number = 1024 * 1024 * 2): Promise<string> {
  const result = await runShell(command, { cwd, timeout, maxBuffer });
  return shellOk(result) ? result.stdout : '';
}

/**
 * Fetch git diff for a specific file in the working directory or index.
 *
 * `fullContext` asks git for the entire file rather than the surrounding hunks,
 * which is what the panel's "Full Code" mode renders — the diff comes back in
 * the same unified format, so no second rendering path exists.
 */
export async function fetchWorkingFileDiff(
  targetDir: string,
  file: string,
  staged: boolean = false,
  requestedStatus?: string,
  fullContext: boolean = false
): Promise<FileDiffData> {
  const cleanFile = file.replace(/^[./\\]+/, '').replace(/\\/g, '/');
  const fullPath = path.join(targetDir, cleanFile);
  let status = requestedStatus && requestedStatus.trim() ? requestedStatus.trim() : 'M';
  let diff = '';
  let oldContent = '';
  let newContent = '';
  let additions = 0;
  let deletions = 0;

  try {
    // Check porcelain status of this file
    const statusResult = await gitOut(`git status --porcelain=v1 -- "${cleanFile}"`, targetDir, 10000);
    const statusLine = statusResult.trim();
    if (statusLine) {
      status = statusLine.slice(0, 2).trim() || status;
    }

    // Try reading current new content from disk if it exists
    try {
      newContent = await Bun.file(fullPath).text();
    } catch {
      newContent = '';
    }

    // Read old content from index or HEAD
    oldContent = await gitOut(`git show HEAD:"${cleanFile}"`, targetDir, 5000)
      || await gitOut(`git show :0:"${cleanFile}"`, targetDir, 5000);

    // `-U<n>` on every probe: the full-code mode asks for the whole file, and
    // the diff-only mode keeps git's own default by passing no flag at all.
    const ctx = fullContext ? ` -U${FULL_CONTEXT}` : '';
    // Full-context output is the file, not the change, so a fixed buffer would
    // truncate a large file's diff — and a killed process is not a success, so
    // `gitOut` reports it as no diff at all and the synthesized whole-file
    // rewrite below takes over silently. Sized off the content already read, so
    // it cannot exceed roughly twice the file.
    const buf = fullContext
      ? Math.max(1024 * 1024 * 16, (oldContent.length + newContent.length) * 2 + 1024 * 1024)
      : 1024 * 1024 * 2;

    if (staged) {
      // 1. Try staged diff (index vs HEAD), 2. HEAD diff, 3. unstaged diff
      diff = await gitOut(`git diff${ctx} --cached -- "${cleanFile}"`, targetDir, 10000, buf)
        || await gitOut(`git diff${ctx} HEAD -- "${cleanFile}"`, targetDir, 10000, buf)
        || await gitOut(`git diff${ctx} -- "${cleanFile}"`, targetDir, 10000, buf);
    } else if (status === '??' || status === 'U' || status === '?') {
      // Untracked file: --no-index exits 1 when a diff exists, so read stdout
      // directly instead of relying on the exit code.
      const untracked = await runShell(`git diff${ctx} --no-index /dev/null "${cleanFile}"`, { cwd: targetDir, timeout: 10000, maxBuffer: buf });
      diff = untracked.stdout.trim() ? untracked.stdout : '';
    } else {
      // 1. Working tree diff, 2. cached diff, 3. HEAD diff
      diff = await gitOut(`git diff${ctx} -- "${cleanFile}"`, targetDir, 10000, buf)
        || await gitOut(`git diff${ctx} --cached -- "${cleanFile}"`, targetDir, 10000, buf)
        || await gitOut(`git diff${ctx} HEAD -- "${cleanFile}"`, targetDir, 10000, buf);
    }

    // 4. If git diff is still empty but new content exists:
    if (!diff.trim()) {
      if (oldContent && newContent && oldContent !== newContent) {
        // Synthesize diff from old and new lines
        const oldLines = oldContent.split(/\r?\n/);
        const newLines = newContent.split(/\r?\n/);
        const diffBody = [
          ...oldLines.map((l) => `-${l}`),
          ...newLines.map((l) => `+${l}`),
        ].join('\n');
        diff = `--- a/${cleanFile}\n+++ b/${cleanFile}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${diffBody}`;
      } else if (newContent) {
        const lines = newContent.split(/\r?\n/);
        const prefix = status === 'A' || status === '??' ? '+' : ' ';
        const diffBody = lines.map((l) => `${prefix}${l}`).join('\n');
        diff = `--- a/${cleanFile}\n+++ b/${cleanFile}\n@@ -1,${lines.length} +1,${lines.length} @@\n${diffBody}`;
      }
    }

    // Count additions and deletions from diff
    if (diff) {
      const diffLines = diff.split('\n');
      for (const line of diffLines) {
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
        if (line.startsWith('+')) additions++;
        else if (line.startsWith('-')) deletions++;
      }
    }

    return {
      file: cleanFile,
      diff: diff || (newContent ? `--- a/${cleanFile}\n+++ b/${cleanFile}\n@@ -1,1 +1,1 @@\n ${newContent.slice(0, 100)}` : 'No differences found'),
      oldContent,
      newContent,
      staged,
      status,
      additions,
      deletions,
    };
  } catch (error: any) {
    return {
      file: cleanFile,
      diff: `// Unable to compute diff for ${cleanFile}: ${error?.message || 'Unknown error'}`,
      oldContent: '',
      newContent,
      staged,
      status: 'M',
      additions: 0,
      deletions: 0,
    };
  }
}
