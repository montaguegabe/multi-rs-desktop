export enum DiffSelectionType {
  All = 'All',
  Partial = 'Partial',
  None = 'None',
}

/**
 * Immutable selection state for diff lines.
 * Tracks a default state (All or None) plus a set of line indices
 * that diverge from the default. Line indices are per-file global:
 * a running counter across all file.blocks[].lines[].
 */
export class DiffSelection {
  static fromInitialSelection(
    initialSelection: DiffSelectionType.All | DiffSelectionType.None,
  ): DiffSelection {
    return new DiffSelection(initialSelection, null);
  }

  private constructor(
    private readonly defaultSelectionType:
      | DiffSelectionType.All
      | DiffSelectionType.None,
    private readonly divergingLines: Set<number> | null,
  ) {}

  getSelectionType(): DiffSelectionType {
    if (!this.divergingLines || this.divergingLines.size === 0) {
      return this.defaultSelectionType;
    }
    return DiffSelectionType.Partial;
  }

  isSelected(lineIndex: number): boolean {
    const isDivergent =
      !!this.divergingLines && this.divergingLines.has(lineIndex);
    return this.defaultSelectionType === DiffSelectionType.All
      ? !isDivergent
      : isDivergent;
  }

  withLineSelection(lineIndex: number, selected: boolean): DiffSelection {
    return this.withRangeSelection(lineIndex, 1, selected);
  }

  withRangeSelection(
    from: number,
    length: number,
    selected: boolean,
  ): DiffSelection {
    const to = from + length;
    const matchesDefault =
      (this.defaultSelectionType === DiffSelectionType.All && selected) ||
      (this.defaultSelectionType === DiffSelectionType.None && !selected);

    const newDiverging = new Set<number>(this.divergingLines ?? []);

    if (matchesDefault) {
      for (let i = from; i < to; i++) {
        newDiverging.delete(i);
      }
    } else {
      for (let i = from; i < to; i++) {
        newDiverging.add(i);
      }
    }

    return new DiffSelection(
      this.defaultSelectionType,
      newDiverging.size === 0 ? null : newDiverging,
    );
  }

  withToggleLineSelection(lineIndex: number): DiffSelection {
    return this.withLineSelection(lineIndex, !this.isSelected(lineIndex));
  }

  withSelectAll(): DiffSelection {
    return new DiffSelection(DiffSelectionType.All, null);
  }

  withSelectNone(): DiffSelection {
    return new DiffSelection(DiffSelectionType.None, null);
  }
}

export interface SelectionSummary {
  /** Every entry is fully selected */
  checked: boolean;
  /** Mixed state: neither all selected nor all deselected */
  indeterminate: boolean;
  /** Every entry is fully deselected */
  none: boolean;
}

/**
 * Aggregate the selection state of a set of file entries into a single
 * tri-state checkbox summary. Entries without a selection count as All.
 */
export function summarizeSelections(
  entries: ReadonlyArray<{ key: string }>,
  selections: Record<string, DiffSelection> | undefined,
): SelectionSummary {
  const types = entries.map(
    (entry) =>
      selections?.[entry.key]?.getSelectionType() ?? DiffSelectionType.All,
  );
  const allAll = types.every((t) => t === DiffSelectionType.All);
  const allNone = types.every((t) => t === DiffSelectionType.None);
  return {
    checked: allAll,
    indeterminate: !allAll && !allNone,
    none: allNone,
  };
}
