/**
 * Path formatting for the Files panel's copy actions.
 *
 * `/api/fs/dir` emits every entry as a path relative to the listing's base
 * directory — the workspace root, or the selected nested repo — and reports
 * that base back as `root`. Copy Path rebuilds the absolute path from those
 * two halves; a relative path on its own is not resolvable outside the panel
 * (the client-side `rootPath` may be `~`-relative, rejected by the server, or
 * absent entirely in mock mode).
 */
export function toAbsolutePath(baseDir: string | null | undefined, relPath: string): string {
  // `/`- and `./`-prefixed raws are stripped; a dot-file name (`.env`) is not a prefix.
  const rel = relPath.replace(/^(?:\.?[/\\])+/, '').replace(/[/\\]+$/, '');
  const base = (baseDir ?? '').replace(/[/\\]+$/, '');
  if (!base) return rel;
  if (!rel) return base;
  // Join with the base's own separator: `C:\proj` + `src` → `C:\proj\src`.
  return `${base}${base.includes('\\') && !base.includes('/') ? '\\' : '/'}${rel}`;
}
