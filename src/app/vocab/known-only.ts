import {
  bulkUpdateWordStates,
  getVocabMeanings,
  removeKnownWords,
  saveVocab,
  updateVocabState,
} from '@/lib/data-layer';
import { isNumberWord } from '@/components/MarkdownReader/word-families';
import { foldWord, type LanguageConfig } from '@/lib/languages';
import type { VocabEntry, WordState } from '@/types';

const KNOWN_ONLY_ID_PREFIX = 'known-only:';

/** Adds a row for each rated word that has no vocab entry. */
export function withKnownOnlyEntries(
  vocab: VocabEntry[],
  states: Map<string, WordState>,
  pack: LanguageConfig,
): VocabEntry[] {
  const saved = new Set(vocab.map((entry) => foldWord(entry.text, pack)));
  const knownOnly = [...states]
    .filter(([word, state]) => state !== 'new' && !saved.has(word) && !isNumberWord(word))
    .map(
      ([word, state]): VocabEntry => ({
        id: `${KNOWN_ONLY_ID_PREFIX}${word}`,
        text: word,
        type: 'word',
        sentence: '',
        translation: '',
        state,
        stateUpdatedAt: new Date(0),
        reviewCount: 0,
        createdAt: new Date(0),
        pushedToAnki: false,
        knownOnly: true,
      }),
    );
  return [...vocab, ...knownOnly];
}

async function learnKnownOnlyWords(words: string[], state: WordState) {
  const meanings = await getVocabMeanings(words);
  const now = new Date();
  for (const word of words) {
    const id = await saveVocab({
      id: crypto.randomUUID(),
      text: word,
      type: 'word',
      sentence: '',
      translation: meanings.get(word) ?? '',
      state,
      stateUpdatedAt: now,
      reviewCount: 0,
      createdAt: now,
      pushedToAnki: false,
    });
    if (id === null) throw new Error(`Could not save "${word}"`);
  }
}

/** Sets one state on list rows, whichever table each row lives in. */
export async function setListEntriesState(entries: VocabEntry[], state: WordState): Promise<void> {
  for (const entry of entries.filter((row) => !row.knownOnly)) {
    if (!(await updateVocabState(entry.id, state))) {
      throw new Error(`Could not update "${entry.text}"`);
    }
  }

  const words = entries.filter((row) => row.knownOnly).map((row) => row.text);
  if (words.length === 0) return;
  if (state === 'new') {
    await removeKnownWords(words);
  } else if (state === 'known' || state === 'ignored') {
    await bulkUpdateWordStates(words.map((word) => ({ word, state })));
  } else {
    await learnKnownOnlyWords(words, state);
  }
}
