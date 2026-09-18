export function setChildrenAt(nodes: any[], path: string, children: any[]): any[] {
  return nodes.map(node => {
    if (node.path === path) return { ...node, children, is_expanded: 1 };
    if (Array.isArray(node.children)) {
      const nested = setChildrenAt(node.children, path, children);
      if (nested !== node.children) return { ...node, children: nested };
    }
    return node;
  });
}

export function rehydrateTree(nodes: any[], cache: Record<string, any[]>, expanded: Set<string>): any[] {
  return nodes.map(node => {
    if (node.type !== 'folder') return node;
    const cached = cache[node.path];
    const wasExpanded = expanded.has(node.path);
    if (cached) {
      return {
        ...node,
        children: rehydrateTree(cached, cache, expanded),
        is_expanded: wasExpanded ? 1 : 0,
      };
    }
    return node;
  });
}
