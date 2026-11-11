import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '@/lib/languages';
import { baseMeanings } from './base-meanings';

describe('baseMeanings', () => {
  const fr = LANGUAGES.fr;

  it('returns the meaning of the base word of a form', () => {
    expect(
      baseMeanings('envahissent', [{ word: 'envahir', translation: 'to invade' }], fr),
    ).toEqual([{ word: 'envahir', translation: 'to invade' }]);
  });

  it('leaves out the word itself and options with no meaning', () => {
    const options = [
      { word: 'Envahir', translation: 'to invade' },
      { word: 'envahi', translation: '' },
    ];
    expect(baseMeanings('envahir', options, fr)).toEqual([]);
  });

  it('keeps at most three base words', () => {
    const options = ['a', 'b', 'c', 'd'].map((word) => ({ word, translation: word }));
    expect(baseMeanings('x', options, fr)).toHaveLength(3);
  });

  it('returns nothing without options', () => {
    expect(baseMeanings('envahissent', undefined, fr)).toEqual([]);
  });
});
