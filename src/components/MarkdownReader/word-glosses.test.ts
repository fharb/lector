import { describe, expect, it } from 'vitest';
import type { WordState } from '@/types';
import { LANGUAGES } from '@/lib/languages';
import {
  lessonGlosses,
  parseGlossMode,
  shortGloss,
  sideGlossItems,
  sideGlossWidth,
  wordsNeedingMeanings,
} from './word-glosses';

describe('shortGloss', () => {
  it('keeps the first meaning', () => {
    expect(shortGloss('to read; to be reading')).toBe('to read');
    expect(shortGloss('affair, matter, concern')).toBe('affair');
  });

  it('drops notes in brackets', () => {
    expect(shortGloss('leaf (flat green organ of a plant)')).toBe('leaf');
    expect(shortGloss('to be willing [with infinitive]')).toBe('to be willing');
  });

  it('cuts a long meaning with an ellipsis', () => {
    const gloss = shortGloss('the state of being extraordinarily well prepared');
    expect(gloss.length).toBeLessThanOrEqual(24);
    expect(gloss.endsWith('…')).toBe(true);
  });

  it('falls back to the whole text when the first meaning is empty', () => {
    expect(shortGloss('(rare)')).toBe('(rare)');
  });
});

describe('lessonGlosses', () => {
  const states = new Map<string, WordState>([
    ['hond', 'level1'],
    ['kat', 'level4'],
    ['loop', 'known'],
    ['weg', 'ignored'],
    ['huis', 'new'],
    ['читала', 'level2'],
  ]);
  const translations = new Map([
    ['hond', 'dog; hound'],
    ['kat', 'cat'],
    ['loop', 'walk'],
    ['weg', 'away'],
    ['huis', 'house'],
    ['читать', 'to read'],
  ]);
  const baseForms = new Map([['читала', ['читать']]]);
  const keys = ['hond', 'kat', 'loop', 'weg', 'huis', 'boom', 'читала'];

  it('glosses learning words only', () => {
    expect(lessonGlosses(keys, states, translations, baseForms)).toEqual(
      new Map([
        ['hond', 'dog'],
        ['kat', 'cat'],
        ['читала', 'to read'],
      ]),
    );
  });

  it("prefers the form's own saved translation", () => {
    const own = new Map([...translations, ['читала', 'was reading']]);
    expect(lessonGlosses(['читала'], states, own, baseForms).get('читала')).toBe('was reading');
  });

  it('skips a learning word with no translation', () => {
    expect(lessonGlosses(['hond'], states, new Map(), new Map())).toEqual(new Map());
  });
});

describe('wordsNeedingMeanings', () => {
  const states = new Map<string, WordState>([
    ['hond', 'level1'],
    ['читала', 'level2'],
    ['loop', 'known'],
  ]);

  it('asks for the base word of a form, and nothing for settled words', () => {
    const baseForms = new Map([['читала', ['читать']]]);
    expect(wordsNeedingMeanings(['hond', 'читала', 'loop'], states, new Map(), baseForms)).toEqual([
      'hond',
      'читать',
    ]);
  });

  it('asks for nothing when every learning word has a translation', () => {
    expect(wordsNeedingMeanings(['hond'], states, new Map([['hond', 'dog']]), new Map())).toEqual(
      [],
    );
  });
});

describe('sideGlossItems', () => {
  const glosses = new Map([
    ['hond', 'dog'],
    ['kat', 'cat'],
  ]);

  it('lists glossed words once, in reading order', () => {
    const words = ['Die', 'Kat', 'sien', 'die', 'hond', 'en', 'die', 'kat'];
    expect(sideGlossItems(words, glosses, LANGUAGES.af)).toEqual([
      { key: 'kat', word: 'Kat', gloss: 'cat' },
      { key: 'hond', word: 'hond', gloss: 'dog' },
    ]);
  });

  it('returns nothing for a paragraph with no glossed word', () => {
    expect(sideGlossItems(['Die', 'son'], glosses, LANGUAGES.af)).toEqual([]);
  });
});

describe('parseGlossMode', () => {
  it('reads a stored mode', () => {
    expect(parseGlossMode('side')).toBe('side');
    expect(parseGlossMode('above')).toBe('above');
  });

  it('reads the old on value as above', () => {
    expect(parseGlossMode('true')).toBe('above');
  });

  it('falls back to off', () => {
    expect(parseGlossMode(null)).toBe('off');
    expect(parseGlossMode('false')).toBe('off');
    expect(parseGlossMode('sideways')).toBe('off');
  });
});

describe('sideGlossWidth', () => {
  it('fits the margin of a wide window, up to the cap', () => {
    expect(sideGlossWidth(1800, 20, 38)).toBe(256);
  });

  it('uses the room that is left beside the text', () => {
    expect(sideGlossWidth(1200, 20, 38)).toBe(212);
  });

  it('returns null when the margin is too narrow', () => {
    expect(sideGlossWidth(900, 20, 38)).toBeNull();
    expect(sideGlossWidth(400, 20, 38)).toBeNull();
  });

  it('needs more room for larger text', () => {
    expect(sideGlossWidth(1100, 20, 38)).not.toBeNull();
    expect(sideGlossWidth(1100, 26, 38)).toBeNull();
  });
});
