import { parse } from 'diff2html';
import type { DiffFile } from 'diff2html/lib/types.js';

/**
 * diff2html silently drops "\ No newline at end of file" markers.
 * It can also rewrite line.content for lines that literally contain that text.
 * This wrapper calls diff2html's parse(), then re-scans the raw diff text
 * to restore exact line content and annotate each DiffLine that was followed by
 * the marker with a `noNewlineAtEnd` flag so patch generators can re-emit it.
 */
export function parseDiff(rawDiff: string): DiffFile[] {
  const files = parse(rawDiff);
  annotateNoNewline(rawDiff, files);
  return files;
}

const NO_NEWLINE_MARKER = '\\ No newline at end of file';

function annotateNoNewline(rawDiff: string, files: DiffFile[]): void {
  const rawLines = rawDiff.split('\n');
  let rawIdx = 0;

  for (const file of files) {
    for (const block of file.blocks) {
      // Advance to the hunk header (@@ ... @@)
      while (rawIdx < rawLines.length && !rawLines[rawIdx].startsWith('@@')) {
        rawIdx++;
      }
      rawIdx++; // skip the @@ line itself

      let parsedIdx = 0;
      while (parsedIdx < block.lines.length && rawIdx < rawLines.length) {
        const rawLine = rawLines[rawIdx];

        if (rawLine === NO_NEWLINE_MARKER) {
          // Mark the preceding parsed line
          if (parsedIdx > 0) {
            (block.lines[parsedIdx - 1] as any).noNewlineAtEnd = true;
          }
          rawIdx++;
          continue;
        }

        // This raw line corresponds to the current parsed line.
        // Keep exact content from raw diff so sequences like
        // "\\ No newline at end of file" inside normal source text are preserved.
        (block.lines[parsedIdx] as any).content = rawLine;
        parsedIdx++;
        rawIdx++;
      }

      // Check for a trailing marker after the last parsed line
      if (rawIdx < rawLines.length && rawLines[rawIdx] === NO_NEWLINE_MARKER) {
        if (block.lines.length > 0) {
          (block.lines[block.lines.length - 1] as any).noNewlineAtEnd = true;
        }
        rawIdx++;
      }
    }
  }
}
