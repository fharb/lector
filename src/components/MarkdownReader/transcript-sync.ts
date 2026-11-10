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

const PARAGRAPH_MIN_CHARS = 300;
const PARAGRAPH_MAX_CHARS = 600;
const SENTENCE_END = /[.!?…。！？؟»"”)\]]$/u;

/** Indexes of the cues that end a paragraph when cues flow together as running text. */
export function paragraphEndIndexes(segments: Pick<TranscriptSegment, 'text'>[]): Set<number> {
  const ends = new Set<number>();
  let length = 0;
  segments.forEach((segment, index) => {
    length += segment.text.length + 1;
    const sentenceEnds = SENTENCE_END.test(segment.text.trim());
    if ((length >= PARAGRAPH_MIN_CHARS && sentenceEnds) || length >= PARAGRAPH_MAX_CHARS) {
      ends.add(index);
      length = 0;
    }
  });
  return ends;
}
