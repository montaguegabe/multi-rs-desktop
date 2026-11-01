export { DiffViewer } from './components/DiffViewer';
export { FilePath } from './components/FilePath';
export type {
  Repository,
  FileEntry,
  DiffViewerProps,
  ContextMenuTarget,
  ContextMenuAction,
  NativeContextMenuItem,
  DiscardTarget,
  HistoryCommit,
  HistoryGroup,
  HistoryCommitRef,
  HistoryRepoDiff,
} from './types';
export { cn } from './utils/cn';
export { DiffSelection, DiffSelectionType } from './models/DiffSelection';
export { formatPatch, formatDiscardPatch } from './utils/formatPatch';
export {
  getDisplayPath,
  getFileStatus,
  buildRepoFileEntries,
} from './utils/diffEntries';
export { worktreeDisplayName } from './utils/worktreeDisplayName';
export {
  mergeWorktreeStatusUpdates,
  flattenWorktreePaths,
} from './utils/worktreeTree';
export type { WorktreeTreeNode } from './utils/worktreeTree';
export {
  useCollapsedPaths,
  parseCollapsedPaths,
  serializeCollapsedPaths,
} from './hooks/useCollapsedPaths';

// Wrapper around diff2html that preserves "\ No newline at end of file" info
export { parseDiff } from './utils/parseDiff';
export { LineType } from 'diff2html/lib/types.js';
export type { DiffFile, DiffBlock, DiffLine } from 'diff2html/lib/types.js';
