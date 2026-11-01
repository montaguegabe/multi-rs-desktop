import { folderName } from '../lib/paths';
import type { RepoSyncState } from '../lib/types';

export type SyncSummary = {
  label: string;
  title: string;
};

export function summarizeSyncStates(
  syncStatesByRepoPath: Record<string, RepoSyncState>,
): SyncSummary | null {
  const outOfSync = Object.entries(syncStatesByRepoPath).filter(
    ([, state]) => state.isRepo && (state.ahead > 0 || state.behind > 0),
  );
  if (outOfSync.length === 0) {
    return null;
  }

  const totalAhead = outOfSync.reduce((sum, [, state]) => sum + state.ahead, 0);
  const totalBehind = outOfSync.reduce((sum, [, state]) => sum + state.behind, 0);
  const parts: string[] = [];
  if (totalAhead > 0) parts.push(`${totalAhead}↑`);
  if (totalBehind > 0) parts.push(`${totalBehind}↓`);

  const title = outOfSync
    .map(([repoPath, state]) => {
      const details: string[] = [];
      if (state.ahead > 0) details.push(`${state.ahead} ahead`);
      if (state.behind > 0) details.push(`${state.behind} behind`);
      return `${folderName(repoPath)}: ${details.join(', ')}`;
    })
    .join('\n');

  return {
    label: `out of sync ${parts.join(' ')}`.trim(),
    title,
  };
}
