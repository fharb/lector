import type { WordFormsConfig } from '../../../languages/types';

export interface FormRow {
  form: string;
  lemma: string;
  type: string | null;
}

type ReadFormRows = (keys: string[]) => FormRow[];

// Caps the combinations of a compound whose parts each have several base words.
const MAX_COMPOUND_CANDIDATES = 32;

// Above this a row set is a merged paradigm table: Russian pronouns each list 27 or more.
const MAX_BASES_PER_FORM = 12;

function collectBases(rows: FormRow[], tags: readonly string[]): Map<string, Set<string>> {
  const wanted = new Set(tags);
  const bases = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!(row.type ?? '').split(',').some((tag) => wanted.has(tag))) continue;
    const forForm = bases.get(row.form) ?? new Set<string>();
    forForm.add(row.lemma);
    bases.set(row.form, forForm);
  }
  for (const [form, forForm] of bases) {
    if (forForm.size > MAX_BASES_PER_FORM) bases.delete(form);
  }
  return bases;
}

function compoundCandidates(key: string, bases: Map<string, Set<string>>): string[] {
  let candidates = [''];
  for (const part of key.split('-')) {
    const options = [part, ...(bases.get(part) ?? [])];
    candidates = candidates
      .flatMap((prefix) => options.map((option) => (prefix ? `${prefix}-${option}` : option)))
      .slice(0, MAX_COMPOUND_CANDIDATES);
  }
  return candidates;
}

function withPlainSpelling(bases: string[], config: WordFormsConfig): string[] {
  const pair = config.plainSpelling;
  if (!pair) return [...new Set(bases)];
  return [...new Set(bases.flatMap((base) => [base, base.replaceAll(pair[0], pair[1])]))];
}

/** Maps each folded key to the base words it can be a form of, leaving out keys with none. */
export function resolveBaseForms(
  keys: readonly string[],
  readRows: ReadFormRows,
  config: WordFormsConfig,
): Map<string, string[]> {
  const parts = keys.flatMap((key) => (key.includes('-') ? key.split('-') : []));
  const bases = collectBases(readRows([...new Set([...keys, ...parts])]), config.inflectionTags);

  const firstStep = [...new Set([...bases.values()].flatMap((set) => [...set]))];
  const secondStep = collectBases(readRows(firstStep), config.secondStepTags);
  for (const set of bases.values()) {
    for (const base of [...set]) {
      for (const next of secondStep.get(base) ?? []) set.add(next);
    }
  }

  const resolved = new Map<string, string[]>();
  for (const key of keys) {
    const direct = bases.get(key);
    const candidates = direct
      ? [...direct]
      : key.includes('-')
        ? compoundCandidates(key, bases)
        : [];
    const found = withPlainSpelling(candidates, config).filter((base) => base !== key);
    if (found.length > 0) resolved.set(key, found);
  }
  return resolved;
}

export interface BaseOption {
  word: string;
  translation: string;
}

const GRAMMAR_LABEL_GLOSS =
  /singular|plural|-person|participle|indicative|nominative|genitive|dative|accusative|instrumental|prepositional/iu;
const SPELLING_VARIANT_GLOSS = /\b(spelling|alternative form) of\b/iu;

function comparableGloss(text: string): string {
  return text.normalize('NFD').replace(/́/gu, '').toLowerCase();
}

/** Orders the base words a form can be saved under, best guess first. */
export function rankBaseOptions(input: {
  key: string;
  candidates: string[];
  isOnlyAForm: (word: string) => boolean;
  glossesOf: (word: string) => string[];
  preferred?: string;
}): BaseOption[] {
  const { key, candidates, isOnlyAForm, glossesOf, preferred } = input;

  // A word can be a base and a form at once: мой is "my" and the imperative of мыть.
  const ownGlosses = glossesOf(key).filter(
    (gloss) =>
      !GRAMMAR_LABEL_GLOSS.test(gloss) &&
      !candidates.some((candidate) => comparableGloss(gloss).includes(comparableGloss(candidate))),
  );
  const ranked = candidates
    .filter((candidate) => !isOnlyAForm(candidate) && candidate !== key)
    .map((word) => ({ word, glosses: glossesOf(word) }))
    .filter((base) => base.glosses.some((gloss) => !SPELLING_VARIANT_GLOSS.test(gloss)))
    .sort((a, b) => b.glosses.length - a.glosses.length)
    .map((base) => ({ word: base.word, translation: base.glosses.join('; ') }));

  const options = [
    ...(ownGlosses.length > 0 || candidates.length === 0
      ? [{ word: key, translation: ownGlosses.join('; ') }]
      : []),
    ...ranked,
  ];
  if (options.length === 0) {
    return candidates.length > 0 ? [{ word: candidates[0], translation: '' }] : [];
  }
  const first = options.find((option) => option.word === preferred);
  return first ? [first, ...options.filter((option) => option !== first)] : options;
}
