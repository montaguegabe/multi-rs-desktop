/**
 * Minimal shape shared by any project list that nests worktree checkouts
 * under their trunk workspace.
 */
export interface WorktreeTreeNode {
  path: string;
  worktrees?: WorktreeTreeNode[];
}

/**
 * Merge flat per-path status updates (dirty/clean/out-of-sync, branches, …)
 * into an existing project tree, matching both trunk projects and their
 * nested worktrees by path. Node order and unmatched nodes are preserved.
 */
export function mergeWorktreeStatusUpdates<T extends WorktreeTreeNode>(
  current: T[],
  updates: Array<Partial<T> & { path: string }>,
): T[] {
  const byPath = new Map(updates.map((update) => [update.path, update]));
  const mergeOne = (node: T): T => ({
    ...node,
    ...(byPath.get(node.path) ?? {}),
    worktrees: (node.worktrees as T[] | undefined)?.map(mergeOne),
  });
  return current.map(mergeOne);
}

/**
 * Every path in a project tree — each trunk project followed by its
 * worktrees — for use when polling statuses for the whole list.
 */
export function flattenWorktreePaths<T extends WorktreeTreeNode>(
  nodes: T[],
): string[] {
  return nodes.flatMap((node) => [
    node.path,
    ...flattenWorktreePaths(node.worktrees ?? []),
  ]);
}
