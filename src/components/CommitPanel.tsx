import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { errorMessage } from '../lib/bridge';

const COMMIT_PANEL_MODE_KEY = 'multi-desktop:commit-panel-mode';

type CommitPanelMode = 'single' | 'per-repo';

function loadCommitPanelMode(): CommitPanelMode {
  try {
    const persisted = localStorage.getItem(COMMIT_PANEL_MODE_KEY);
    if (persisted === 'single' || persisted === 'per-repo') {
      return persisted;
    }
  } catch {
    // localStorage may be unavailable.
  }
  return 'single';
}

export interface CommitPanelProps {
  repoNames: string[];
  onCommit: (messages: Record<string, string>) => Promise<void>;
  onGenerateSingleMessage: () => Promise<string>;
  onGenerateRepoMessage: (repoName: string) => Promise<string>;
  onClose?: () => void;
  summary: { files: number; lines: number };
  committing: boolean;
}

const TEXTAREA_CLASS =
  'w-full h-20 px-2 py-1.5 text-sm rounded-md border border-border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary';
const OUTLINED_BUTTON_CLASS =
  'px-3 py-1.5 text-sm font-medium rounded-md border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2';

export default function CommitPanel({
  repoNames,
  onCommit,
  onGenerateSingleMessage,
  onGenerateRepoMessage,
  onClose,
  summary,
  committing,
}: CommitPanelProps) {
  const [mode, setMode] = useState<CommitPanelMode>(() => loadCommitPanelMode());
  const [singleMessage, setSingleMessage] = useState('');
  const [perRepoMessages, setPerRepoMessages] = useState<Record<string, string>>({});
  const [activeRepoTab, setActiveRepoTab] = useState(repoNames[0] ?? '');
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const currentRepoName = useMemo(() => {
    if (activeRepoTab && repoNames.includes(activeRepoTab)) return activeRepoTab;
    return repoNames[0] ?? '';
  }, [activeRepoTab, repoNames]);

  useEffect(() => {
    if (!repoNames.length) {
      setActiveRepoTab('');
      return;
    }
    if (!activeRepoTab || !repoNames.includes(activeRepoTab)) {
      setActiveRepoTab(repoNames[0]);
    }
  }, [repoNames, activeRepoTab]);

  useEffect(() => {
    try {
      localStorage.setItem(COMMIT_PANEL_MODE_KEY, mode);
    } catch {
      // localStorage may be unavailable.
    }
  }, [mode]);

  const handleCommit = async () => {
    setError(null);
    const messages: Record<string, string> = {};
    if (mode === 'single') {
      if (!singleMessage.trim()) return;
      for (const name of repoNames) {
        messages[name] = singleMessage.trim();
      }
    } else {
      for (const name of repoNames) {
        const msg = (perRepoMessages[name] ?? '').trim();
        if (!msg) {
          setError(`Missing commit message for ${name}`);
          return;
        }
        messages[name] = msg;
      }
    }
    try {
      await onCommit(messages);
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  };

  const canCommit =
    !committing &&
    summary.files > 0 &&
    (mode === 'single'
      ? singleMessage.trim().length > 0
      : repoNames.every((n) => (perRepoMessages[n] ?? '').trim().length > 0));

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    try {
      if (mode === 'single') {
        setSingleMessage(await onGenerateSingleMessage());
      } else {
        const repoName = currentRepoName;
        if (!repoName) {
          throw new Error('No repository selected.');
        }
        const generated = await onGenerateRepoMessage(repoName);
        setPerRepoMessages((prev) => ({ ...prev, [repoName]: generated }));
      }
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAllPerRepo = async () => {
    if (mode !== 'per-repo') return;
    setError(null);
    setGenerating(true);
    try {
      const nextMessages: Record<string, string> = {};
      const failures: string[] = [];

      for (const repoName of repoNames) {
        try {
          nextMessages[repoName] = await onGenerateRepoMessage(repoName);
        } catch (e: unknown) {
          failures.push(`${repoName}: ${errorMessage(e)}`);
        }
      }

      setPerRepoMessages((prev) => ({ ...prev, ...nextMessages }));

      if (failures.length > 0) {
        const maxShown = 3;
        const shown = failures.slice(0, maxShown).join(' | ');
        const extra = failures.length > maxShown ? ` (+${failures.length - maxShown} more)` : '';
        setError(`Some descriptions failed: ${shown}${extra}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const commitOnShortcut = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canCommit) {
      void handleCommit();
    }
  };

  const segmentClass = (active: boolean) =>
    `px-2 py-1 rounded transition-colors ${active ? 'bg-background shadow-sm font-medium' : 'hover:bg-background/50'}`;

  return (
    <div className="p-3 bg-muted/30 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5 text-xs">
          <button type="button" className={segmentClass(mode === 'single')} onClick={() => setMode('single')}>
            Single
          </button>
          {repoNames.length > 1 && (
            <button
              type="button"
              className={segmentClass(mode === 'per-repo')}
              onClick={() => setMode('per-repo')}
            >
              Per-repo
            </button>
          )}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="p-1 hover:bg-accent rounded transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {mode === 'per-repo' && repoNames.length > 1 && (
        <div className="flex gap-1 text-xs border-b border-border">
          {repoNames.map((name) => (
            <button
              type="button"
              key={name}
              onClick={() => setActiveRepoTab(name)}
              className={`px-2 py-1 transition-colors ${activeRepoTab === name ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {mode === 'single' ? (
        <textarea
          className={TEXTAREA_CLASS}
          placeholder="Commit message..."
          value={singleMessage}
          onChange={(e) => setSingleMessage(e.target.value)}
          onKeyDown={commitOnShortcut}
        />
      ) : (
        <textarea
          className={TEXTAREA_CLASS}
          placeholder={
            currentRepoName
              ? `Commit message for ${currentRepoName}...`
              : 'Select a repo tab to edit its message.'
          }
          value={currentRepoName ? (perRepoMessages[currentRepoName] ?? '') : ''}
          onChange={(e) => {
            if (!currentRepoName) return;
            const value = e.target.value;
            setPerRepoMessages((prev) => ({ ...prev, [currentRepoName]: value }));
          }}
          onKeyDown={commitOnShortcut}
        />
      )}

      {error && <div className="text-xs text-red-500 bg-red-500/10 rounded px-2 py-1">{error}</div>}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={
              committing || generating || summary.files === 0 || (mode === 'per-repo' && !currentRepoName)
            }
            className={OUTLINED_BUTTON_CLASS}
          >
            {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === 'single'
              ? 'Generate Message'
              : currentRepoName
                ? `Generate for ${currentRepoName}`
                : 'Generate for repo'}
          </button>
          {mode === 'per-repo' && repoNames.length > 1 && (
            <button
              type="button"
              onClick={handleGenerateAllPerRepo}
              disabled={committing || generating || summary.files === 0}
              className={OUTLINED_BUTTON_CLASS}
            >
              {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Generate All
            </button>
          )}
          <button
            type="button"
            onClick={handleCommit}
            disabled={!canCommit || generating}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {committing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Commit
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {summary.files} file{summary.files !== 1 ? 's' : ''}, {summary.lines} line
          {summary.lines !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
