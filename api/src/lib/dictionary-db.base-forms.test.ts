import '../test-guard';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import { invalidateDictionaryCache, lookupBaseForms, lookupWord } from './dictionary-db';

const FIXTURE_DIR = path.resolve('.test-data', 'dict-ru-base-forms-fixture');
const previousDictDir = process.env.DICT_DIR;

function writeDictionary(language: string) {
  const db = new Database(path.join(FIXTURE_DIR, `dictionary-${language}.db`));
  db.exec(`
    CREATE TABLE entries (word TEXT PRIMARY KEY, rank INTEGER, ipa TEXT, etymology TEXT);
    CREATE TABLE inflections (
      inflected_form TEXT NOT NULL, lemma TEXT NOT NULL, type TEXT,
      PRIMARY KEY (inflected_form, lemma)
    );
    CREATE TABLE senses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL, pos TEXT, gloss TEXT NOT NULL, sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE related_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL, related_word TEXT NOT NULL, relation TEXT NOT NULL
    );
  `);
  const entry = db.prepare('INSERT INTO entries (word, ipa) VALUES (?, ?)');
  entry.run('читала', '[t͡ɕɪˈtaɫə]');
  entry.run('читать', '[t͡ɕɪˈtatʲ]');
  const sense = db.prepare('INSERT INTO senses (word, pos, gloss) VALUES (?, ?, ?)');
  sense.run('читала', 'verb', 'past of читать');
  sense.run('читать', 'verb', 'to read');
  entry.run('москве', '[mɐˈskvʲe]');
  entry.run('москва', '[mɐˈskva]');
  sense.run('москве', 'name', 'dative of Москва́');
  sense.run('москва', 'name', 'Moscow');
  entry.run('человек', '[t͡ɕɪlɐˈvʲek]');
  entry.run('человѣкъ', '[t͡ɕɪlɐˈvʲek]');
  sense.run('человек', 'noun', 'person');
  sense.run('человѣкъ', 'noun', 'Pre-1918 spelling of человек');
  const form = db.prepare('INSERT INTO inflections (inflected_form, lemma, type) VALUES (?, ?, ?)');
  form.run('читала', 'читать', 'feminine,past,singular');
  form.run('троллей', 'тролль', 'genitive,plural');
  form.run('москве', 'москва', 'dative,singular');
  form.run('людьми', 'человек', 'instrumental,plural');
  form.run('людьми', 'человѣкъ', 'instrumental,plural');
  db.close();
}

beforeAll(() => {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  writeDictionary('ru');
  writeDictionary('uk');
  process.env.DICT_DIR = FIXTURE_DIR;
  invalidateDictionaryCache('ru');
  invalidateDictionaryCache('uk');
});

afterAll(() => {
  invalidateDictionaryCache('ru');
  invalidateDictionaryCache('uk');
  if (previousDictDir === undefined) delete process.env.DICT_DIR;
  else process.env.DICT_DIR = previousDictDir;
});

describe('stress on a looked-up word', () => {
  test('marks the stressed vowel of the surface form', () => {
    expect(lookupWord('local', 'Читала', 'ru')?.stressIndex).toBe(3);
  });

  test('is left out for another language', () => {
    expect(lookupWord('local', 'читала', 'uk')?.stressIndex).toBeUndefined();
  });
});

describe('base options on a looked-up word', () => {
  test('offers the base form with its meaning', () => {
    expect(lookupWord('local', 'читала', 'ru')?.baseOptions).toEqual([
      { word: 'читать', translation: 'to read' },
    ]);
  });

  test('does not take a grammar label for a meaning of the form', () => {
    expect(lookupWord('local', 'москве', 'ru')?.baseOptions).toEqual([
      { word: 'москва', translation: 'Moscow' },
    ]);
  });

  test('leaves out an old spelling', () => {
    expect(lookupWord('local', 'людьми', 'ru')?.baseOptions?.map((option) => option.word)).toEqual([
      'человек',
    ]);
  });

  test('offers the word itself when it is a base form', () => {
    expect(lookupWord('local', 'читать', 'ru')?.baseOptions).toEqual([
      { word: 'читать', translation: 'to read' },
    ]);
  });

  test('is left out for a pack without word forms', () => {
    expect(lookupWord('local', 'читала', 'uk')?.baseOptions).toBeUndefined();
  });
});

describe('lookupBaseForms', () => {
  test('resolves forms and compounds, and folds the words first', () => {
    expect(lookupBaseForms(['Читала', 'читала', 'интернет-троллей'], 'ru')).toEqual(
      new Map([
        ['читала', ['читать']],
        ['интернет-троллей', ['интернет-тролль']],
      ]),
    );
  });

  test('answers nothing for a pack that does not recognize word forms', () => {
    expect(lookupBaseForms(['читала'], 'uk')).toEqual(new Map());
  });

  test('answers nothing for no words', () => {
    expect(lookupBaseForms([], 'ru')).toEqual(new Map());
  });
});
