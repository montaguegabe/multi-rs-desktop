/**
 * Payload types shared with the Rust side (`multi_core::app_api`, serialized
 * in camelCase). Kept identical to the Electron app's contract.
 */
import type { HistoryGroup, Repository } from 'multi-react';

export interface NavigateToRepoPayload {
  repoPath: string;
  filePath?: string;
}

export type RepoStatus = 'clean' | 'dirty' | 'out-of-sync' | 'no_git' | 'missing' | 'unknown';

export interface DoctorResult {
  errors: string[];
  warnings: string[];
}

export interface RepoSyncState {
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  isRepo: boolean;
}

export interface SubRepo {
  name: string;
  path: string;
}

export interface RepoBranch {
  name: string;
  path: string;
  branch: string;
}

export interface ProjectSummary {
  path: string;
  name?: string;
  status: RepoStatus;
  lastModifiedMs?: number | null;
  lastCommitMs?: number | null;
  doctorResult?: DoctorResult | null;
  subRepos?: SubRepo[] | null;
  branches?: RepoBranch[];
  /** Linked git worktrees of this trunk workspace, populated by the app. */
  worktrees?: ProjectSummary[];
}

export interface ProjectDetail {
  repoPath: string;
  repositories: Repository[];
  historyGroups: HistoryGroup[];
  syncStatesByRepoPath: Record<string, RepoSyncState>;
  subRepos: SubRepo[] | null;
  branches?: RepoBranch[];
}
