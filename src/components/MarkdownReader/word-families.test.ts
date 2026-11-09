import { describe, expect, it } from 'vitest';
import type { WordState } from '@/types';
import { getLanguageConfig } from '@/lib/languages';
import {
  isNumberWord,
  vocabTarget,
  withIgnoredNumbers,
  withRecognizedForms,
} from './word-families';

const states = (entries: Array<[string, WordState]>) => new Map(entries);
const forms = new Map([
  ['читала', ['читать']],
  ['пошли', ['пойти', 'послать']],
  ['интернет-троллей', ['интернет-тролль']],
]);

describe('withRecognizedForms', () => {
  it('shows a form of a known base word as known', () => {
    const result = withRecognizedForms(states([['читать', 'known']]), forms);
    expect(result.get('читала')).toBe('known');
  });

  it('recognises a compound from its known base word', () => {
    const result = withRecognizedForms(states([['интернет-тролль', 'known']]), forms);
    expect(result.get('интернет-троллей')).toBe('known');
  });

  it('counts an ambiguous form when any base word is known', () => {
    const result = withRecognizedForms(states([['послать', 'known']]), forms);
    expect(result.get('пошли')).toBe('known');
  });

  it('keeps a state set on the form itself', () => {
    const result = withRecognizedForms(
      states([
        ['читать', 'known'],
        ['читала', 'level1'],
      ]),
      forms,
    );
    expect(result.get('читала')).toBe('level1');
  });

  it('replaces the new state on a form', () => {
    const result = withRecognizedForms(
      states([
        ['читать', 'known'],
        ['читала', 'new'],
      ]),
      forms,
    );
    expect(result.get('читала')).toBe('known');
  });

  it('gives a form the learning level of its base word', () => {
    const result = withRecognizedForms(states([['читать', 'level2']]), forms);
    expect(result.get('читала')).toBe('level2');
  });

  it('gives a form the ignored state of its base word', () => {
    const result = withRecognizedForms(states([['читать', 'ignored']]), forms);
    expect(result.get('читала')).toBe('ignored');
  });

  it('takes the strongest state of an ambiguous form', () => {
    const result = withRecognizedForms(
      states([
        ['пойти', 'level1'],
        ['послать', 'level3'],
      ]),
      forms,
    );
    expect(result.get('пошли')).toBe('level3');
  });

  it('does not recognise the base word from a known form', () => {
    const result = withRecognizedForms(states([['читала', 'known']]), forms);
    expect(result.has('читать')).toBe(false);
  });

  it('does not change the stored states', () => {
    const source = states([['читать', 'known']]);
    withRecognizedForms(source, forms);
    expect(source.has('читала')).toBe(false);
  });

  it('returns the same map when there are no forms', () => {
    const source = states([['читать', 'known']]);
    expect(withRecognizedForms(source, new Map())).toBe(source);
  });
});

describe('vocabTarget', () => {
  const ru = getLanguageConfig('ru');
  const options = [
    { word: 'пойти', translation: 'to go' },
    { word: 'послать', translation: 'to send' },
  ];

  it('saves the best base form with its meaning and keeps the tapped form', () => {
    expect(vocabTarget({ word: 'Пошли', pack: ru, translation: 'form label', options })).toEqual({
      text: 'пойти',
      translation: 'to go',
      sentenceWord: 'Пошли',
    });
  });

  it('saves the base form the learner chose', () => {
    const target = vocabTarget({
      word: 'пошли',
      pack: ru,
      translation: null,
      options,
      chosen: 'послать',
    });
    expect(target.text).toBe('послать');
    expect(target.translation).toBe('to send');
  });

  it('saves the exact form when the learner chose it', () => {
    const target = vocabTarget({
      word: 'Пошли',
      pack: ru,
      translation: 'form label',
      options,
      chosen: 'пошли',
    });
    expect(target).toEqual({ text: 'пошли', translation: 'form label' });
  });

  it('falls back to the lesson base word when the dictionary has no entry', () => {
    const target = vocabTarget({
      word: 'интернет-троллей',
      pack: ru,
      translation: 'internet trolls',
      lessonBases: ['интернет-тролль'],
    });
    expect(target).toEqual({
      text: 'интернет-тролль',
      translation: 'internet trolls',
      sentenceWord: 'интернет-троллей',
    });
  });

  it('keeps a word that is its own base form without a sentence form', () => {
    const target = vocabTarget({
      word: 'Читать',
      pack: ru,
      translation: 'to read',
      options: [{ word: 'читать', translation: 'to read' }],
    });
    expect(target).toEqual({ text: 'читать', translation: 'to read' });
  });

  it('keeps the plain key for a phrase and for a pack without word forms', () => {
    expect(vocabTarget({ word: 'пошли домой', pack: ru, translation: 'x', options }).text).toBe(
      'пошли домой',
    );
    expect(vocabTarget({ word: 'Huise', pack: getLanguageConfig('af'), translation: 'x' })).toEqual(
      {
        text: 'huise',
        translation: 'x',
      },
    );
  });
});

describe('isNumberWord', () => {
  it.each(['2018', '5', '70-80', '1er', '1940-е', '3e'])('treats %s as a number', (word) => {
    expect(isNumberWord(word)).toBe(true);
  });

  it.each(['mp3', 'g7', 'дом', '2018 год', ''])('does not treat "%s" as a number', (word) => {
    expect(isNumberWord(word)).toBe(false);
  });
});

describe('withIgnoredNumbers', () => {
  it('ignores numbers, even one saved as known', () => {
    const result = withIgnoredNumbers(states([['2018', 'known']]), ['2018', '70-80', 'дом']);
    expect(result.get('2018')).toBe('ignored');
    expect(result.get('70-80')).toBe('ignored');
    expect(result.has('дом')).toBe(false);
  });

  it('returns the same map when the lesson has no numbers', () => {
    const source = states([['дом', 'known']]);
    expect(withIgnoredNumbers(source, ['дом'])).toBe(source);
  });
});
