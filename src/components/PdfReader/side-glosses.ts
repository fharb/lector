import { foldWord, type LanguageConfig } from '@/lib/languages';
import { sideGlossItems } from '@/components/MarkdownReader/word-glosses';
import type { PageWord } from './page-words';

export interface SideGloss {
  key: string;
  word: string;
  gloss: string;
  /** Top of the word's first occurrence, as a fraction of the page height. */
  y: number;
}

/** Each glossed word of the page once, with the height of its first occurrence. */
export function pageSideGlosses(
  words: PageWord[],
  glosses: Map<string, string>,
  pack: LanguageConfig,
): SideGloss[] {
  const firstY = new Map<string, number>();
  for (const word of words) {
    const key = foldWord(word.text, pack);
    if (!firstY.has(key) && word.rects[0]) firstY.set(key, word.rects[0].y);
  }
  return sideGlossItems(
    words.map((word) => word.text),
    glosses,
    pack,
  ).map((item) => ({ ...item, y: firstY.get(item.key) ?? 0 }));
}

/**
 * Pixel tops for rows of `rowHeight` beside a page of `pageHeight`: each row at its word,
 * moved down just enough to clear the row above, and up again where it would leave the page.
 */
export function stackSideGlosses<T extends { y: number }>(
  items: T[],
  pageHeight: number,
  rowHeight: number,
): (T & { top: number })[] {
  const placed = [...items]
    .sort((a, b) => a.y - b.y)
    .map((item) => ({ ...item, top: Math.max(0, item.y * pageHeight) }));
  for (let i = 1; i < placed.length; i++) {
    placed[i].top = Math.max(placed[i].top, placed[i - 1].top + rowHeight);
  }
  let limit = pageHeight - rowHeight;
  for (let i = placed.length - 1; i >= 0; i--) {
    placed[i].top = Math.max(0, Math.min(placed[i].top, limit));
    limit = placed[i].top - rowHeight;
  }
  return placed;
}
