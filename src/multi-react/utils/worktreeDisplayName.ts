const SEPARATORS = new Set(['-', '_', '.', ' ']);

function trimSeparators(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && SEPARATORS.has(value[start])) start += 1;
  while (end > start && SEPARATORS.has(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

/**
 * Display name for a worktree folder, relative to its trunk workspace folder.
 *
 * When the trunk folder name prefixes or suffixes the worktree folder name it
 * is stripped (along with any joining separator), so a worktree of
 * `my-app` named `my-app-fix-login` or `fix-login-my-app` displays as
 * `fix-login`. Falls back to the raw folder name when the trunk name is not
 * present or stripping would leave nothing.
 */
export function worktreeDisplayName(
  worktreeFolderName: string,
  trunkFolderName: string,
): string {
  if (!worktreeFolderName || !trunkFolderName) return worktreeFolderName;

  const folderLower = worktreeFolderName.toLowerCase();
  const trunkLower = trunkFolderName.toLowerCase();

  let stripped: string | null = null;
  if (folderLower.startsWith(trunkLower)) {
    stripped = worktreeFolderName.slice(trunkFolderName.length);
  } else if (folderLower.endsWith(trunkLower)) {
    stripped = worktreeFolderName.slice(
      0,
      worktreeFolderName.length - trunkFolderName.length,
    );
  }
  if (stripped === null) return worktreeFolderName;

  return trimSeparators(stripped) || worktreeFolderName;
}
