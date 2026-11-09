import { describe, expect, it } from 'vitest';
import { getLanguageConfig } from '@/lib/languages';
import type { WordState } from '@/types';
import { remainingWordKeys, tappableMarkdownText, uniqueWordKeys } from './remaining-words';

const af = getLanguageConfig('af');
const collect = (markdown: string) => uniqueWordKeys(tappableMarkdownText(markdown), af);

describe('tappableMarkdownText', () => {
  it('reads paragraphs, list items, and text in a blockquote', () => {
    expect(collect('een twee\n\n- drie\n\n> vier')).toEqual(['een', 'twee', 'drie', 'vier']);
  });

  it('reads words inside inline formatting and link text', () => {
    expect(collect('**een** *twee* [drie](https://example.com/vier)')).toEqual([
      'een',
      'twee',
      'drie',
    ]);
  });

  it('skips headings and image sources, which the reader does not make tappable', () => {
    expect(collect('# titel\n\n![beeld](foto.png)\n\neen')).toEqual(['een']);
  });

  it('skips a fenced code block outside a list item', () => {
    expect(collect('```\nkode\n```\n\neen')).toEqual(['een']);
  });

  it('returns nothing for empty text', () => {
    expect(collect('')).toEqual([]);
  });
});

describe('uniqueWordKeys', () => {
  it('folds case and removes duplicates', () => {
    expect(uniqueWordKeys(['Huis huis HUIS'], af)).toEqual(['huis']);
  });

  it('ignores punctuation', () => {
    expect(uniqueWordKeys(['!!! ... ???'], af)).toEqual([]);
  });
});

describe('remainingWordKeys', () => {
  const states = (entries: [string, WordState][]) => new Map(entries);

  it('keeps words with no saved state and words in the new state', () => {
    expect(remainingWordKeys(['een', 'twee'], states([['twee', 'new']]), af)).toEqual([
      'een',
      'twee',
    ]);
  });

  it.each(['level1', 'level2', 'level3', 'level4', 'known', 'ignored'] as const)(
    'leaves a %s word out',
    (state) => {
      expect(remainingWordKeys(['een'], states([['een', state]]), af)).toEqual([]);
    },
  );

  it('returns nothing when the lesson has no words', () => {
    expect(remainingWordKeys([], states([]), af)).toEqual([]);
  });
});
