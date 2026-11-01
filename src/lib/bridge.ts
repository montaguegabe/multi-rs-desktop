/**
 * The renderer's view of the Rust host: Tauri commands for everything the
 * Electron app used to do over IPC, plus host → renderer navigation events.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { ask, message, open } from '@tauri-apps/plugin-dialog';
import type { HistoryCommitRef, HistoryRepoDiff, NativeContextMenuItem } from 'multi-react';
import type { NavigateToRepoPayload, ProjectDetail, ProjectSummary } from './types';

export type { NavigateToRepoPayload } from './types';

export const repoService = {
  getProjectsSummary: () => invoke<ProjectSummary[]>('get_projects_summary'),
  getProjectStatuses: (repoPaths: string[]) =>
    invoke<ProjectSummary[]>('get_project_statuses', { repoPaths }),
  getProjectDetail: (repoPath: string) => invoke<ProjectDetail>('get_project_detail', { repoPath }),
  getHistoryGroupDiff: (commits: HistoryCommitRef[]) =>
    invoke<HistoryRepoDiff[]>('get_history_group_diff', { commits }),
  addRepo: (repoPath: string) => invoke<void>('add_repo', { repoPath }),
  removeRepo: (repoPath: string) => invoke<void>('remove_repo', { repoPath }),
  pickDirectory: async (): Promise<string | null> => {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === 'string' ? selected : null;
  },
  openInGitHubDesktop: (repoPath: string) => invoke<void>('open_in_github_desktop', { repoPath }),
  openInGitHubWeb: (repoPath: string) => invoke<void>('open_in_github_web', { repoPath }),
  revealInFinder: (filePath: string) => invoke<void>('reveal_in_finder', { filePath }),
  openInCursor: (repoPath: string, filePath: string) =>
    invoke<void>('open_in_cursor', { repoPath, filePath }),
  showContextMenu: (items: NativeContextMenuItem[]) =>
    invoke<string | null>('show_context_menu', { items }),
  copyText: (text: string) => writeText(text),
  getConfigPath: () => invoke<string>('get_config_path'),
  getOpenAIApiKey: () => invoke<string>('get_open_ai_api_key'),
  setOpenAIApiKey: (apiKey: string) => invoke<void>('set_open_ai_api_key', { apiKey }),
  stageChanges: (repoPath: string, patch: string) =>
    invoke<void>('stage_changes', { repoPath, patch }),
  stageFiles: (repoPath: string, filePaths: string[]) =>
    invoke<void>('stage_files', { repoPath, filePaths }),
  commit: (repoPath: string, message: string) => invoke<void>('commit', { repoPath, message }),
  push: (repoPath: string) => invoke<void>('push', { repoPath }),
  createPrivateRepoAndPush: (repoPath: string) =>
    invoke<void>('create_private_repo_and_push', { repoPath }),
  generateCommitMessage: (diff: string) => invoke<string>('generate_commit_message', { diff }),
  discardFile: (repoPath: string, filePath: string, isNew: boolean) =>
    invoke<void>('discard_file', { repoPath, filePath, isNew }),
  discardLines: (repoPath: string, patch: string) =>
    invoke<void>('discard_lines', { repoPath, patch }),
};

/** Native yes/no dialog (replaces `window.confirm`). */
export function confirmDialog(text: string, title = 'Multi Desktop'): Promise<boolean> {
  return ask(text, { title, kind: 'warning' });
}

/** Native message dialog (replaces `window.alert`). */
export async function alertDialog(text: string, title = 'Multi Desktop'): Promise<void> {
  await message(text, { title, kind: 'error' });
}

/** Tauri rejects commands with a string; normalize anything else too. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

type Unsubscribe = () => void;

function subscribe<T>(event: string, callback: (payload: T) => void): Unsubscribe {
  let disposed = false;
  const unlisten = listen<T>(event, (e) => {
    if (!disposed) callback(e.payload);
  });
  return () => {
    disposed = true;
    unlisten.then((fn) => fn());
  };
}

export function onNavigateToRepo(callback: (payload: NavigateToRepoPayload) => void): Unsubscribe {
  return subscribe<NavigateToRepoPayload | string>('navigate-to-repo', (payload) => {
    callback(typeof payload === 'string' ? { repoPath: payload } : payload);
  });
}

export function onNavigateToSettings(callback: () => void): Unsubscribe {
  return subscribe<unknown>('navigate-to-settings', () => callback());
}

/** Deep link handled before the renderer was listening (cold start). */
export function takePendingNavigation(): Promise<NavigateToRepoPayload | null> {
  return invoke<NavigateToRepoPayload | null>('take_pending_navigation');
}
