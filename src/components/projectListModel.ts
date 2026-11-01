import { flattenWorktreePaths, mergeWorktreeStatusUpdates } from 'multi-react';
import type { ProjectSummary } from '../lib/types';

export function sortProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort((a, b) => {
    const dirtyRankA = a.status === 'dirty' ? 0 : 1;
    const dirtyRankB = b.status === 'dirty' ? 0 : 1;
    if (dirtyRankA !== dirtyRankB) return dirtyRankA - dirtyRankB;

    const commitDiff = (b.lastCommitMs ?? 0) - (a.lastCommitMs ?? 0);
    if (commitDiff !== 0) return commitDiff;

    const modifiedDiff = (b.lastModifiedMs ?? 0) - (a.lastModifiedMs ?? 0);
    if (modifiedDiff !== 0) return modifiedDiff;

    const nameA = a.name || a.path;
    const nameB = b.name || b.path;
    return nameA.localeCompare(nameB);
  });
}

export function mergeProjectUpdates(
  current: ProjectSummary[],
  updates: ProjectSummary[],
): ProjectSummary[] {
  return sortProjects(mergeWorktreeStatusUpdates(current, updates));
}

export function flattenProjectPaths(projects: ProjectSummary[]): string[] {
  return flattenWorktreePaths(projects);
}

export function folderName(projectPath: string): string {
  return projectPath.split('/').pop() || projectPath;
}
