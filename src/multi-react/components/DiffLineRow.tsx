import type { DiffLine } from 'diff2html/lib/types.js';
import { LineType } from 'diff2html/lib/types.js';
import type { DiffSelection } from '../models/DiffSelection';
import { DiffSelectionType } from '../models/DiffSelection';
import type { GroupInfo, LineGroupMeta } from './DiffRenderer';
import { cn } from '../utils/cn';

export interface DiffLineRowProps {
  line: DiffLine;
  globalIndex: number;
  selection?: DiffSelection;
  onMouseDown?: (index: number, selecting: boolean) => void;
  onMouseEnter?: (index: number) => void;
  isSelectable: boolean;
  showGutters: boolean;
  groupMeta?: LineGroupMeta;
  onGroupToggle?: (group: GroupInfo) => void;
  isGroupHovered?: boolean;
  onGroupHover?: (startIndex: number | null) => void;
  onLineContextMenu?: (e: React.MouseEvent, lineIndex: number, groupInfo?: GroupInfo, groupOnly?: boolean) => void;
}

function lineBackground(
  type: LineType,
  isSelectable: boolean,
  selected: boolean,
): string {
  if (type === LineType.INSERT) {
    if (!isSelectable) return 'bg-green-500/15';
    return selected ? 'bg-green-500/15' : 'bg-green-500/5 opacity-50';
  }
  if (type === LineType.DELETE) {
    if (!isSelectable) return 'bg-red-500/15';
    return selected ? 'bg-red-500/15' : 'bg-red-500/5 opacity-50';
  }
  return '';
}

function groupGutterBg(selType: DiffSelectionType): string {
  if (selType === DiffSelectionType.All) return 'bg-blue-500/40';
  if (selType === DiffSelectionType.Partial) return 'bg-blue-500/20';
  return 'bg-muted-foreground/15';
}

export const DiffLineRow = ({
  line,
  globalIndex,
  selection,
  onMouseDown,
  onMouseEnter,
  isSelectable,
  showGutters,
  groupMeta,
  onGroupToggle,
  isGroupHovered,
  onGroupHover,
  onLineContextMenu,
}: DiffLineRowProps) => {
  const hasGutter = isSelectable && !!selection;
  const selected = selection ? selection.isSelected(globalIndex) : true;

  return (
    <tr
      className={cn('group', lineBackground(line.type, isSelectable, selected))}
      onMouseEnter={
        hasGutter && onMouseEnter
          ? () => onMouseEnter(globalIndex)
          : undefined
      }
      onContextMenu={
        isSelectable && onLineContextMenu
          ? (e) => {
              e.preventDefault();
              onLineContextMenu(e, globalIndex, groupMeta?.group);
            }
          : undefined
      }
    >
      {showGutters && (
        <>
          {/* Group gutter (outer) */}
          <td
            className={cn(
              'w-3 p-0 select-none',
              hasGutter && groupMeta && [
                isGroupHovered
                  ? 'bg-blue-500/50'
                  : groupGutterBg(groupMeta.groupSelectionType),
                'cursor-pointer',
              ],
            )}
            onMouseDown={
              hasGutter && groupMeta && onGroupToggle
                ? (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onGroupToggle(groupMeta.group);
                  }
                : undefined
            }
            onMouseEnter={
              hasGutter && groupMeta && onGroupHover
                ? () => onGroupHover(groupMeta.group.startIndex)
                : undefined
            }
            onMouseLeave={
              hasGutter && groupMeta && onGroupHover
                ? () => onGroupHover(null)
                : undefined
            }
            onContextMenu={
              hasGutter && groupMeta && onLineContextMenu
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onLineContextMenu(e, globalIndex, groupMeta.group, true);
                  }
                : undefined
            }
          />

          {/* Line gutter (inner) */}
          <td
            className={cn(
              'w-5 p-0 select-none',
              hasGutter && [
                selected
                  ? 'bg-blue-500/30 hover:bg-blue-500/40'
                  : 'hover:bg-blue-500/10',
                'cursor-pointer',
              ],
            )}
            onMouseDown={
              hasGutter && onMouseDown
                ? (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    onMouseDown(globalIndex, !selected);
                  }
                : undefined
            }
          />
        </>
      )}

      {/* Old line number */}
      <td className="w-10 text-right pr-2 text-muted-foreground text-xs font-mono select-none">
        {line.type === LineType.DELETE || line.type === LineType.CONTEXT
          ? line.oldNumber
          : ''}
      </td>

      {/* New line number */}
      <td className="w-10 text-right pr-2 text-muted-foreground text-xs font-mono select-none">
        {line.type === LineType.INSERT || line.type === LineType.CONTEXT
          ? line.newNumber
          : ''}
      </td>

      {/* Content */}
      <td className="font-mono text-sm whitespace-pre-wrap pl-2 break-all">
        <span className="text-muted-foreground/50 select-none mr-2">
          {line.type === LineType.INSERT
            ? '+'
            : line.type === LineType.DELETE
              ? '-'
              : ' '}
        </span>
        {line.content.replace(/^[+ -]/, '')}
      </td>
    </tr>
  );
};
