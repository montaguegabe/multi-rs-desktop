import { ChevronDown, ChevronRight } from 'lucide-react';
import type React from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { summarizeSelections } from '../models/DiffSelection';
import type { DiffSelection, SelectionSummary } from '../models/DiffSelection';
import type { ContextMenuTarget, FileEntry, HistoryGroup } from '../types';
import { cn } from '../utils/cn';
import {
  formatHistoryTimestamp,
  statusColor,
  statusLabel,
} from './DiffViewer.shared';
import { FilePath } from './FilePath';
import { TriStateCheckbox } from './TriStateCheckbox';

type RepoEntriesByName = Record<string, FileEntry[]>;

type DiffViewerSidebarProps = {
  hasHistoryTab: boolean;
  activeSidebarTab: 'files' | 'history';
  setActiveSidebarTab: Dispatch<SetStateAction<'files' | 'history'>>;
  globalSelectionState: SelectionSummary | null;
  totalFiles: number;
  entries: FileEntry[];
  selections?: Record<string, DiffSelection>;
  onSelectionChange?: (fileKey: string, selection: DiffSelection) => void;
  repoNames: string[];
  byRepo: RepoEntriesByName;
  collapsedRepos: Record<string, boolean>;
  setCollapsedRepos: Dispatch<SetStateAction<Record<string, boolean>>>;
  selectedKey: string | null;
  setSelectedKey: Dispatch<SetStateAction<string | null>>;
  mobile: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  handleContextMenu: (
    e: React.MouseEvent,
    target: ContextMenuTarget,
    fileEntry?: FileEntry,
  ) => void;
  repoPathByName: Record<string, string>;
  fileEntryButtonRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
  historyLoading: boolean;
  combinedHistory: HistoryGroup[];
  selectedHistoryGroupId: string | null;
  onHistoryGroupSelect: (groupId: string) => void;
  historyGroupButtonRefs: MutableRefObject<
    Record<string, HTMLButtonElement | null>
  >;
  handleHistoryGroupContextMenu: (
    e: React.MouseEvent,
    groupId: string,
  ) => Promise<void>;
};

