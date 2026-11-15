import { describe, expect, it } from 'vitest';
import { currentEntryIndex } from './PdfNavigation';

const entries = [
  { title: 'Intro', page: 1, level: 0 },
  { title: 'Chapter 1', page: 3, level: 0 },
  { title: 'Section 1.1', page: 3, level: 1 },
  { title: 'Chapter 2', page: 10, level: 0 },
];

describe('currentEntryIndex', () => {
  it('is the last entry that starts on or before the page', () => {
    expect(currentEntryIndex(entries, 1)).toBe(0);
    expect(currentEntryIndex(entries, 3)).toBe(2);
    expect(currentEntryIndex(entries, 9)).toBe(2);
    expect(currentEntryIndex(entries, 40)).toBe(3);
  });

  it('is -1 before the first entry or without entries', () => {
    expect(currentEntryIndex([{ title: 'Late', page: 5 }], 2)).toBe(-1);
    expect(currentEntryIndex([], 1)).toBe(-1);
  });
});
