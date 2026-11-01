import { ChevronDown, ChevronRight } from 'lucide-react';
import type React from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { DiffSelection } from '../models/DiffSelection';
import type {
  ContextMenuTarget,
  DiscardTarget,
  FileEntry,
  HistoryGroup,
} from '../types';
import { DiffRenderer } from './DiffRenderer';
import type { GroupInfo } from './DiffRenderer';
import { statusColor, statusLabel, type HistoryDiffEntry } from './DiffViewer.shared';
import { FilePath } from './FilePath';

type HistoryRepoGroup = {
  repoName: string;
  repoPath: string;
  entries: HistoryDiffEntry[];
};

type DiffViewerContentProps = {
  activeSidebarTab: 'files' | 'history';
  historyLoading: boolean;
  selectedHistoryGroup: HistoryGroup | null;
  selectedHistoryDiffRequested: boolean;
  selectedHistoryDiffLoaded: boolean;
  historyDiffLoadingGroupId: string | null;
  selectedHistoryEntries: HistoryDiffEntry[];
  selectedHistoryEntriesByRepo: Map<string, HistoryRepoGroup>;
  collapsedHistoryRepos: Record<string, boolean>;
  setCollapsedHistoryRepos: Dispatch<SetStateAction<Record<string, boolean>>>;
  collapsedHistoryFiles: Record<string, boolean>;
  setCollapsedHistoryFiles: Dispatch<SetStateAction<Record<string, boolean>>>;
  handleContextMenu: (
    e: React.MouseEvent,
    target: ContextMenuTarget,
    fileEntry?: FileEntry,
  ) => void;
  selectedEntry: FileEntry | null;
  selections?: Record<string, DiffSelection>;
  onSelectionChange?: (fileKey: string, selection: DiffSelection) => void;
  onDiscard?: (target: DiscardTarget) => void;
  handleLineContextMenu: (
    e: React.MouseEvent,
    lineIndex: number,
    groupInfo?: GroupInfo,
    groupOnly?: boolean,
  ) => void;
  selectedEntryPreviewUrl?: string;
  commitPanel?: ReactNode;
};

export function DiffViewerContent({
  activeSidebarTab,
  historyLoading,
  selectedHistoryGroup,
  selectedHistoryDiffRequested,
  selectedHistoryDiffLoaded,
  historyDiffLoadingGroupId,
  selectedHistoryEntries,
  selectedHistoryEntriesByRepo,
  collapsedHistoryRepos,
  setCollapsedHistoryRepos,
  collapsedHistoryFiles,
  setCollapsedHistoryFiles,
  handleContextMenu,
  selectedEntry,
  selections,
  onSelectionChange,
  onDiscard,
  handleLineContextMenu,
  selectedEntryPreviewUrl,
  commitPanel,
}: DiffViewerContentProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <div className="flex-1 min-h-0 min-w-0 overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        {activeSidebarTab === 'history' ? (
          historyLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading history...
            </div>
          ) : selectedHistoryGroup ? (
            historyDiffLoadingGroupId === selectedHistoryGroup.id ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading grouped diff...
              </div>
            ) : selectedHistoryDiffRequested && !selectedHistoryDiffLoaded ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading grouped diff...
              </div>
            ) : !selectedHistoryDiffRequested ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a commit to load its grouped diff
              </div>
            ) : selectedHistoryEntries.length > 0 ? (
              <div className="divide-y divide-border">
                <div className="px-4 py-2.5 text-xs text-muted-foreground bg-muted/30">
                  {selectedHistoryGroup.commits.length} commit
                  {selectedHistoryGroup.commits.length === 1 ? '' : 's'} across{' '}
                  {selectedHistoryGroup.repoNames.length} repo
                  {selectedHistoryGroup.repoNames.length === 1 ? '' : 's'} •{' '}
                  {selectedHistoryEntries.length} file
                  {selectedHistoryEntries.length === 1 ? '' : 's'} changed
                </div>
                {[...selectedHistoryEntriesByRepo.entries()].map(
                  ([repoPath, repoGroup]) => {
                    const repoCollapseKey = `${selectedHistoryGroup.id}::${repoPath}`;
                    const repoCollapsed =
                      collapsedHistoryRepos[repoCollapseKey] ?? false;

                    return (
                      <div key={repoCollapseKey} className="border-b border-border/50">
                        <button
                          onClick={() =>
                            setCollapsedHistoryRepos((previous) => ({
                              ...previous,
                              [repoCollapseKey]: !repoCollapsed,
                            }))
                          }
                          onContextMenu={(e) =>
                            handleContextMenu(
                              e,
                              {
                                repoName: repoGroup.repoName,
                                repoPath: repoGroup.repoPath,
                                displayPath: '',
                              },
                              undefined,
                            )
                          }
                          className="w-full px-4 py-2 text-xs flex items-center gap-2 bg-muted/20 hover:bg-muted/30 transition-colors"
                        >
                          {repoCollapsed ? (
                            <ChevronRight className="h-3 w-3 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3 w-3 shrink-0" />
                          )}
                          <span className="font-medium truncate">
                            {repoGroup.repoName}
                          </span>
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            {repoGroup.entries.length} file
                            {repoGroup.entries.length === 1 ? '' : 's'}
                          </span>
                        </button>

                        {!repoCollapsed &&
                          repoGroup.entries.map((entry) => {
                            const fileCollapseKey = `${selectedHistoryGroup.id}::${entry.key}`;
                            const fileCollapsed =
                              collapsedHistoryFiles[fileCollapseKey] ?? false;

                            return (
                              <div
                                key={entry.key}
                                className="border-t border-border/50"
                              >
                                <button
                                  onClick={() =>
                                    setCollapsedHistoryFiles((previous) => ({
                                      ...previous,
                                      [fileCollapseKey]: !fileCollapsed,
                                    }))
                                  }
                                  onContextMenu={(e) =>
                                    handleContextMenu(
                                      e,
                                      {
                                        repoName: entry.repoName,
                                        repoPath: entry.repoPath,
                                        displayPath: entry.displayPath,
                                      },
                                      undefined,
                                    )
                                  }
                                  className="w-full px-4 py-2 text-xs flex items-center gap-2 hover:bg-accent/40 transition-colors"
                                >
                                  {fileCollapsed ? (
                                    <ChevronRight className="h-3 w-3 shrink-0" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3 shrink-0" />
                                  )}
                                  <span
                                    className={`shrink-0 text-xs font-mono font-bold w-4 text-center ${statusColor(entry.status)}`}
                                  >
                                    {statusLabel(entry.status)}
                                  </span>
                                  <FilePath path={entry.displayPath} />
                                </button>

                                {!fileCollapsed && <DiffRenderer file={entry.file} />}
                              </div>
                            );
                          })}
                      </div>
                    );
                  },
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No file diff available for this history group
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No history selected
            </div>
          )
        ) : (
          <>
            {selectedEntry ? (
              <DiffRenderer
                file={selectedEntry.file}
                selection={selections?.[selectedEntry.key]}
                onSelectionChange={
                  onSelectionChange
                    ? (sel) => onSelectionChange(selectedEntry.key, sel)
                    : undefined
                }
                onLineContextMenu={onDiscard ? handleLineContextMenu : undefined}
                imageSrc={selectedEntryPreviewUrl}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a file to view its diff
              </div>
            )}
          </>
        )}
      </div>
      {activeSidebarTab === 'files' && commitPanel && (
        <div className="shrink-0 border-t border-border">
          {commitPanel}
        </div>
      )}
    </div>
  );
}
