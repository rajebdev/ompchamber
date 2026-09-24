import type { FsNode } from '@/shared/types';

/** Replace the children of the node at `path`, rebuilding only that branch. */
export function setChildrenAt(nodes: FsNode[], path: string, children: FsNode[]): FsNode[] {
  return nodes.map(node => {
    if (node.path === path) return { ...node, children };
    if (Array.isArray(node.children)) {
      const nested = setChildrenAt(node.children, path, children);
      if (nested !== node.children) return { ...node, children: nested };
    }
    return node;
  });
}

/**
 * Re-attach the children already loaded for a folder, so a re-listing of the
 * same tree does not collapse what the user had open.
 *
 * Which folders are open is the caller's `expandedPaths` set, keyed by paths
 * RELATIVE to the listed root — which is why the caller must drop both that set
 * and the cache when the listed root changes: `src/` under one workspace would
 * otherwise rehydrate into `src/` under the next.
 */
export function rehydrateTree(nodes: FsNode[], cache: Record<string, FsNode[]>): FsNode[] {
  return nodes.map(node => {
    if (node.type !== 'folder') return node;
    const cached = cache[node.path];
    if (!cached) return node;
    return { ...node, children: rehydrateTree(cached, cache) };
  });
}
