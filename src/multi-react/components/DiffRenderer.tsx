import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiffFile } from 'diff2html/lib/types.js';
import type React from 'react';
import { LineType } from 'diff2html/lib/types.js';
import type { DiffSelection } from '../models/DiffSelection';
import { DiffSelectionType } from '../models/DiffSelection';
import { DiffHunk } from './DiffHunk';

export interface GroupInfo {
  startIndex: number; // global line index
  endIndex: number; // inclusive
  lineCount: number;
}

export interface LineGroupMeta {
  group: GroupInfo;
  position: 'first' | 'middle' | 'last' | 'only';
  groupSelectionType: DiffSelectionType;
}

export interface DiffRendererProps {
  file: DiffFile;
  selection?: DiffSelection;
  onSelectionChange?: (selection: DiffSelection) => void;
  onLineContextMenu?: (e: React.MouseEvent, lineIndex: number, groupInfo?: GroupInfo, groupOnly?: boolean) => void;
  imageSrc?: string;
}

export const DiffRenderer = ({
  file,
  selection,
  onSelectionChange,
  onLineContextMenu,
  imageSrc,
}: DiffRendererProps) => {
  const dragRef = useRef<{
    startIndex: number;
    selecting: boolean;
    lastSelection: DiffSelection;
  } | null>(null);

  const [localSelection, setLocalSelection] = useState(selection);

  // Sync external selection changes
  useEffect(() => {
    if (!dragRef.current) {
      setLocalSelection(selection);
    }
  }, [selection]);

  const handleMouseDown = useCallback(
    (index: number, selecting: boolean) => {
      if (!localSelection || !onSelectionChange) return;
      const newSelection = localSelection.withLineSelection(index, selecting);
      dragRef.current = {
        startIndex: index,
        selecting,
        lastSelection: newSelection,
      };
      setLocalSelection(newSelection);
    },
    [localSelection, onSelectionChange],
  );

  const handleMouseEnter = useCallback(
    (index: number) => {
      if (!dragRef.current || !selection) return;
      const { startIndex, selecting } = dragRef.current;
      const from = Math.min(startIndex, index);
      const length = Math.max(startIndex, index) - from + 1;
      const newSelection = selection.withRangeSelection(
        from,
        length,
        selecting,
      );
      dragRef.current.lastSelection = newSelection;
      setLocalSelection(newSelection);
    },
    [selection],
  );

  useEffect(() => {
    const handleMouseUp = () => {
      if (dragRef.current) {
        onSelectionChange?.(dragRef.current.lastSelection);
        dragRef.current = null;
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [onSelectionChange]);

  // Compute starting indices for each block
  const blockStartIndices: number[] = [];
  let runningIndex = 0;
  for (const block of file.blocks) {
    blockStartIndices.push(runningIndex);
    runningIndex += block.lines.length;
  }

  // Compute contiguous groups of non-CONTEXT lines
  const groups = useMemo(() => {
    const result: GroupInfo[] = [];
    let globalIndex = 0;

    for (const block of file.blocks) {
      let currentGroupStart: number | null = null;

      for (const line of block.lines) {
        if (line.type !== LineType.CONTEXT) {
          if (currentGroupStart === null) {
            currentGroupStart = globalIndex;
          }
        } else {
          if (currentGroupStart !== null) {
            const start = currentGroupStart;
            const end = globalIndex - 1;
            result.push({
              startIndex: start,
              endIndex: end,
              lineCount: end - start + 1,
            });
            currentGroupStart = null;
          }
        }
        globalIndex++;
      }

      // Close group at end of block
      if (currentGroupStart !== null) {
        const start = currentGroupStart;
        const end = globalIndex - 1;
        result.push({
          startIndex: start,
          endIndex: end,
          lineCount: end - start + 1,
        });
      }
    }

    return result;
  }, [file.blocks]);

  // Compute per-line group metadata from groups + selection
  const lineGroupMetaMap = useMemo(() => {
    const map = new Map<number, LineGroupMeta>();
    if (!localSelection) return map;

    for (const group of groups) {
      // Determine group selection type
      let allSelected = true;
      let anySelected = false;
      for (let i = group.startIndex; i <= group.endIndex; i++) {
        if (localSelection.isSelected(i)) {
          anySelected = true;
        } else {
          allSelected = false;
        }
      }
      const groupSelectionType = allSelected
        ? DiffSelectionType.All
        : anySelected
          ? DiffSelectionType.Partial
          : DiffSelectionType.None;

      // Assign metadata to each line in the group
      for (let i = group.startIndex; i <= group.endIndex; i++) {
        let position: LineGroupMeta['position'];
        if (group.lineCount === 1) {
          position = 'only';
        } else if (i === group.startIndex) {
          position = 'first';
        } else if (i === group.endIndex) {
          position = 'last';
        } else {
          position = 'middle';
        }

        map.set(i, { group, position, groupSelectionType });
      }
    }

    return map;
  }, [groups, localSelection]);

  const [hoveredGroupStartIndex, setHoveredGroupStartIndex] = useState<
    number | null
  >(null);

  const isImageFile = useMemo(() => {
    const candidate = file.newName !== '/dev/null' ? file.newName : file.oldName;
    const normalized = candidate.replace(/^[ab]\//, '').toLowerCase();
    return /\.(avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/.test(
      normalized,
    );
  }, [file.newName, file.oldName]);

  const handleGroupToggle = useCallback(
    (group: GroupInfo) => {
      if (!localSelection || !onSelectionChange) return;
      // Check if all lines in group are selected
      let allSelected = true;
      for (let i = group.startIndex; i <= group.endIndex; i++) {
        if (!localSelection.isSelected(i)) {
          allSelected = false;
          break;
        }
      }
      const newSelection = localSelection.withRangeSelection(
        group.startIndex,
        group.lineCount,
        !allSelected,
      );
      setLocalSelection(newSelection);
      onSelectionChange(newSelection);
    },
    [localSelection, onSelectionChange],
  );

  if (file.isBinary) {
    if (imageSrc && isImageFile && !file.isDeleted) {
      return (
        <div className="px-4 py-4">
          <div className="text-xs text-muted-foreground mb-2">
            Current image preview
          </div>
          <img
            src={imageSrc}
            alt={file.newName.replace(/^[ab]\//, '')}
            className="max-w-full max-h-[70vh] rounded border border-border bg-muted/20 object-contain"
            loading="lazy"
          />
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        Binary file — no line-level diff available
      </div>
    );
  }

  const showGutters = !!onSelectionChange;

  return (
    <table className="w-full border-collapse table-fixed">
      <colgroup>
        {showGutters && (
          <>
            <col className="w-3" />
            <col className="w-5" />
          </>
        )}
        <col className="w-10" />
        <col className="w-10" />
        <col />
      </colgroup>
      <tbody>
        {file.blocks.map((block, i) => (
          <DiffHunk
            key={i}
            block={block}
            startIndex={blockStartIndices[i]}
            selection={localSelection}
            showGutters={showGutters}
            onMouseDown={showGutters ? handleMouseDown : undefined}
            onMouseEnter={showGutters ? handleMouseEnter : undefined}
            lineGroupMetaMap={showGutters ? lineGroupMetaMap : undefined}
            onGroupToggle={showGutters ? handleGroupToggle : undefined}
            hoveredGroupStartIndex={hoveredGroupStartIndex}
            onGroupHover={showGutters ? setHoveredGroupStartIndex : undefined}
            onLineContextMenu={onLineContextMenu}
          />
        ))}
      </tbody>
    </table>
  );
};
