/**
 * Path helpers shared by the Files panel and every surface that opens a file.
 *
 * `/api/fs/dir` emits every entry as a path relative to the listing's base
 * directory — the workspace root, or the selected nested repo — and reports
 * that base back as `root`. Copy Path rebuilds the absolute path from those
 * two halves; a relative path on its own is not resolvable outside the panel
 * (the client-side `rootPath` may be `~`-relative, rejected by the server, or
 * absent entirely in mock mode).
 *
 * `buildFsRawUrl` is the byte-stream counterpart of that same scoping: it is
 * what an image tab points its `<img>` at, so the file it names is the file
 * the tab names, nested repo included.
 */

/**
 * URL of one file's raw bytes through `/api/fs/raw`, carrying the same scope
 * (`root`, nested `repo`) as `/api/fs/read` so an image opened from a nested
 * repo resolves to the file the tab names. `repo: '.'` is omitted: the server
 * treats an absent repo as the scoped root.
 */
export function buildFsRawUrl(file: { path: string; root?: string; repo?: string }): string {
  const params = new URLSearchParams({ path: file.path });
  if (file.root) params.set('root', file.root);
  if (file.repo && file.repo !== '.') params.set('repo', file.repo);
  return `/api/fs/raw?${params.toString()}`;
}

export function toAbsolutePath(baseDir: string | null | undefined, relPath: string): string {
  // `/`- and `./`-prefixed raws are stripped; a dot-file name (`.env`) is not a prefix.
  const rel = relPath.replace(/^(?:\.?[/\\])+/, '').replace(/[/\\]+$/, '');
  const base = (baseDir ?? '').replace(/[/\\]+$/, '');
  if (!base) return rel;
  if (!rel) return base;
  // Join with the base's own separator: `C:\proj` + `src` → `C:\proj\src`.
  return `${base}${base.includes('\\') && !base.includes('/') ? '\\' : '/'}${rel}`;
}
