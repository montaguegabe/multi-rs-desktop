import {
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
} from 'lucide-react';
import type { ReactNode } from 'react';

type DiffViewerHeaderProps = {
  title: string;
  titleMeta?: ReactNode;
  mobile: boolean;
  sidebarOpen: boolean;
  loading: boolean;
  repoCount: number;
  pushingAll: boolean;
  showPushIndicator: boolean;
  onBack?: () => void;
  onRefresh?: () => void;
  onPushAll?: () => void;
  onToggleSidebar: () => void;
};

export function DiffViewerHeader({
  title,
  titleMeta,
  mobile,
  sidebarOpen,
  loading,
  repoCount,
  pushingAll,
  showPushIndicator,
  onBack,
  onRefresh,
  onPushAll,
  onToggleSidebar,
}: DiffViewerHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        {mobile && (
          <button
            onClick={onToggleSidebar}
            className="p-1.5 hover:bg-accent rounded-lg transition-colors"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
        )}
        {onBack && !mobile && (
          <button
            onClick={onBack}
            title="Back (Esc)"
            aria-label="Go back (Esc)"
            className="p-1.5 hover:bg-accent rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {repoCount > 1 && <span>{repoCount} repos</span>}
            {titleMeta}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onPushAll && (
          <button
            onClick={onPushAll}
            disabled={pushingAll}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pushingAll
              ? showPushIndicator
                ? 'Pushing...'
                : 'Syncing...'
              : showPushIndicator
                ? '↑ Push'
                : 'Sync All'}
          </button>
        )}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
}
