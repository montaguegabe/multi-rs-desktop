import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ContextMenuTarget,
  DiscardTarget,
  DiffViewerProps,
  FileEntry,
} from '../types';
import type { GroupInfo } from './DiffRenderer';
import { summarizeSelections } from '../models/DiffSelection';
import { ConfirmDialog } from './ConfirmDialog';
import { buildRepoFileEntries } from '../utils/diffEntries';
import { DiffViewerContent } from './DiffViewerContent';
import {
  buildFileContextMenuItems,
  buildLineContextMenuItems,
  DiffViewerContextMenu,
  findContextMenuAction,
  toNativeContextMenuItems,
  type ContextMenuItemModel,
  type ContextMenuState,
} from './DiffViewerContextMenu';
import { DiffViewerHeader } from './DiffViewerHeader';
import { DiffViewerSidebar } from './DiffViewerSidebar';
import { getCurrentFilePreviewUrl } from './DiffViewer.shared';
import { useDiffViewerHistory } from './useDiffViewerHistory';

export const DiffViewer = ({
  repositories,
  loading = false,
  title = 'Git Diff',
  titleMeta,
  onRefresh,
  onPushAll,
  pushingAll = false,
  showPushIndicator = false,
  onBack,
  mobile = false,
  fileContextActions,
  selections,
  onSelectionChange,
  commitPanel,
  onDiscard,
  showNativeContextMenu,
  historyGroups,
  historyLoading = false,
  loadHistoryGroupDiff,
  onOpenRepoInGitHubWeb,
}: DiffViewerProps) => {
  const hasHistoryTab = historyGroups !== undefined;
  const combinedHistory = historyGroups ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'files' | 'history'>(
    'files',
  );
  const [selectedHistoryGroupId, setSelectedHistoryGroupId] = useState<
    string | null
  >(null);
  const [collapsedRepos, setCollapsedRepos] = useState<
    Record<string, boolean>
  >({});
  const [sidebarOpen, setSidebarOpen] = useState(!mobile);
  const [sidebarWidth, setSidebarWidth] = useState(288); // 18rem = 288px
  const [resizing, setResizing] = useState(false);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const fileEntryButtonRefs = useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );
  const [pendingDiscard, setPendingDiscard] = useState<DiscardTarget | null>(null);

  const SUPPRESS_KEY = 'multi-react:suppressDiscardConfirm';

  const requestDiscard = useCallback(
    (target: DiscardTarget) => {
      setContextMenu(null);
      if (!onDiscard) return;
      let suppressed = false;
      try {
        suppressed = localStorage.getItem(SUPPRESS_KEY) === 'true';
      } catch {
        // localStorage unavailable
      }
      if (suppressed) {
        onDiscard(target);
      } else {
        setPendingDiscard(target);
      }
    },
    [onDiscard],
  );

  const openContextMenu = useCallback(
    (e: React.MouseEvent, items: ContextMenuItemModel[]) => {
      if (!items.some((item) => item.type === 'action')) return;
      e.preventDefault();

      if (showNativeContextMenu) {
        void (async () => {
          const selectedId = await showNativeContextMenu(
            toNativeContextMenuItems(items),
          );
          if (!selectedId) return;
          findContextMenuAction(items, selectedId)?.();
        })();
        return;
      }

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [showNativeContextMenu],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, target: ContextMenuTarget, fileEntry?: FileEntry) => {
      openContextMenu(
        e,
        buildFileContextMenuItems({
          target,
          fileEntry,
          fileContextActions,
          canDiscard: !!onDiscard,
          requestDiscard,
        }),
      );
    },
    [fileContextActions, onDiscard, openContextMenu, requestDiscard],
  );

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      setSidebarWidth(Math.max(150, Math.min(600, e.clientX)));
    };
    const handleMouseUp = () => setResizing(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  const { entries, byRepo } = useMemo(
    () => buildRepoFileEntries(repositories),
    [repositories],
  );

  useEffect(() => {
    if (
      entries.length > 0 &&
      (!selectedKey || !entries.find((e) => e.key === selectedKey))
    ) {
      setSelectedKey(entries[0].key);
    }
  }, [entries, selectedKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

      if (activeSidebarTab === 'files') {
        if (entries.length === 0) return;
        e.preventDefault();
        (document.activeElement as HTMLElement)?.blur();
        setSelectedKey((prev) => {
          const idx = entries.findIndex((en) => en.key === prev);
          const next =
            e.key === 'ArrowDown'
              ? Math.min(idx + 1, entries.length - 1)
              : Math.max(idx - 1, 0);
          // Ensure the repo containing this entry is not collapsed
          const nextEntry = entries[next];
          setCollapsedRepos((cr) =>
            cr[nextEntry.repoName] ? { ...cr, [nextEntry.repoName]: false } : cr,
          );
          return nextEntry.key;
        });
        return;
      }

    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeSidebarTab, entries]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.key === selectedKey) ?? null,
    [entries, selectedKey],
  );
  const selectedEntryPreviewUrl = useMemo(
    () => getCurrentFilePreviewUrl(selectedEntry),
    [selectedEntry],
  );

  const history = useDiffViewerHistory({
    activeSidebarTab,
    combinedHistory,
    hasHistoryTab,
    loadHistoryGroupDiff,
    selectedHistoryGroupId,
    setSelectedHistoryGroupId,
    sidebarOpen,
  });

  useEffect(() => {
    if (!sidebarOpen || activeSidebarTab !== 'files' || !selectedKey) return;
    fileEntryButtonRefs.current[selectedKey]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeSidebarTab, selectedKey, sidebarOpen, entries]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        hasHistoryTab &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey
      ) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveSidebarTab('files');
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          setActiveSidebarTab('history');
          return;
        }
      }

      if (e.key === 'Escape' && onBack) {
        e.preventDefault();
        onBack();
        return;
      }

      if (
        onOpenRepoInGitHubWeb &&
        e.metaKey &&
        e.shiftKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'g'
      ) {
        e.preventDefault();
        const currentRepoPath = selectedEntry?.repoPath ?? repositories[0]?.path;
        if (currentRepoPath) {
          onOpenRepoInGitHubWeb(currentRepoPath);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasHistoryTab, onBack, onOpenRepoInGitHubWeb, repositories, selectedEntry]);

  const handleLineContextMenu = useCallback(
    (e: React.MouseEvent, lineIndex: number, groupInfo?: GroupInfo, groupOnly?: boolean) => {
      if (!onDiscard || !selectedEntry) return;
      openContextMenu(
        e,
        buildLineContextMenuItems({
          fileEntry: selectedEntry,
          lineIndex,
          groupInfo,
          groupOnly,
          requestDiscard,
        }),
      );
    },
    [onDiscard, openContextMenu, requestDiscard, selectedEntry],
  );

  const handleHistoryGroupContextMenu = useCallback(
    async (e: React.MouseEvent, groupId: string) => {
      if (!showNativeContextMenu) return;
      e.preventDefault();

      const group = combinedHistory.find((item) => item.id === groupId);
      if (!group || group.commits.length === 0) return;

      const itemLabel = group.commits.length === 1 ? 'Copy SHA' : 'Copy SHAs';
      const selectedId = await showNativeContextMenu([
        { id: 'copy-sha', label: itemLabel, type: 'normal' },
      ]);

      if (selectedId !== 'copy-sha') return;

      const copyText =
        group.commits.length === 1
          ? group.commits[0].hash
          : group.commits.map((commit) => commit.hash).join('\n');

      try {
        await navigator.clipboard.writeText(copyText);
      } catch {
        // Clipboard can fail in restricted contexts.
      }
    },
    [combinedHistory, showNativeContextMenu],
  );

  const repoPathByName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const repo of repositories) {
      map[repo.name] = repo.path;
    }
    return map;
  }, [repositories]);

  const repoNames = Object.keys(byRepo);
  const totalFiles = entries.length;
  const shouldShowEmptyState =
    !loading &&
    totalFiles === 0 &&
    repoNames.length <= 1 &&
    !hasHistoryTab;
  const globalSelectionState = useMemo(() => {
    if (!selections || !onSelectionChange || entries.length === 0) return null;
    return summarizeSelections(entries, selections);
  }, [entries, selections, onSelectionChange]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DiffViewerHeader
        title={title}
        titleMeta={titleMeta}
        mobile={mobile}
        sidebarOpen={sidebarOpen}
        loading={loading}
        repoCount={repoNames.length}
        pushingAll={pushingAll}
        showPushIndicator={showPushIndicator}
        onBack={onBack}
        onRefresh={onRefresh}
        onPushAll={onPushAll}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />

      {shouldShowEmptyState ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          No changes
        </div>
      ) : (
        <div className={`flex flex-1 min-h-0 overflow-hidden ${resizing ? 'select-none' : ''}`}>
          <div
            className={`min-h-0 ${sidebarOpen ? '' : 'w-0 overflow-hidden'} ${resizing ? '' : 'transition-all duration-200'}`}
            style={sidebarOpen ? { width: sidebarWidth } : undefined}
          >
            <DiffViewerSidebar
              hasHistoryTab={hasHistoryTab}
              activeSidebarTab={activeSidebarTab}
              setActiveSidebarTab={setActiveSidebarTab}
              globalSelectionState={globalSelectionState}
              totalFiles={totalFiles}
              entries={entries}
              selections={selections}
              onSelectionChange={onSelectionChange}
              repoNames={repoNames}
              byRepo={byRepo}
              collapsedRepos={collapsedRepos}
              setCollapsedRepos={setCollapsedRepos}
              selectedKey={selectedKey}
              setSelectedKey={setSelectedKey}
              mobile={mobile}
              setSidebarOpen={setSidebarOpen}
              handleContextMenu={handleContextMenu}
              repoPathByName={repoPathByName}
              fileEntryButtonRefs={fileEntryButtonRefs}
              historyLoading={historyLoading}
              combinedHistory={combinedHistory}
              selectedHistoryGroupId={selectedHistoryGroupId}
              onHistoryGroupSelect={history.handleHistoryGroupSelect}
              historyGroupButtonRefs={history.historyGroupButtonRefs}
              handleHistoryGroupContextMenu={handleHistoryGroupContextMenu}
            />
          </div>

          {/* Resize handle */}
          {sidebarOpen && (
            <div
              onMouseDown={() => setResizing(true)}
              className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
            />
          )}

          <DiffViewerContent
            activeSidebarTab={activeSidebarTab}
            historyLoading={historyLoading}
            selectedHistoryGroup={history.selectedHistoryGroup}
            selectedHistoryDiffRequested={history.selectedHistoryDiffRequested}
            selectedHistoryDiffLoaded={history.selectedHistoryDiffLoaded}
            historyDiffLoadingGroupId={history.historyDiffLoadingGroupId}
            selectedHistoryEntries={history.selectedHistoryEntries}
            selectedHistoryEntriesByRepo={history.selectedHistoryEntriesByRepo}
            collapsedHistoryRepos={history.collapsedHistoryRepos}
            setCollapsedHistoryRepos={history.setCollapsedHistoryRepos}
            collapsedHistoryFiles={history.collapsedHistoryFiles}
            setCollapsedHistoryFiles={history.setCollapsedHistoryFiles}
            handleContextMenu={handleContextMenu}
            selectedEntry={selectedEntry}
            selections={selections}
            onSelectionChange={onSelectionChange}
            onDiscard={onDiscard}
            handleLineContextMenu={handleLineContextMenu}
            selectedEntryPreviewUrl={selectedEntryPreviewUrl}
            commitPanel={commitPanel}
          />
        </div>
      )}

      <DiffViewerContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
      />

      {/* Discard confirmation dialog */}
      <ConfirmDialog
        open={!!pendingDiscard}
        title="Discard Changes"
        message={
          pendingDiscard?.type === 'file'
            ? `Discard all changes to "${pendingDiscard.fileEntry.displayPath}"? This cannot be undone.`
            : pendingDiscard?.type === 'lines'
              ? `Discard ${pendingDiscard.lineIndices.length === 1 ? 'this line' : `these ${pendingDiscard.lineIndices.length} lines`}? This cannot be undone.`
              : ''
        }
        confirmLabel="Discard"
        onConfirm={() => {
          if (pendingDiscard && onDiscard) onDiscard(pendingDiscard);
          setPendingDiscard(null);
        }}
        onCancel={() => setPendingDiscard(null)}
        suppressStorageKey={SUPPRESS_KEY}
      />
    </div>
  );
};
