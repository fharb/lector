import { describe, expect, it } from 'vitest';
import { getLanguageConfig } from '@/lib/languages';
import type { PageWord } from './page-words';
import { pageSideGlosses, stackSideGlosses } from './side-glosses';

const ru = getLanguageConfig('ru');

function word(text: string, y: number): PageWord {
  return { text, sentence: '', rects: [{ x: 0.1, y, width: 0.05, height: 0.01 }] };
}

describe('pageSideGlosses', () => {
  it('lists each glossed word once, at the height of its first occurrence', () => {
    const glosses = new Map([
      ['сердце', 'heart'],
      ['кровь', 'blood'],
    ]);
    expect(
      pageSideGlosses(
        [word('Сердце', 0.1), word('кровь', 0.4), word('сердце', 0.7), word('орган', 0.2)],
        glosses,
        ru,
      ),
    ).toEqual([
      { key: 'сердце', word: 'Сердце', gloss: 'heart', y: 0.1 },
      { key: 'кровь', word: 'кровь', gloss: 'blood', y: 0.4 },
    ]);
  });
});

describe('stackSideGlosses', () => {
  it('keeps rows at their word when they do not touch', () => {
    expect(stackSideGlosses([{ y: 0.1 }, { y: 0.5 }], 1000, 20).map((r) => r.top)).toEqual([
      100, 500,
    ]);
  });

  it('sorts by height and pushes a row down to clear the one above', () => {
    const rows = stackSideGlosses([{ y: 0.505 }, { y: 0.5 }, { y: 0.51 }], 1000, 20);
    expect(rows.map((r) => [r.y, r.top])).toEqual([
      [0.5, 500],
      [0.505, 520],
      [0.51, 540],
    ]);
  });

  it('moves rows up rather than past the bottom of the page', () => {
    const rows = stackSideGlosses([{ y: 0.99 }, { y: 0.995 }], 1000, 20);
    expect(rows.map((r) => r.top)).toEqual([960, 980]);
  });
});
