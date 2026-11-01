import { repoService } from '../lib/bridge';

interface ContextMenuActionDef {
  label: string;
  onClick: (repoPath: string, filePath?: string) => void;
}

/**
 * Shared context menu action definitions for repo items.
 * @param rootRepoPath - The workspace/root repo path (used for "Open in Cursor" workspace arg)
 */
export function getContextMenuActions(rootRepoPath?: string): ContextMenuActionDef[] {
  return [
    {
      label: 'Reveal in Finder',
      onClick: (repoPath, filePath) => {
        void repoService.revealInFinder(filePath ?? repoPath);
      },
    },
    {
      label: 'Open in Cursor',
      onClick: (repoPath, filePath) => {
        void repoService.openInCursor(rootRepoPath ?? repoPath, filePath ?? repoPath);
      },
    },
    {
      label: 'Copy Path',
      onClick: (repoPath, filePath) => {
        void repoService.copyText(filePath ?? repoPath);
      },
    },
    {
      label: 'Open in GitHub Desktop',
      onClick: (repoPath) => {
        void repoService.openInGitHubDesktop(repoPath);
      },
    },
  ];
}
