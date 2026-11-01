import type { DiffBlock } from 'diff2html/lib/types.js';
import { LineType } from 'diff2html/lib/types.js';
import type { DiffSelection } from '../models/DiffSelection';
import type { GroupInfo, LineGroupMeta } from './DiffRenderer';
import { DiffLineRow } from './DiffLineRow';

export interface DiffHunkProps {
  block: DiffBlock;
  startIndex: number;
  selection?: DiffSelection;
  showGutters: boolean;
  onMouseDown?: (index: number, selecting: boolean) => void;
  onMouseEnter?: (index: number) => void;
  lineGroupMetaMap?: Map<number, LineGroupMeta>;
  onGroupToggle?: (group: GroupInfo) => void;
  hoveredGroupStartIndex: number | null;
  onGroupHover?: (startIndex: number | null) => void;
  onLineContextMenu?: (e: React.MouseEvent, lineIndex: number, groupInfo?: GroupInfo, groupOnly?: boolean) => void;
}

export const DiffHunk = ({
  block,
  startIndex,
  selection,
  showGutters,
  onMouseDown,
  onMouseEnter,
  lineGroupMetaMap,
  onGroupToggle,
  hoveredGroupStartIndex,
  onGroupHover,
  onLineContextMenu,
}: DiffHunkProps) => {
  return (
    <>
      {/* Hunk header */}
      <tr>
        <td
          colSpan={showGutters ? 5 : 3}
          className="bg-blue-500/10 text-muted-foreground text-xs font-mono px-2 py-0.5 select-none"
        >
          {block.header}
        </td>
      </tr>

      {/* Lines */}
      {block.lines.map((line, i) => {
        const globalIndex = startIndex + i;
        const isSelectable =
          line.type === LineType.INSERT || line.type === LineType.DELETE;
        return (
          <DiffLineRow
            key={globalIndex}
            line={line}
            globalIndex={globalIndex}
            selection={selection}
            onMouseDown={onMouseDown}
            onMouseEnter={onMouseEnter}
            isSelectable={isSelectable}
            showGutters={showGutters}
            groupMeta={lineGroupMetaMap?.get(globalIndex)}
            onGroupToggle={onGroupToggle}
            isGroupHovered={
              lineGroupMetaMap?.get(globalIndex)?.group.startIndex === hoveredGroupStartIndex
            }
            onGroupHover={onGroupHover}
            onLineContextMenu={onLineContextMenu}
          />
        );
      })}
    </>
  );
};
