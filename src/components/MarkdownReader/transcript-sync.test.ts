import { describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '@/types';
import { stickyCenteredScrollTop, transcriptSegmentAt } from './transcript-sync';

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

describe('stickyCenteredScrollTop', () => {
  it('centers the row in the area below the sticky header', () => {
    expect(
      stickyCenteredScrollTop({
        rowTop: 2000,
        rowHeight: 40,
        containerHeight: 800,
        stickyHeight: 400,
      }),
    ).toBe(1420);
  });

  it('never scrolls above the top', () => {
    expect(
      stickyCenteredScrollTop({
        rowTop: 420,
        rowHeight: 40,
        containerHeight: 800,
        stickyHeight: 400,
      }),
    ).toBe(0);
  });

  it('places the row right below the header when no space is left', () => {
    expect(
      stickyCenteredScrollTop({
        rowTop: 2000,
        rowHeight: 40,
        containerHeight: 300,
        stickyHeight: 400,
      }),
    ).toBe(1600);
  });
});
