import { useCallback, useState } from 'react';

/** Parse a persisted collapsed-path list, tolerating bad or missing data. */
export function parseCollapsedPaths(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

export function serializeCollapsedPaths(paths: Set<string>): string {
  return JSON.stringify([...paths]);
}

/**
 * Collapse state for tree rows (e.g. worktrees under a trunk workspace),
 * persisted to localStorage under `storageKey`. Everything defaults to
 * expanded; only collapsed paths are stored.
 */
export function useCollapsedPaths(storageKey: string): {
  isCollapsed: (path: string) => boolean;
  toggleCollapsed: (path: string) => void;
} {
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    typeof window === 'undefined'
      ? new Set()
      : parseCollapsedPaths(window.localStorage.getItem(storageKey)),
  );

  const toggleCollapsed = useCallback(
    (path: string) => {
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        try {
          window.localStorage.setItem(storageKey, serializeCollapsedPaths(next));
        } catch {
          // Persistence is best-effort; collapse still works in-session.
        }
        return next;
      });
    },
    [storageKey],
  );

  const isCollapsed = useCallback(
    (path: string) => collapsed.has(path),
    [collapsed],
  );

  return { isCollapsed, toggleCollapsed };
}
