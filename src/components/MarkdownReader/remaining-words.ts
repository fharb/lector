import { fromMarkdown } from 'mdast-util-from-markdown';
import {
  foldWord,
  lookupByVocabKeys,
  tokenize,
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
