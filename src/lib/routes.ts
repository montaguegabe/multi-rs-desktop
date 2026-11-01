import { folderName } from './paths';

export type DiffRouteTarget = {
  repoPath: string;
  /** Display name; defaults to the repository folder name. */
  name?: string;
  /** File to show first, relative to the repository. */
  filePath?: string;
};

/** The diff screen for a repository, optionally focused on one file. */
export function diffRoute({ repoPath, name, filePath }: DiffRouteTarget): string {
  const params = new URLSearchParams({ path: repoPath, name: name || folderName(repoPath) });
  if (filePath) {
    params.set('file', filePath);
  }
  return `/diff?${params.toString()}`;
}
