/** Last path component (the folder or file name), or the path itself when it has none. */
export function folderName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  return trimmed.split(/[\\/]/).pop() || path;
}
