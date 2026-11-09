import { activeSegmentIndex } from '@/components/ListenAlong/utils';
import type { TranscriptSegment } from '@/types';

/** The cue the video is inside, or the last one it passed. Null before the first cue. */
export function transcriptSegmentAt(segments: TranscriptSegment[], seconds: number): number | null {
  const index = activeSegmentIndex(
    segments.map((segment) => ({ startMs: segment.start * 1000 })),
    seconds * 1000,
  );
  return index < 0 ? null : index;
}

/** The scrollTop that centers a row in the part of the scroller below a sticky header. */
export function stickyCenteredScrollTop({
  rowTop,
  rowHeight,
  containerHeight,
  stickyHeight,
}: {
  rowTop: number;
  rowHeight: number;
  containerHeight: number;
  stickyHeight: number;
}): number {
  const visibleHeight = Math.max(containerHeight - stickyHeight, rowHeight);
  return Math.max(0, rowTop - stickyHeight - (visibleHeight - rowHeight) / 2);
}
