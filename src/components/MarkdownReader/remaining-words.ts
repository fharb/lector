import { fromMarkdown } from 'mdast-util-from-markdown';
import {
  foldWord,
  lookupByVocabKeys,
  tokenize,
  vocabKeys,
  type LanguageConfig,
  type WordSegmentation,
} from '@/lib/languages';
import type { WordState } from '@/types';

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

/** The text ReaderArticle renders as tappable words. Keep in step with its `p` and `li` blocks. */
export function tappableMarkdownText(markdown: string): string[] {
  const texts: string[] = [];
  const visit = (node: MarkdownNode, tappable: boolean) => {
    const insideBlock = tappable || node.type === 'paragraph' || node.type === 'listItem';
    if (insideBlock && typeof node.value === 'string') texts.push(node.value);
    node.children?.forEach((child) => visit(child, insideBlock));
  };
  visit(fromMarkdown(markdown), false);
  return texts;
}

export function uniqueWordKeys(
  texts: string[],
  pack: LanguageConfig,
  segmentation?: WordSegmentation | null,
): string[] {
  const keys = new Set<string>();
  for (const text of texts) {
    for (const token of tokenize(text, pack, segmentation)) {
      if (token.isWord) keys.add(foldWord(token.text, pack));
    }
  }
  return [...keys];
}

export function remainingWordKeys(
  keys: string[],
  states: Map<string, WordState>,
  pack: LanguageConfig,
): string[] {
  return keys.filter((key) => {
    const state = lookupByVocabKeys(states, key, pack);
    return state === undefined || state === 'new';
  });
}

/** One word per family: a form is replaced by the base word it would be saved under. */
export function remainingBaseWords(keys: string[], baseForms: Map<string, string[]>): string[] {
  return [...new Set(keys.map((key) => baseForms.get(key)?.[0] ?? key))];
}

/** The stored words that make a lesson's words known: their own entry, or else their base words. */
export function knownStoredWords(
  keys: string[],
  states: Map<string, WordState>,
  baseForms: Map<string, string[]>,
  pack: LanguageConfig,
): string[] {
  const stored = new Set<string>();
  for (const key of keys) {
    const own = vocabKeys(key, pack).filter((candidate) => {
      const state = states.get(candidate);
      return state !== undefined && state !== 'new';
    });
    if (own.length > 0) {
      own.filter((candidate) => states.get(candidate) === 'known').forEach((w) => stored.add(w));
      continue;
    }
    baseForms
      .get(key)
      ?.filter((base) => states.get(base) === 'known')
      .forEach((base) => stored.add(base));
  }
  return [...stored];
}
