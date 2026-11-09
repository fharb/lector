import { foldWord, type LanguageConfig } from '@/lib/languages';
import type { WordState } from '@/types';

const SPREAD_ORDER: readonly WordState[] = [
  'known',
  'level4',
  'level3',
  'level2',
  'level1',
  'ignored',
];

/** Gives a form the state of its base word. A state on the form itself takes priority. */
export function withRecognizedForms(
  states: Map<string, WordState>,
  baseForms: Map<string, string[]>,
): Map<string, WordState> {
  if (baseForms.size === 0) return states;
  const displayed = new Map(states);
  for (const [form, bases] of baseForms) {
    const own = states.get(form);
    if (own !== undefined && own !== 'new') continue;
    const inherited = SPREAD_ORDER.find((state) =>
      bases.some((base) => states.get(base) === state),
    );
    if (inherited) displayed.set(form, inherited);
  }
  return displayed;
}

export interface BaseOption {
  word: string;
  translation: string;
}

export interface VocabTarget {
  text: string;
  translation: string | null;
  /** The tapped form, set only when it differs from `text`. */
  sentenceWord?: string;
}

/** What to store for a tapped word: its base form where the pack can find one. */
export function vocabTarget(input: {
  word: string;
  pack: LanguageConfig;
  translation: string | null;
  options?: BaseOption[];
  lessonBases?: string[];
  chosen?: string;
}): VocabTarget {
  const { word, pack, translation, options, lessonBases, chosen } = input;
  const key = foldWord(word, pack);
  if (!pack.wordForms || word.includes(' ')) return { text: key, translation };

  if (chosen === key && !options?.some((candidate) => candidate.word === key)) {
    return { text: key, translation };
  }
  const option = options?.find((candidate) => candidate.word === chosen) ?? options?.[0];
  const text = option?.word ?? lessonBases?.[0] ?? key;
  return {
    text,
    translation: option?.translation || translation,
    ...(text === key ? {} : { sentenceWord: word }),
  };
}

const NUMBER_WORD = /^\p{Nd}\S*$/u;

/** Years, counts and ordinals: 2018, 70-80, 1er, 1940-е. */
export function isNumberWord(word: string): boolean {
  return NUMBER_WORD.test(word);
}

export function withIgnoredNumbers(
  states: Map<string, WordState>,
  keys: string[],
): Map<string, WordState> {
  const numbers = keys.filter(isNumberWord);
  if (numbers.length === 0) return states;
  const displayed = new Map(states);
  for (const number of numbers) displayed.set(number, 'ignored');
  return displayed;
}
