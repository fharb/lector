import { describe, expect, it } from 'vitest';
import { stressedVowelIndex } from './stress';

describe('stressedVowelIndex', () => {
  it('finds the stressed vowel from the IPA mark', () => {
    expect(stressedVowelIndex('читала', '[t͡ɕɪˈtaɫə]')).toBe(3);
    expect(stressedVowelIndex('молоко', '[məɫɐˈko]')).toBe(5);
    expect(stressedVowelIndex('девочка', '[ˈdʲevət͡ɕkə]')).toBe(1);
  });

  it('counts past a stress mark placed before a consonant cluster', () => {
    expect(stressedVowelIndex('книгу', '[ˈknʲiɡʊ]')).toBe(2);
  });

  it('takes ё as stressed', () => {
    expect(stressedVowelIndex('ёлка', '[ˈjɵɫkə]')).toBe(0);
  });

  it('marks the only vowel of a word with no stress mark', () => {
    expect(stressedVowelIndex('дом', '[dom]')).toBe(1);
  });

  it('gives no answer when the vowels do not line up', () => {
    expect(stressedVowelIndex('интересную', '[ɪntʲɪˈrʲesnɨj]')).toBeUndefined();
  });

  it('gives no answer when a longer word has no stress mark', () => {
    expect(stressedVowelIndex('молоко', '[məɫɐko]')).toBeUndefined();
  });

  it('gives no answer for a phrase or a word without vowels', () => {
    expect(stressedVowelIndex('бить баклуши', '[bʲɪdʲ‿bɐˈkɫuʂɨ]')).toBeUndefined();
    expect(stressedVowelIndex('вж', '[vʐ]')).toBeUndefined();
  });
});
