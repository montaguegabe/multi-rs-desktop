import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, GitBranch } from 'lucide-react';
import {
  DiffViewer,
  DiffSelection,
  DiffSelectionType,
  formatPatch,
  formatDiscardPatch,
  parseDiff,
  LineType,
  buildRepoFileEntries,
  type ContextMenuAction,
  type HistoryGroup,
  type NativeContextMenuItem,
  type DiscardTarget,
  type Repository,
  type FileEntry,
} from 'multi-react';
import { alertDialog, confirmDialog, errorMessage, repoService } from '../lib/bridge';
import type { RepoBranch, RepoSyncState } from '../lib/types';
import { summarizeBranches } from './branchSummary';
import { summarizeSyncStates } from './syncSummary';
import { getContextMenuActions } from './contextMenuActions';
import CommitPanel from './CommitPanel';

function summarizeSyncError(error: unknown): string {
  const lines = errorMessage(error)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('To https://') && !line.startsWith('hint:'));

  if (lines.length === 0) {
    return 'Unknown sync error';
  }

  // Prefer our push-phase context, then actionable Git rejection lines.
  const actionable =
    lines.find(
      (line) =>
        line.startsWith('Push failed') ||
        line.startsWith('Push was rejected') ||
        line.startsWith('Could not fast-forward'),
    ) ??
    lines.find((line) => line.includes('[rejected]')) ??
    lines.find((line) => line.startsWith('error:')) ??
    lines.find((line) => !line.startsWith('Command failed:')) ??
    lines[0];

  const supporting =
    lines.find(
      (line) =>
        line !== actionable &&
        (line.includes('[rejected]') || line.startsWith('error:') || line.startsWith('fatal:')),
    ) ?? null;

  return supporting ? `${actionable} (${supporting})` : actionable;
}

function isNoPushDestinationError(error: unknown): boolean {
  const raw = errorMessage(error);
  return raw.includes('No configured push destination') || raw.includes('has no upstream branch');
}

