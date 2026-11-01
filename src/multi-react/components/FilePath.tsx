import type React from 'react';
import { cn } from '../utils/cn';

type FilePathProps = {
  path: string;
  className?: string;
  title?: string;
};

/**
 * Renders a file path on a single line. When the path is wider than its
 * container, the leading portion is truncated with an ellipsis while the final
 * path segment (the file name) is always kept fully visible — e.g.
 * `skills/openbase-deploy/SKILL.md` renders as `skills/openba…/SKILL.md`
 * instead of the plain end-truncation `skills/openbase-de…` that would hide the
 * file name.
 *
 * Uses flexbox rather than JS measurement: the leading portion shrinks and
 * ellipsizes while the trailing segment holds its natural width. The parent
 * flex row must allow this element to shrink (it sets `min-w-0` on itself).
 */
export function FilePath({ path, className, title }: FilePathProps): React.JSX.Element {
  const lastSlash = path.lastIndexOf('/');
  // `head` is everything before the final segment; `tail` keeps the leading
  // slash so the two pieces rejoin exactly (".../SKILL.md").
  const head = lastSlash === -1 ? '' : path.slice(0, lastSlash);
  const tail = lastSlash === -1 ? path : path.slice(lastSlash);

  return (
    <span
      className={cn('flex min-w-0 items-center overflow-hidden', className)}
      title={title ?? path}
    >
      {head && <span className="min-w-0 truncate">{head}</span>}
      {/* The final segment is kept whole; `overflow-hidden` on the wrapper
          contains the rare case where the file name alone is wider than the
          available space, so it never pushes the layout. */}
      <span className="shrink-0 whitespace-pre">{tail}</span>
    </span>
  );
}
