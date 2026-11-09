import { describe, expect, test } from 'bun:test';
import { fr } from '../../../languages/fr/manifest';
import { ru } from '../../../languages/ru/manifest';
import { rankBaseOptions, resolveBaseForms, type FormRow } from './word-forms';

const RUSSIAN: FormRow[] = [
  { form: 'читала', lemma: 'читать', type: 'feminine,past,singular' },
  { form: 'читая', lemma: 'читать', type: 'adverbial,participle,present' },
  { form: 'читающий', lemma: 'читать', type: 'active,participle,present' },
  { form: 'читающего', lemma: 'читающий', type: 'genitive,masculine,neuter' },
  { form: 'книгу', lemma: 'книга', type: 'accusative,singular' },
  { form: 'пошли', lemma: 'пойти', type: 'masculine,past,plural' },
  { form: 'пошли', lemma: 'послать', type: 'imperative,second-person,singular' },
  { form: 'прочитать', lemma: 'читать', type: 'perfective' },
  { form: 'чтение', lemma: 'читать', type: 'noun-from-verb' },
  { form: 'учительница', lemma: 'учитель', type: 'feminine' },
  { form: 'елки', lemma: 'ёлка', type: 'genitive' },
  { form: 'елки', lemma: 'ёлки', type: 'ё-spelling' },
  { form: 'троллей', lemma: 'тролль', type: 'genitive,plural' },
  { form: 'человека', lemma: 'человек', type: 'genitive,singular' },
  { form: 'паука', lemma: 'паук', type: 'genitive,singular' },
  { form: 'интернет-сайта', lemma: 'интернет-сайт', type: 'genitive,singular' },
];

const FRENCH: FormRow[] = [
  { form: 'mangeait', lemma: 'manger', type: 'imperfect,indicative,singular,third-person' },
  { form: 'mangé', lemma: 'manger', type: 'participle,past' },
  { form: 'mangée', lemma: 'mangé', type: 'feminine' },
  { form: 'petite', lemma: 'petit', type: 'feminine' },
  { form: 'chats', lemma: 'chat', type: 'plural' },
  { form: 'vas', lemma: 'aller', type: 'indicative,present,second-person,singular' },
  { form: 'va', lemma: 'vas', type: 'alternative' },
  { form: 'mieux', lemma: 'bien', type: 'comparative' },
];

const read = (table: FormRow[]) => (keys: string[]) =>
  table.filter((row) => keys.includes(row.form));
const russian = (word: string) => resolveBaseForms([word], read(RUSSIAN), ru.wordForms).get(word);
const french = (word: string) => resolveBaseForms([word], read(FRENCH), fr.wordForms).get(word);

describe('resolveBaseForms in Russian', () => {
  test('finds the base word of case forms and conjugations', () => {
    expect(russian('книгу')).toEqual(['книга']);
    expect(russian('читала')).toEqual(['читать']);
    expect(russian('читая')).toEqual(['читать']);
  });

  test('reaches the verb from a declined participle', () => {
    expect(russian('читающего')).toEqual(expect.arrayContaining(['читающий', 'читать']));
  });

  test('keeps every base word of an ambiguous form', () => {
    expect(russian('пошли')).toEqual(['пойти', 'послать']);
  });

  test('does not link separate words', () => {
    expect(russian('прочитать')).toBeUndefined();
    expect(russian('чтение')).toBeUndefined();
    expect(russian('учительница')).toBeUndefined();
  });

  test('adds the spelling without ё', () => {
    expect(russian('елки')).toEqual(expect.arrayContaining(['ёлка', 'елка']));
  });

  test('resolves the last part of a compound the dictionary lacks', () => {
    expect(russian('интернет-троллей')).toEqual(['интернет-тролль']);
  });

  test('resolves every part of a compound that changes both halves', () => {
    expect(russian('человека-паука')).toContain('человек-паук');
  });

  test('prefers a dictionary row over splitting the compound', () => {
    expect(russian('интернет-сайта')).toEqual(['интернет-сайт']);
  });

  test('leaves out a base word and an unknown word', () => {
    expect(
      resolveBaseForms(['читать', 'интернет-мем', 'абвгд'], read(RUSSIAN), ru.wordForms),
    ).toEqual(new Map());
  });

  test('answers nothing for no words', () => {
    expect(resolveBaseForms([], () => [], ru.wordForms)).toEqual(new Map());
  });
});

describe('resolveBaseForms with a merged paradigm table', () => {
  test('treats a form with too many base words as its own word', () => {
    const rows = Array.from({ length: 13 }, (_, i) => ({
      form: 'вами',
      lemma: `местоимение${i}`,
      type: 'instrumental,plural',
    }));
    expect(resolveBaseForms(['вами'], () => rows, ru.wordForms)).toEqual(new Map());
  });
});

describe('resolveBaseForms in French', () => {
  test('finds the base word of conjugations, plurals and feminines', () => {
    expect(french('mangeait')).toEqual(['manger']);
    expect(french('chats')).toEqual(['chat']);
    expect(french('petite')).toEqual(['petit']);
  });

  test('reaches the verb from an agreeing past participle', () => {
    expect(french('mangée')).toEqual(expect.arrayContaining(['mangé', 'manger']));
  });

  test('does not follow alternative spellings or comparatives', () => {
    expect(french('va')).toBeUndefined();
    expect(french('mieux')).toBeUndefined();
  });
});

describe('rankBaseOptions', () => {
  const glosses: Record<string, string[]> = {
    пойти: ['to go', 'to walk', 'to start'],
    послать: ['to send'],
    пошли: ['imperative of послать'],
    человѣкъ: ['Pre-1918 spelling of человек'],
    мой: ['my', 'imperative of мыть'],
    мыть: ['to wash'],
  };
  const rank = (key: string, candidates: string[], preferred?: string) =>
    rankBaseOptions({
      key,
      candidates,
      isOnlyAForm: () => false,
      glossesOf: (word) => glosses[word] ?? [],
      preferred,
    }).map((option) => option.word);

  test('orders base words by how many meanings they have', () => {
    expect(rank('пошли', ['послать', 'пойти'])).toEqual(['пойти', 'послать']);
  });

  test('puts a preferred base word first', () => {
    expect(rank('пошли', ['послать', 'пойти'], 'послать')).toEqual(['послать', 'пойти']);
  });

  test('ignores a preference that is not one of the options', () => {
    expect(rank('пошли', ['послать', 'пойти'], 'идти')).toEqual(['пойти', 'послать']);
  });

  test('offers the word itself when it has its own meaning', () => {
    expect(rank('мой', ['мыть'])).toEqual(['мой', 'мыть']);
  });

  test('drops a base word that is only an old spelling', () => {
    expect(rank('людьми', ['человѣкъ', 'пойти'])).toEqual(['пойти']);
  });
});
