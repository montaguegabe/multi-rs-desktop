import type { ReactNode } from 'react';
import type { DiffFile } from 'diff2html/lib/types.js';
import type { DiffSelection } from './models/DiffSelection';

export interface Repository {
  path: string;
  name: string;
  diff: string;
}

export interface FileEntry {
  repoName: string;
  repoPath: string;
  file: DiffFile;
  /** Display name: shortest unique path segment */
  displayPath: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  key: string;
}

export interface ContextMenuTarget {
  repoName: string;
  repoPath: string;
  displayPath: string;
}

export interface ContextMenuAction {
  label: string;
  onClick: (target: ContextMenuTarget) => void;
}

export interface NativeContextMenuItem {
  id?: string;
  label?: string;
  enabled?: boolean;
  type?: 'normal' | 'separator';
}

export interface HistoryCommit {
  hash: string;
  shortHash: string;
  subject: string;
  description: string;
  authorName: string;
  authorEmail: string;
  authoredAtMs: number;
  authoredAtIso: string;
  repoPath: string;
  repoName: string;
}

export interface HistoryGroup {
  id: string;
  newestAuthoredAtMs: number;
  oldestAuthoredAtMs: number;
  authoredAtIso: string;
  repoNames: string[];
  commits: HistoryCommit[];
}

export interface HistoryCommitRef {
  repoPath: string;
  repoName: string;
  hash: string;
}

export interface HistoryRepoDiff {
  repoPath: string;
  repoName: string;
  diff: string;
}

export type DiscardTarget =
  | { type: 'file'; fileEntry: FileEntry }
  | { type: 'lines'; fileEntry: FileEntry; lineIndices: number[] };

export interface DiffViewerProps {
  repositories: Repository[];
  loading?: boolean;
  title?: string;
  titleMeta?: ReactNode;
  onRefresh?: () => void;
  onPushAll?: () => void;
  pushingAll?: boolean;
  showPushIndicator?: boolean;
  onBack?: () => void;
  mobile?: boolean;
  fileContextActions?: ContextMenuAction[];

  /** Per-file line selections (presence of onSelectionChange enables selection mode) */
  selections?: Record<string, DiffSelection>;
  onSelectionChange?: (fileKey: string, selection: DiffSelection) => void;

  /** Commit panel slot rendered below the diff content */
  commitPanel?: ReactNode;

  /** Called when user confirms discarding changes via context menu */
  onDiscard?: (target: DiscardTarget) => void;

  /** Optional native/system context menu integration */
  showNativeContextMenu?: (
    items: NativeContextMenuItem[],
  ) => Promise<string | null>;

  /** Optional combined git history for sidebar timeline view */
  historyGroups?: HistoryGroup[];
  historyLoading?: boolean;
  loadHistoryGroupDiff?: (group: HistoryGroup) => Promise<HistoryRepoDiff[]>;

  /** Open repository on GitHub in the browser */
  onOpenRepoInGitHubWeb?: (repoPath: string) => void;
}
