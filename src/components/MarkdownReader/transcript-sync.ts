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

export const LINES_BELOW_VIDEO = 2;

/** The scrollTop that leaves `gap` pixels between a sticky header and a row. */
export function belowStickyScrollTop({
  rowTop,
  stickyHeight,
  gap,
}: {
  rowTop: number;
  stickyHeight: number;
  gap: number;
}): number {
  return Math.max(0, rowTop - stickyHeight - gap);
}