function normalizeFilePathForCompare(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function diffPathToRepoPath(diffPath: string): string | null {
  const stripped = diffPath.replace(/^[ab]\//, '');
  if (!stripped || stripped === '/dev/null' || stripped === 'dev/null') {
    return null;
  }
  return stripped;
}

function getStagePathsForEntry(entry: FileEntry): string[] {
  const paths = new Set<string>();
  const oldPath = diffPathToRepoPath(entry.file.oldName);
  const newPath = diffPathToRepoPath(entry.file.newName);

  if (oldPath) paths.add(oldPath);
  if (newPath) paths.add(newPath);
  if (paths.size === 0 && entry.displayPath) {
    paths.add(entry.displayPath);
  }

  return [...paths];
}

function describeUnpatchableSelection(entry: FileEntry): string {
  const oldPath = diffPathToRepoPath(entry.file.oldName);
  const newPath = diffPathToRepoPath(entry.file.newName);

  if (entry.status === 'renamed' && oldPath && newPath && oldPath !== newPath) {
    return `- renamed: ${oldPath} -> ${newPath}`;
  }

  if (entry.file.isBinary) {
    return `- ${entry.status}: ${entry.displayPath} (binary)`;
  }

  return `- ${entry.status}: ${entry.displayPath}`;
}

/** Move the deep-linked file's patch to the top of a repo diff. */
function prioritizeTargetFile(diff: string, targetFilePath: string): string {
  const normalizedTarget = normalizeFilePathForCompare(targetFilePath);
  if (!normalizedTarget || !diff.trim()) return diff;

  const files = parseDiff(diff);
  if (files.length < 2) return diff;

  const targetIndex = files.findIndex((file) => {
    const displayPath = file.isDeleted
      ? file.oldName.replace(/^[ab]\//, '')
      : file.newName.replace(/^[ab]\//, '');
    return normalizeFilePathForCompare(displayPath) === normalizedTarget;
  });

  if (targetIndex <= 0) return diff;

  const orderedFiles = [files[targetIndex], ...files.filter((_file, index) => index !== targetIndex)];
  const allSelected = DiffSelection.fromInitialSelection(DiffSelectionType.All);

  const rebuiltDiff = orderedFiles
    .map((file) => formatPatch(file, allSelected, file.isNew === true))
    .filter((patch): patch is string => Boolean(patch))
    .join('');

  return rebuiltDiff || diff;
}

type PushFailure = {
  repoPath: string;
  message: string;
  needsDestinationFix: boolean;
};

function repoDisplayName(repoPath: string): string {
  return repoPath.split('/').pop() || repoPath;
}

export default function RepoDiff() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const repoPath = searchParams.get('path') ?? '';
  const targetFilePath = searchParams.get('file') ?? '';
  const repoName = searchParams.get('name') ?? repoDisplayName(repoPath);

  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [branches, setBranches] = useState<RepoBranch[]>([]);
  const [syncStatesByRepoPath, setSyncStatesByRepoPath] = useState<Record<string, RepoSyncState>>({});

  const [selections, setSelections] = useState<Record<string, DiffSelection>>({});
  const [committing, setCommitting] = useState(false);
  const [pushingAll, setPushingAll] = useState(false);
  const [hasPushableChanges, setHasPushableChanges] = useState(false);

  const fetchDiff = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setHistoryLoading(true);

      try {
        const detail = await repoService.getProjectDetail(repoPath);
        const projectRepositories = detail.repositories.map((repo) => ({
          ...repo,
          diff: repo.path === repoPath ? prioritizeTargetFile(repo.diff, targetFilePath) : repo.diff,
        }));

        setRepositories(
          projectRepositories.length > 0
            ? projectRepositories
            : [{ path: repoPath, name: repoName, diff: '' }],
        );
        setHistoryGroups(detail.historyGroups);
        setBranches(detail.branches ?? []);
        setSyncStatesByRepoPath(detail.syncStatesByRepoPath);
        setHasPushableChanges(
          Object.values(detail.syncStatesByRepoPath).some((state) => state.ahead > 0),
        );
        setLoadError(null);
      } catch (err) {
        setRepositories([]);
        setHistoryGroups([]);
        setBranches([]);
        setSyncStatesByRepoPath({});
        setHasPushableChanges(false);
        setLoadError(errorMessage(err));
      } finally {
        setLoading(false);
        setHistoryLoading(false);
      }
    },
    [repoPath, repoName, targetFilePath],
  );

  useEffect(() => {
    void fetchDiff();
  }, [fetchDiff]);

  // Build entries for commit mode summary & orchestration
  const entries = useMemo(() => buildRepoFileEntries(repositories).entries, [repositories]);

  // Keep selections in sync with entries: add new files as All, remove stale keys
  useEffect(() => {
    setSelections((prev) => {
      const next: Record<string, DiffSelection> = {};
      for (const entry of entries) {
        next[entry.key] = prev[entry.key] ?? DiffSelection.fromInitialSelection(DiffSelectionType.All);
      }
      return next;
    });
  }, [entries]);

  // Count selected lines for summary
  const summary = useMemo(() => {
    let files = 0;
    let lines = 0;
    for (const entry of entries) {
      const sel = selections[entry.key];
      if (!sel) continue;
      if (sel.getSelectionType() === DiffSelectionType.None) continue;
      files++;
      let idx = 0;
      for (const block of entry.file.blocks) {
        for (const line of block.lines) {
          if ((line.type === LineType.INSERT || line.type === LineType.DELETE) && sel.isSelected(idx)) {
            lines++;
          }
          idx++;
        }
      }
    }
    return { files, lines };
  }, [entries, selections]);

  // Repos that have selected changes
  const reposWithChanges = useMemo(() => {
    const names = new Set<string>();
    for (const entry of entries) {
      const sel = selections[entry.key];
      if (sel && sel.getSelectionType() !== DiffSelectionType.None) {
        names.add(entry.repoName);
      }
    }
    return [...names];
  }, [entries, selections]);

  const repoPathByName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const repo of repositories) {
      map[repo.name] = repo.path;
    }
    return map;
  }, [repositories]);

  const handleStageAndCommit = useCallback(
    async (messages: Record<string, string>) => {
      setCommitting(true);
      try {
        const byRepo: Record<string, FileEntry[]> = {};
        for (const entry of entries) {
          const sel = selections[entry.key];
          if (!sel || sel.getSelectionType() === DiffSelectionType.None) continue;
          (byRepo[entry.repoName] ??= []).push(entry);
        }

        for (const [name, repoEntries] of Object.entries(byRepo)) {
          const rPath = repoPathByName[name];
          if (!rPath) continue;

          const patchParts: string[] = [];
          const fullySelectedPaths = new Set<string>();

          for (const entry of repoEntries) {
            const sel = selections[entry.key];
            if (!sel) continue;
            if (sel.getSelectionType() === DiffSelectionType.All) {
              // Full-file selection does not need patch application. Using git add
              // avoids unnecessary hunk apply failures on deletes/renames.
              for (const filePath of getStagePathsForEntry(entry)) {
                fullySelectedPaths.add(filePath);
              }
              continue;
            }
            // Partial selection requires patch application.
            const patch = formatPatch(entry.file, sel, entry.file.isNew === true);
            if (patch) {
              patchParts.push(patch);
            }
          }

          const stageFilePaths = [...fullySelectedPaths];
          if (patchParts.length === 0 && stageFilePaths.length === 0) continue;

          if (patchParts.length > 0) {
            await repoService.stageChanges(rPath, patchParts.join(''));
          }
          if (stageFilePaths.length > 0) {
            await repoService.stageFiles(rPath, stageFilePaths);
          }
          const message = messages[name];
          if (message) {
            await repoService.commit(rPath, message);
          }
        }

        void fetchDiff();
      } finally {
        setCommitting(false);
      }
    },
    [entries, selections, repoPathByName, fetchDiff],
  );

  const buildSelectedDiffForRepo = useCallback(
    (name: string): string => {
      const patches: string[] = [];
      const nonPatchable: string[] = [];
      for (const entry of entries) {
        if (entry.repoName !== name) continue;
        const sel = selections[entry.key];
        if (!sel) continue;
        const selType = sel.getSelectionType();
        if (selType === DiffSelectionType.None) continue;
        const patch = formatPatch(entry.file, sel, entry.file.isNew === true);
        if (patch) {
          patches.push(patch);
        } else if (selType === DiffSelectionType.All) {
          nonPatchable.push(describeUnpatchableSelection(entry));
        }
      }

      if (nonPatchable.length > 0) {
        patches.push(['# Non-text or metadata-only selected changes', ...nonPatchable].join('\n'));
      }
      return patches.join('\n');
    },
    [entries, selections],
  );

  const handleGenerateSingleMessage = useCallback(async (): Promise<string> => {
    const parts: string[] = [];
    for (const name of reposWithChanges) {
      const repoDiff = buildSelectedDiffForRepo(name);
      if (!repoDiff.trim()) continue;
      parts.push(reposWithChanges.length > 1 ? `# Repo: ${name}\n${repoDiff}` : repoDiff);
    }
    const diff = parts.join('\n');
    if (!diff.trim()) {
      throw new Error('No selected changes to summarize.');
    }
    return repoService.generateCommitMessage(diff);
  }, [reposWithChanges, buildSelectedDiffForRepo]);

  const handleGenerateRepoMessage = useCallback(
    async (name: string): Promise<string> => {
      const diff = buildSelectedDiffForRepo(name);
      if (!diff.trim()) {
        throw new Error(`No selected changes for ${name}.`);
      }
      return repoService.generateCommitMessage(diff);
    },
    [buildSelectedDiffForRepo],
  );

  const handleDiscard = useCallback(
    async (target: DiscardTarget) => {
      const { fileEntry } = target;
      try {
        if (target.type === 'file') {
          await repoService.discardFile(fileEntry.repoPath, fileEntry.displayPath, fileEntry.file.isNew === true);
        } else {
          let selection = DiffSelection.fromInitialSelection(DiffSelectionType.None);
          for (const idx of target.lineIndices) {
            selection = selection.withLineSelection(idx, true);
          }
          const patch = formatDiscardPatch(fileEntry.file, selection);
          if (patch) {
            await repoService.discardLines(fileEntry.repoPath, patch);
          }
        }
      } catch (err) {
        await alertDialog(`Discard failed for ${fileEntry.displayPath}:\n${errorMessage(err)}`);
      }
      void fetchDiff();
    },
    [fetchDiff],
  );

  const handlePushAll = useCallback(async () => {
    setPushingAll(true);
    try {
      const repoPaths = [...new Set(repositories.map((repo) => repo.path))];
      if (repoPaths.length === 0) return;

      const pushOne = async (rPath: string, needsDestinationFix: boolean): Promise<PushFailure | null> => {
        try {
          if (needsDestinationFix) {
            await repoService.createPrivateRepoAndPush(rPath);
          } else {
            await repoService.push(rPath);
          }
          return null;
        } catch (error: unknown) {
          return {
            repoPath: rPath,
            message: summarizeSyncError(error),
            needsDestinationFix: !needsDestinationFix && isNoPushDestinationError(error),
          };
        }
      };

      const pushResults = await Promise.all(repoPaths.map((rPath) => pushOne(rPath, false)));
      let failures = pushResults.filter((failure): failure is PushFailure => failure !== null);

      const destinationFailures = failures.filter((f) => f.needsDestinationFix);
      if (destinationFailures.length > 0) {
        const names = destinationFailures.map(({ repoPath: p }) => repoDisplayName(p));
        const prompt = `Some repos have no push destination:\n${names.join('\n')}\n\nCreate a new private GitHub repo (if needed) and retry push?`;
        if (await confirmDialog(prompt)) {
          const retryResults = await Promise.all(
            destinationFailures.map((failure) => pushOne(failure.repoPath, true)),
          );
          failures = [
            ...failures.filter((f) => !f.needsDestinationFix),
            ...retryResults.filter((failure): failure is PushFailure => failure !== null),
          ];
        }
      }

      await fetchDiff();

      if (failures.length > 0) {
        const maxShown = 5;
        const shown = failures
          .slice(0, maxShown)
          .map(({ repoPath: p, message }) => `${repoDisplayName(p)}: ${message}`);
        const extra = failures.length > maxShown ? `\n...and ${failures.length - maxShown} more.` : '';
        await alertDialog(
          `Sync completed with errors (${repoPaths.length - failures.length}/${repoPaths.length} repos synced):\n${shown.join('\n')}${extra}`,
        );
      }
    } finally {
      setPushingAll(false);
    }
  }, [repositories, fetchDiff]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'p') return;
      event.preventDefault();
      if (!pushingAll) {
        void handlePushAll();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePushAll, pushingAll]);

  const fileContextActions: ContextMenuAction[] = useMemo(() => {
    return getContextMenuActions(repoPath).map((action) => ({
      label: action.label,
      onClick: (target: { repoPath: string; displayPath?: string }) => {
        const fullPath = target.displayPath ? `${target.repoPath}/${target.displayPath}` : target.repoPath;
        action.onClick(target.repoPath, fullPath);
      },
    }));
  }, [repoPath]);

  const showNativeContextMenu = useCallback(
    (items: NativeContextMenuItem[]) => repoService.showContextMenu(items),
    [],
  );

  const handleOpenRepoInGitHubWeb = useCallback(async (selectedRepoPath: string) => {
    try {
      await repoService.openInGitHubWeb(selectedRepoPath);
    } catch {
      await alertDialog(
        `Unable to open GitHub web URL for ${repoDisplayName(selectedRepoPath)}. Ensure the origin remote points to GitHub.`,
      );
    }
  }, []);

  const loadHistoryGroupDiff = useCallback(async (group: HistoryGroup) => {
    return repoService.getHistoryGroupDiff(
      group.commits.map((commit) => ({
        repoPath: commit.repoPath,
        repoName: commit.repoName,
        hash: commit.hash,
      })),
    );
  }, []);

  const branchSummary = useMemo(() => summarizeBranches(branches), [branches]);
  const syncSummary = useMemo(() => summarizeSyncStates(syncStatesByRepoPath), [syncStatesByRepoPath]);

  const titleMeta =
    branchSummary || syncSummary ? (
      <span className="inline-flex items-center gap-2 min-w-0">
        {branchSummary ? (
          <span className="inline-flex items-center gap-1 min-w-0 max-w-96" title={branchSummary.title}>
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{branchSummary.label}</span>
          </span>
        ) : null}
        {syncSummary ? (
          <span
            className="inline-flex items-center gap-1 shrink-0 rounded px-1.5 py-0.5 text-amber-500 bg-amber-500/10"
            title={syncSummary.title}
          >
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
            <span>{syncSummary.label}</span>
          </span>
        ) : null}
      </span>
    ) : undefined;

  return (
    <div className="flex flex-col h-full">
      {loadError && (
        <div className="px-4 py-2 text-xs text-red-500 bg-red-500/10 border-b border-border shrink-0">
          Could not load this project: {loadError}
        </div>
      )}
      <DiffViewer
        repositories={repositories}
        loading={loading}
        title={repoName}
        titleMeta={titleMeta}
        onRefresh={fetchDiff}
        onPushAll={handlePushAll}
        pushingAll={pushingAll}
        showPushIndicator={hasPushableChanges}
        onBack={() => navigate('/')}
        onOpenRepoInGitHubWeb={handleOpenRepoInGitHubWeb}
        fileContextActions={fileContextActions}
        onDiscard={handleDiscard}
        selections={selections}
        onSelectionChange={(fileKey, selection) =>
          setSelections((prev) => ({ ...prev, [fileKey]: selection }))
        }
        historyGroups={historyGroups}
        historyLoading={historyLoading}
        loadHistoryGroupDiff={loadHistoryGroupDiff}
        commitPanel={
          entries.length > 0 ? (
            <CommitPanel
              repoNames={reposWithChanges}
              onCommit={handleStageAndCommit}
              onGenerateSingleMessage={handleGenerateSingleMessage}
              onGenerateRepoMessage={handleGenerateRepoMessage}
              summary={summary}
              committing={committing}
            />
          ) : undefined
        }
        showNativeContextMenu={showNativeContextMenu}
      />
    </div>
  );
}
