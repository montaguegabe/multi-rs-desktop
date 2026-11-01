import { useCallback, useEffect, useRef, useState } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** localStorage key; when set, enables "Don't show again" checkbox */
  suppressStorageKey?: string;
}

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Discard',
  onConfirm,
  onCancel,
  suppressStorageKey,
}: ConfirmDialogProps) => {
  const [suppress, setSuppress] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Auto-focus Cancel when dialog opens
  useEffect(() => {
    if (open) {
      setSuppress(false);
      cancelRef.current?.focus();
    }
  }, [open]);

  const handleConfirm = useCallback(() => {
    if (suppress && suppressStorageKey) {
      try {
        localStorage.setItem(suppressStorageKey, 'true');
      } catch {
        // localStorage may be unavailable
      }
    }
    onConfirm();
  }, [suppress, suppressStorageKey, onConfirm]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-lg max-w-sm w-full mx-4 p-4">
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>

        {suppressStorageKey && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={suppress}
              onChange={(e) => setSuppress(e.target.checked)}
              className="accent-blue-500"
            />
            Don&apos;t show this warning again
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
