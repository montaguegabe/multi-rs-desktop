import { convertFileSrc } from '@tauri-apps/api/core';
import type { DiffFile } from 'diff2html/lib/types.js';
import type { FileEntry } from '../types';
import { normalizeDiffPath } from '../utils/diffEntries';

export function statusLabel(s: FileEntry['status']): string {
  switch (s) {
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'modified':
      return 'M';
  }
}

export function statusColor(s: FileEntry['status']): string {
  switch (s) {
    case 'added':
      return 'text-green-500';
    case 'deleted':
      return 'text-red-500';
    case 'renamed':
      return 'text-blue-500';
    case 'modified':
      return 'text-yellow-500';
  }
}

export function formatHistoryTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Tauri webviews cannot load `file://`; serve local files through the asset protocol. */
function toFileUrl(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}

export function getCurrentFilePreviewUrl(
  entry: FileEntry | null,
): string | undefined {
  if (!entry || entry.file.isDeleted) return undefined;

  const nextPath = normalizeDiffPath(entry.file.newName);
  const relPath =
    nextPath && nextPath !== '/dev/null' ? nextPath : entry.displayPath;
  if (!relPath) return undefined;

  const repoBase = entry.repoPath.replace(/[\\/]+$/, '');
  const normalizedRelPath = relPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
  return toFileUrl(`${repoBase}/${normalizedRelPath}`);
}

export type HistoryDiffEntry = {
  key: string;
  repoName: string;
  repoPath: string;
  displayPath: string;
  status: FileEntry['status'];
  file: DiffFile;
};
