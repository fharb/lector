/**
 * Asks Claude which base word an ambiguous form usually belongs to, and writes
 * the answers to languages/<code>/content/base-preferences.json.
 *
 * Run from api/ so the dictionary and the login token resolve:
 *   DATA_DIR=.test-data DICT_DIR=../data LLM_WARM_PROCESS=0 \
 *     bun run --env-file=../.env.local src/scripts/rank-base-forms.ts --lang ru --limit 2000
 *
 * A rerun skips forms already answered.
 */
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import { basePreferencesPath } from '../lib/base-preferences';
import { baseOptionsForWords } from '../lib/dictionary-db';
import { AnthropicProvider } from '../lib/llm/anthropic';
import { completeJson } from '../lib/llm/complete-json';
import type { BaseOption } from '../lib/word-forms';

const FORMS_PER_REQUEST = 100;
const OPTION_LOOKUP_BATCH = 5000;
const MEANING_PREVIEW_CHARS = 60;
const WORD_ONLY = /^\p{Ll}+(-\p{Ll}+)*$/u;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const language = argument('lang', 'ru');
const limit = Number(argument('limit', '2000'));
const outputPath = basePreferencesPath(language);

function seededShuffle<T>(items: T[]): T[] {
  let state = 20260719;
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function commonWords(): string[] {
  const file = path.resolve(`../scripts/languages/${language}/coverage-corpus-${language}.txt`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8').toLowerCase().split(/\s+/u);
}

function ambiguousForms(): string[] {
  const dictionary = new Database(
    path.join(process.env.DICT_DIR ?? '../data', `dictionary-${language}.db`),
    { readonly: true },
  );
  const rows = dictionary
    .prepare(
      `SELECT inflected_form AS form FROM inflections
       GROUP BY inflected_form HAVING COUNT(DISTINCT lemma) > 1`,
    )
    .all() as Array<{ form: string }>;
  dictionary.close();
  return rows.map((row) => row.form).filter((form) => WORD_ONLY.test(form));
}

function formsWithChoices(forms: string[]): Map<string, BaseOption[]> {
  const choices = new Map<string, BaseOption[]>();
  for (let i = 0; i < forms.length; i += OPTION_LOOKUP_BATCH) {
    const options = baseOptionsForWords(forms.slice(i, i + OPTION_LOOKUP_BATCH), language);
    for (const [form, list] of options) {
      if (list.length > 1) choices.set(form, list);
    }
  }
  return choices;
}

function buildPrompt(batch: Array<[string, BaseOption[]]>): string {
  const payload = Object.fromEntries(
    batch.map(([form, options]) => [
      form,
      options.map((option) => ({
        base: option.word,
        meaning: option.translation.slice(0, MEANING_PREVIEW_CHARS),
      })),
    ]),
  );
  return `Each ${language} word form below could belong to several dictionary base words.
For each form, pick the base word a reader most likely means when that exact form appears in ordinary modern text.
Choose only from the listed "base" values. A form can be its own base word when it is listed.

${JSON.stringify(payload)}

Respond with ONLY a JSON object that maps each form to the chosen base word. No markdown.`;
}

function save(preferences: Record<string, string>) {
  const sorted = Object.fromEntries(
    Object.entries(preferences).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(sorted, null, 1)}\n`);
}

const preferences: Record<string, string> = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
  : {};

const forms = ambiguousForms();
const common = new Set(commonWords());
const choices = formsWithChoices(forms);
console.log(`${forms.length} ambiguous forms, ${choices.size} with a real choice`);

const ordered = [
  ...[...choices.keys()].filter((form) => common.has(form)),
  ...seededShuffle([...choices.keys()].filter((form) => !common.has(form))),
];
const pending = ordered.filter((form) => !(form in preferences)).slice(0, limit);
console.log(`Asking about ${pending.length} forms`);

const provider = new AnthropicProvider();
let answered = 0;
let invalid = 0;
for (let i = 0; i < pending.length; i += FORMS_PER_REQUEST) {
  const batch = pending
    .slice(i, i + FORMS_PER_REQUEST)
    .map((form): [string, BaseOption[]] => [form, choices.get(form)!]);
  try {
    const answer = await completeJson<Record<string, string>>(provider, {
      messages: [{ role: 'user', content: buildPrompt(batch) }],
      maxTokens: 4000,
      task: 'word-gloss',
    });
    for (const [form, options] of batch) {
      if (options.some((option) => option.word === answer[form])) {
        preferences[form] = answer[form];
        answered++;
      } else {
        invalid++;
      }
    }
    save(preferences);
  } catch (err) {
    console.warn(`Request starting at ${i} failed:`, err);
    invalid += batch.length;
  }
  console.log(`${Math.min(i + FORMS_PER_REQUEST, pending.length)}/${pending.length}`);
}

const changed = pending.filter(
  (form) => preferences[form] && preferences[form] !== choices.get(form)![0].word,
).length;
console.log(`Answered ${answered}, unusable ${invalid}, changed the first guess on ${changed}`);
process.exit(0);
