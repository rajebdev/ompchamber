// Minimal path helpers for the CLI — Bun has no path builtin (Bun.path is
// undefined), and the CLI only needs POSIX-style join/resolve/dirname on
// absolute native paths.

/** Join path segments with the platform separator without duplicated separators. */
export function joinPath(...segments) {
  let joined = '';
  for (const segment of segments) {
    if (!segment) continue;
    if (!joined) {
      joined = segment;
    } else if (joined.endsWith('/') || segment.startsWith('/')) {
      joined = `${joined.replace(/\/+$/, '')}/${segment.replace(/^\/+/, '')}`;
    } else {
      joined = `${joined}/${segment}`;
    }
  }
  return joined;
}

/** Resolve a path to an absolute normalized path. */
export function resolvePath(...segments) {
  const joined = joinPath(...segments);
  if (joined.startsWith('/')) {
    return joined.replace(/\/{2,}/g, '/').replace(/(.+)\/$/, '$1');
  }
  return joinPath(process.cwd(), joined).replace(/\/{2,}/g, '/').replace(/(.+)\/$/, '$1');
}

/** Directory portion of an absolute path ('/' for the root). */
export function dirnameOf(value) {
  const index = value.lastIndexOf('/');
  if (index <= 0) return '/';
  return value.slice(0, index);
}

/** Current user home directory (Bun.env.HOME; matches os.homedir on POSIX). */
export function homeDir() {
  return Bun.env.HOME || '';
}
