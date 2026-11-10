import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '@/types';
import { belowStickyScrollTop, paragraphEndIndexes, transcriptSegmentAt } from './transcript-sync';

const SEGMENTS: TranscriptSegment[] = [
  { start: 1, end: 3, text: 'een' },
  { start: 3, end: 5, text: 'twee' },
  { start: 8, end: 10, text: 'drie' },
];

describe('transcriptSegmentAt', () => {
  it('returns null before the first cue', () => {
    expect(transcriptSegmentAt(SEGMENTS, 0.5)).toBeNull();
  });

  it('finds the cue at its start and inside it', () => {
    expect(transcriptSegmentAt(SEGMENTS, 3)).toBe(1);
    expect(transcriptSegmentAt(SEGMENTS, 4.25)).toBe(1);
  });

  it('holds the last cue across a gap and after the end', () => {
    expect(transcriptSegmentAt(SEGMENTS, 6)).toBe(1);
    expect(transcriptSegmentAt(SEGMENTS, 99)).toBe(2);
  });

  it('returns null for an empty transcript', () => {
    expect(transcriptSegmentAt([], 5)).toBeNull();
  });
});

describe('belowStickyScrollTop', () => {
  it('leaves the gap between the sticky header and the row', () => {
    expect(belowStickyScrollTop({ rowTop: 2000, stickyHeight: 400, gap: 56 })).toBe(1544);
  });

  it('never scrolls above the top', () => {
    expect(belowStickyScrollTop({ rowTop: 420, stickyHeight: 400, gap: 56 })).toBe(0);
  });
});

describe('paragraphEndIndexes', () => {
  const cue = (text: string) => ({ text });
  const long = 'a'.repeat(160);

  it('ends a paragraph at a sentence once it is long enough', () => {
    expect(paragraphEndIndexes([cue(long), cue(`${long}.`), cue('b')])).toEqual(new Set([1]));
  });

  it('does not end a short paragraph at a sentence', () => {
    expect(paragraphEndIndexes([cue('Hallo.'), cue('Wereld.')])).toEqual(new Set());
  });

  it('ends a long paragraph even with no punctuation', () => {
    const cues = Array.from({ length: 4 }, () => cue(long));
    expect(paragraphEndIndexes(cues)).toEqual(new Set([3]));
  });

  it('returns nothing for no cues', () => {
    expect(paragraphEndIndexes([])).toEqual(new Set());
  });
});
