import { useEffect, useRef } from 'react';
import type {
  ContextMenuTarget,
  DiffViewerProps,
  DiscardTarget,
  FileEntry,
  NativeContextMenuItem,
} from '../types';
import { cn } from '../utils/cn';
import type { GroupInfo } from './DiffRenderer';

/**
 * Shared context-menu item model, consumed by both the native menu bridge
 * (`showNativeContextMenu`) and the DOM menu renderer below.
 */
export type ContextMenuItemModel =
  | { type: 'separator' }
  | {
      type: 'action';
      id: string;
      label: string;
      danger?: boolean;
      action: () => void;
    };

export function buildFileContextMenuItems({
  target,
  fileEntry,
  fileContextActions,
  canDiscard,
  requestDiscard,
}: {
  target: ContextMenuTarget;
  fileEntry?: FileEntry;
  fileContextActions: DiffViewerProps['fileContextActions'];
  canDiscard: boolean;
  requestDiscard: (target: DiscardTarget) => void;
}): ContextMenuItemModel[] {
  const items: ContextMenuItemModel[] = [];

  fileContextActions?.forEach((action, index) => {
    items.push({
      type: 'action',
      id: `file-action-${index}`,
      label: action.label,
      action: () => action.onClick(target),
    });
  });

  if (canDiscard && fileEntry) {
    if (items.length > 0) {
      items.push({ type: 'separator' });
    }
    items.push({
      type: 'action',
      id: 'discard-file',
      label: 'Discard File Changes',
      danger: true,
      action: () => requestDiscard({ type: 'file', fileEntry }),
    });
  }

  return items;
}

export function buildLineContextMenuItems({
  fileEntry,
  lineIndex,
  groupInfo,
  groupOnly,
  requestDiscard,
}: {
  fileEntry: FileEntry;
  lineIndex: number;
  groupInfo?: GroupInfo;
  groupOnly?: boolean;
  requestDiscard: (target: DiscardTarget) => void;
}): ContextMenuItemModel[] {
  const items: ContextMenuItemModel[] = [];
  const canDiscardSingle = !groupOnly || !groupInfo || groupInfo.lineCount <= 1;

  if (canDiscardSingle) {
    items.push({
      type: 'action',
      id: 'discard-line',
      label: 'Discard Line',
      danger: true,
      action: () =>
        requestDiscard({
          type: 'lines',
          fileEntry,
          lineIndices: [lineIndex],
        }),
    });
  }

  if (groupInfo && groupInfo.lineCount > 1) {
    const indices: number[] = [];
    for (let i = groupInfo.startIndex; i <= groupInfo.endIndex; i += 1) {
      indices.push(i);
    }
    items.push({
      type: 'action',
      id: 'discard-group',
      label: `Discard Group (${groupInfo.lineCount} lines)`,
      danger: true,
      action: () =>
        requestDiscard({
          type: 'lines',
          fileEntry,
          lineIndices: indices,
        }),
    });
  }

  return items;
}

export function toNativeContextMenuItems(
  items: ContextMenuItemModel[],
): NativeContextMenuItem[] {
  return items.map((item) =>
    item.type === 'separator'
      ? { type: 'separator' }
      : { id: item.id, label: item.label, type: 'normal' },
  );
}

export function findContextMenuAction(
  items: ContextMenuItemModel[],
  id: string,
): (() => void) | null {
  for (const item of items) {
    if (item.type === 'action' && item.id === id) return item.action;
  }
  return null;
}

export type ContextMenuState = {
  x: number;
  y: number;
  items: ContextMenuItemModel[];
};

type DiffViewerContextMenuProps = {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
};

export function DiffViewerContextMenu({
  contextMenu,
  onClose,
}: DiffViewerContextMenuProps) {
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu, onClose]);

  if (!contextMenu) return null;

  return (
    <div
      ref={contextMenuRef}
      className="fixed z-50 min-w-[160px] rounded-md border border-border bg-background py-1 shadow-md"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      {contextMenu.items.map((item, index) =>
        item.type === 'separator' ? (
          <div key={`separator-${index}`} className="my-1 border-t border-border" />
        ) : (
          <button
            key={item.id}
            onClick={() => {
              item.action();
              onClose();
            }}
            className={cn(
              'w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors',
              item.danger && 'text-red-500',
            )}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
