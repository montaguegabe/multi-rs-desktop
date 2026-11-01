import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiffViewerProps, HistoryRepoDiff } from '../types';
import { buildHistoryFileEntries } from '../utils/diffEntries';
import type { HistoryDiffEntry } from './DiffViewer.shared';

type UseDiffViewerHistoryArgs = {
  activeSidebarTab: 'files' | 'history';
  combinedHistory: NonNullable<DiffViewerProps['historyGroups']>;
  hasHistoryTab: boolean;
  loadHistoryGroupDiff: DiffViewerProps['loadHistoryGroupDiff'];
  selectedHistoryGroupId: string | null;
  setSelectedHistoryGroupId: (groupId: string | null) => void;
  sidebarOpen: boolean;
};

export function useDiffViewerHistory({
  activeSidebarTab,
  combinedHistory,
  hasHistoryTab,
  loadHistoryGroupDiff,
  selectedHistoryGroupId,
  setSelectedHistoryGroupId,
  sidebarOpen,
}: UseDiffViewerHistoryArgs) {
  const [historyDiffRequestedGroupIds, setHistoryDiffRequestedGroupIds] =
    useState<Record<string, true>>({});
  const [historyDiffByGroupId, setHistoryDiffByGroupId] = useState<
    Record<string, HistoryRepoDiff[]>
  >({});
  const [historyDiffLoadingGroupId, setHistoryDiffLoadingGroupId] = useState<
    string | null
  >(null);
  const [collapsedHistoryRepos, setCollapsedHistoryRepos] = useState<
    Record<string, boolean>
  >({});
  const [collapsedHistoryFiles, setCollapsedHistoryFiles] = useState<
    Record<string, boolean>
  >({});
  const historyGroupButtonRefs = useRef<
    Record<string, HTMLButtonElement | null>
  >({});

  useEffect(() => {
    if (!hasHistoryTab) return;
    if (
      selectedHistoryGroupId &&
      !combinedHistory.some((group) => group.id === selectedHistoryGroupId)
    ) {
      setSelectedHistoryGroupId(null);
    }
  }, [
    combinedHistory,
    hasHistoryTab,
    selectedHistoryGroupId,
    setSelectedHistoryGroupId,
  ]);

  const selectedHistoryGroup = useMemo(
    () =>
      combinedHistory.find((group) => group.id === selectedHistoryGroupId) ??
      null,
    [combinedHistory, selectedHistoryGroupId],
  );
  const selectedHistoryDiffRequested = selectedHistoryGroup
    ? Boolean(historyDiffRequestedGroupIds[selectedHistoryGroup.id])
    : false;
  const selectedHistoryDiffLoaded = selectedHistoryGroup
    ? Object.prototype.hasOwnProperty.call(
        historyDiffByGroupId,
        selectedHistoryGroup.id,
      )
    : false;

  const handleHistoryGroupSelect = useCallback((groupId: string) => {
    setSelectedHistoryGroupId(groupId);
    setHistoryDiffRequestedGroupIds((previous) =>
      previous[groupId] ? previous : { ...previous, [groupId]: true },
    );
  }, [setSelectedHistoryGroupId]);

  useEffect(() => {
    if (
      !sidebarOpen ||
      activeSidebarTab !== 'history' ||
      !selectedHistoryGroupId
    ) {
      return;
    }
    historyGroupButtonRefs.current[selectedHistoryGroupId]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeSidebarTab, selectedHistoryGroupId, sidebarOpen, combinedHistory]);

  useEffect(() => {
    if (
      !loadHistoryGroupDiff ||
      activeSidebarTab !== 'history' ||
      !selectedHistoryGroup ||
      !historyDiffRequestedGroupIds[selectedHistoryGroup.id]
    ) {
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        historyDiffByGroupId,
        selectedHistoryGroup.id,
      )
    ) {
      return;
    }

    let cancelled = false;
    setHistoryDiffLoadingGroupId(selectedHistoryGroup.id);

    void loadHistoryGroupDiff(selectedHistoryGroup)
      .then((diff) => {
        if (cancelled) return;
        setHistoryDiffByGroupId((previous) => ({
          ...previous,
          [selectedHistoryGroup.id]: diff,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setHistoryDiffByGroupId((previous) => ({
          ...previous,
          [selectedHistoryGroup.id]: [],
        }));
      })
      .finally(() => {
        if (cancelled) return;
        setHistoryDiffLoadingGroupId((current) =>
          current === selectedHistoryGroup.id ? null : current,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSidebarTab,
    historyDiffRequestedGroupIds,
    historyDiffByGroupId,
    loadHistoryGroupDiff,
    selectedHistoryGroup,
  ]);

  const selectedHistoryRepoDiffs = selectedHistoryGroup
    ? historyDiffByGroupId[selectedHistoryGroup.id]
    : undefined;

  const selectedHistoryEntries = useMemo<HistoryDiffEntry[]>(() => {
    if (!selectedHistoryGroup || !selectedHistoryRepoDiffs) return [];

    return buildHistoryFileEntries(
      selectedHistoryGroup.id,
      selectedHistoryRepoDiffs,
    );
  }, [selectedHistoryRepoDiffs, selectedHistoryGroup]);

  const selectedHistoryEntriesByRepo = useMemo(() => {
    const grouped = new Map<
      string,
      { repoName: string; repoPath: string; entries: HistoryDiffEntry[] }
    >();
    for (const entry of selectedHistoryEntries) {
      const repoGroup = grouped.get(entry.repoPath);
      if (repoGroup) {
        repoGroup.entries.push(entry);
      } else {
        grouped.set(entry.repoPath, {
          repoName: entry.repoName,
          repoPath: entry.repoPath,
          entries: [entry],
        });
      }
    }
    return grouped;
  }, [selectedHistoryEntries]);

  useEffect(() => {
    if (!selectedHistoryGroup) return;

    setCollapsedHistoryRepos((previous) => {
      const next = { ...previous };
      for (const repoPath of selectedHistoryEntriesByRepo.keys()) {
        const key = `${selectedHistoryGroup.id}::${repoPath}`;
        if (!(key in next)) {
          next[key] = false;
        }
      }
      return next;
    });

    setCollapsedHistoryFiles((previous) => {
      const next = { ...previous };
      for (const entry of selectedHistoryEntries) {
        const key = `${selectedHistoryGroup.id}::${entry.key}`;
        if (!(key in next)) {
          next[key] = false;
        }
      }
      return next;
    });
  }, [selectedHistoryEntries, selectedHistoryEntriesByRepo, selectedHistoryGroup]);

  return {
    collapsedHistoryFiles,
    collapsedHistoryRepos,
    handleHistoryGroupSelect,
    historyDiffLoadingGroupId,
    historyGroupButtonRefs,
    selectedHistoryDiffLoaded,
    selectedHistoryDiffRequested,
    selectedHistoryEntries,
    selectedHistoryEntriesByRepo,
    selectedHistoryGroup,
    setCollapsedHistoryFiles,
    setCollapsedHistoryRepos,
  };
}
