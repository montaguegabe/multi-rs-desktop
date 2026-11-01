import type { RepoBranch } from '../lib/types';

export type BranchSummary = {
  label: string;
  title: string;
};

export function summarizeBranches(branches?: RepoBranch[]): BranchSummary | null {
  if (!branches || branches.length === 0) {
    return null;
  }

  const uniqueBranches = [...new Set(branches.map((entry) => entry.branch))];
  return {
    label: uniqueBranches.join(', '),
    title: branches.map((entry) => `${entry.name}: ${entry.branch}`).join('\n'),
  };
}