export function DiffViewerSidebar({
  hasHistoryTab,
  activeSidebarTab,
  setActiveSidebarTab,
  globalSelectionState,
  totalFiles,
  entries,
  selections,
  onSelectionChange,
  repoNames,
  byRepo,
  collapsedRepos,
  setCollapsedRepos,
  selectedKey,
  setSelectedKey,
  mobile,
  setSidebarOpen,
  handleContextMenu,
  repoPathByName,
  fileEntryButtonRefs,
  historyLoading,
  combinedHistory,
  selectedHistoryGroupId,
  onHistoryGroupSelect,
  historyGroupButtonRefs,
  handleHistoryGroupContextMenu,
}: DiffViewerSidebarProps) {
  const setEntriesSelection = (files: FileEntry[], checked: boolean) => {
    if (!onSelectionChange) return;
    for (const file of files) {
      const sel = selections?.[file.key];
      if (!sel) continue;
      onSelectionChange(
        file.key,
        checked ? sel.withSelectAll() : sel.withSelectNone(),
      );
    }
  };

  return (
    <div className="h-full min-h-0 shrink-0 overflow-y-auto border-r border-border bg-muted/30 overscroll-contain [-webkit-overflow-scrolling:touch]">
      {hasHistoryTab && (
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setActiveSidebarTab('files')}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium transition-colors',
              activeSidebarTab === 'files'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Files
          </button>
          <button
            onClick={() => setActiveSidebarTab('history')}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium transition-colors',
              activeSidebarTab === 'history'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            History
          </button>
        </div>
      )}

      {activeSidebarTab === 'files' ? (
        <>
          {globalSelectionState && (
            <div className="w-full px-3 py-2 flex items-center gap-2 text-xs bg-muted/50 border-b border-border">
              <TriStateCheckbox
                checked={globalSelectionState.checked}
                indeterminate={globalSelectionState.indeterminate}
                onCheckedChange={(checked) =>
                  setEntriesSelection(entries, checked)
                }
              />
              <span className="text-muted-foreground">
                {totalFiles} file{totalFiles !== 1 ? 's' : ''} changed
              </span>
            </div>
          )}
          {repoNames.map((repoName) => {
            const isCollapsed = !!collapsedRepos[repoName];
            const repoFiles = byRepo[repoName];
            const hasFiles = repoFiles.length > 0;
            return (
              <div key={repoName}>
                {repoNames.length > 1 && (
                  <div
                    role={hasFiles ? 'button' : undefined}
                    tabIndex={hasFiles ? 0 : undefined}
                    onClick={
                      hasFiles
                        ? () =>
                            setCollapsedRepos((prev) => ({
                              ...prev,
                              [repoName]: !prev[repoName],
                            }))
                        : undefined
                    }
                    onContextMenu={(e) =>
                      handleContextMenu(
                        e,
                        {
                          repoName,
                          repoPath: repoPathByName[repoName] ?? '',
                          displayPath: '',
                        },
                        undefined,
                      )
                    }
                    className={`w-full px-3 py-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider bg-muted/50 border-b border-border select-none ${hasFiles ? 'text-muted-foreground hover:bg-accent/50' : 'text-muted-foreground/40'} transition-colors`}
                  >
                    {selections &&
                      onSelectionChange &&
                      (() => {
                        if (!hasFiles) {
                          return (
                            <TriStateCheckbox
                              checked={false}
                              disabled
                              className="shrink-0 opacity-30"
                            />
                          );
                        }
                        const repoSummary = summarizeSelections(
                          repoFiles,
                          selections,
                        );
                        return (
                          <TriStateCheckbox
                            checked={repoSummary.checked}
                            indeterminate={repoSummary.indeterminate}
                            onCheckedChange={(checked) =>
                              setEntriesSelection(repoFiles, checked)
                            }
                          />
                        );
                      })()}
                    {hasFiles && isCollapsed ? (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronDown
                        className={`h-3 w-3 shrink-0 ${hasFiles ? '' : 'opacity-30'}`}
                      />
                    )}
                    <span className="truncate">{repoName}</span>
                    <span className="ml-auto text-[10px] font-normal tabular-nums">
                      {hasFiles ? repoFiles.length : 'clean'}
                    </span>
                  </div>
                )}
                {!isCollapsed &&
                  byRepo[repoName].map((entry) => {
                    const sel = selections?.[entry.key];
                    const fileSummary = summarizeSelections([entry], selections);
                    return (
                      <button
                        key={entry.key}
                        ref={(el) => {
                          fileEntryButtonRefs.current[entry.key] = el;
                        }}
                        onClick={() => {
                          setSelectedKey(entry.key);
                          if (mobile) setSidebarOpen(false);
                        }}
                        onContextMenu={(e) => handleContextMenu(e, entry, entry)}
                        className={cn(
                          'w-full text-left pl-3 pr-3 py-1.5 flex items-center gap-2 text-sm transition-colors border-b border-border/50',
                          selectedKey === entry.key
                            ? 'bg-primary/10 border-l-2 border-l-primary pl-[10px] font-medium'
                            : 'hover:bg-accent/50',
                          fileSummary.none && 'opacity-50',
                        )}
                      >
                        {selections && onSelectionChange && sel && (
                          <TriStateCheckbox
                            checked={fileSummary.checked}
                            indeterminate={fileSummary.indeterminate}
                            onCheckedChange={(checked) =>
                              setEntriesSelection([entry], checked)
                            }
                          />
                        )}
                        <span
                          className={`shrink-0 text-xs font-mono font-bold w-4 text-center ${statusColor(entry.status)}`}
                        >
                          {statusLabel(entry.status)}
                        </span>
                        <FilePath path={entry.displayPath} className="text-xs" />
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </>
      ) : (
        <div className="divide-y divide-border">
          {historyLoading ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              Loading history...
            </div>
          ) : combinedHistory.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              No commits found.
            </div>
          ) : (
            combinedHistory.map((group) => {
              const selected = selectedHistoryGroupId === group.id;
              return (
                <button
                  key={group.id}
                  ref={(el) => {
                    historyGroupButtonRefs.current[group.id] = el;
                  }}
                  onClick={() => {
                    onHistoryGroupSelect(group.id);
                    if (mobile) setSidebarOpen(false);
                  }}
                  onContextMenu={(e) =>
                    void handleHistoryGroupContextMenu(e, group.id)
                  }
                  className={cn(
                    'w-full px-3 py-2 text-left transition-colors',
                    selected
                      ? 'bg-primary/10 border-l-2 border-l-primary pl-[10px]'
                      : 'hover:bg-accent/50',
                  )}
                >
                  <div className="text-[11px] text-muted-foreground">
                    {formatHistoryTimestamp(group.newestAuthoredAtMs)}
                  </div>
                  <div className="mt-1 space-y-1">
                    {group.commits.map((commit) => (
                      <div key={`${group.id}-${commit.hash}`} className="min-w-0">
                        <div className="text-xs font-medium truncate">
                          {commit.repoName}: {commit.subject}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {commit.description ||
                            `${commit.shortHash} • ${commit.authorName || commit.authorEmail}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
