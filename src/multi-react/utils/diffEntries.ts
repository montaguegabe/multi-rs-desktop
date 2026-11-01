import type { DiffFile } from 'diff2html/lib/types.js';
import type { FileEntry, HistoryRepoDiff, Repository } from '../types';
import { parseDiff } from './parseDiff';

export function normalizeDiffPath(path: string): string {
  return path.replace(/^[ab]\//, '');
}

export function getDisplayPath(file: DiffFile): string {
  return file.isDeleted
    ? normalizeDiffPath(file.oldName)
    : normalizeDiffPath(file.newName);
}

export function getFileStatus(file: DiffFile): FileEntry['status'] {
  if (file.isNew) return 'added';
  if (file.isDeleted) return 'deleted';
  if (file.isRename || file.isCopy) return 'renamed';
  return 'modified';
}

export function buildRepoFileEntries(
  repositories: Repository[],
): { entries: FileEntry[]; byRepo: Record<string, FileEntry[]> } {
  const entries: FileEntry[] = [];
  const byRepo: Record<string, FileEntry[]> = {};

  for (const repo of repositories) {
    const repoEntries: FileEntry[] = [];

    if (repo.diff.trim()) {
      const files = parseDiff(repo.diff);
      for (const file of files) {
        const entry = buildFileEntry({
          repoName: repo.name,
          repoPath: repo.path,
          file,
          keyPrefix: repo.name,
        });
        entries.push(entry);
        repoEntries.push(entry);
      }
    }

    byRepo[repo.name] = repoEntries;
  }

  return { entries, byRepo };
}

export function buildHistoryFileEntries(
  groupId: string,
  repoDiffs: HistoryRepoDiff[],
): FileEntry[] {
  return repoDiffs.flatMap((repoDiff) => {
    if (!repoDiff.diff.trim()) return [];
    return parseDiff(repoDiff.diff).map((file, index) =>
      buildFileEntry({
        repoName: repoDiff.repoName,
        repoPath: repoDiff.repoPath,
        file,
        keyPrefix: `history::${groupId}::${repoDiff.repoName}`,
        keySuffix: String(index),
      }),
    );
  });
}

function buildFileEntry({
  repoName,
  repoPath,
  file,
  keyPrefix,
  keySuffix,
}: {
  repoName: string;
  repoPath: string;
  file: DiffFile;
  keyPrefix: string;
  keySuffix?: string;
}): FileEntry {
  const displayPath = getDisplayPath(file);
  return {
    repoName,
    repoPath,
    file,
    displayPath,
    status: getFileStatus(file),
    key: [keyPrefix, displayPath, keySuffix].filter(Boolean).join('::'),
  };
}
