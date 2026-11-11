import { foldWord, lookupByVocabKeys, type LanguageConfig } from '@/lib/languages';
import type { WordState } from '@/types';

export type GlossMode = 'off' | 'above' | 'side';
/** `below` is `side` on a screen with no room in the margin. */
export type GlossPlacement = 'above' | 'side' | 'below';

export const GLOSS_MODES: readonly GlossMode[] = ['off', 'above', 'side'];

export const GLOSS_MODE_LABELS: Record<GlossMode, string> = {
  off: 'Off',
  above: 'Above',
  side: 'Beside',
};

export const GLOSS_MODE_MENU_LABELS: Record<GlossMode, string> = {
  off: 'Off',
  above: 'Above each word',
  side: 'Beside the text',
};

// Must match the article's sm:px-8 and the list's ml-6 in SideGlosses.
const TEXT_PADDING_PX = 32;
const SIDE_GAP_PX = 24;
const SCROLLBAR_PX = 16;
const SIDE_MIN_PX = 140;
const SIDE_MAX_PX = 256;

/** Width in px for the translations in the right margin, or null when the margin is too narrow. */
export function sideGlossWidth(
  containerWidth: number,
  fontSizePx: number,
  columnEm: number,
): number | null {
  const column = Math.min(containerWidth, columnEm * fontSizePx);
  const room = (containerWidth - column) / 2 + TEXT_PADDING_PX - SIDE_GAP_PX - SCROLLBAR_PX;
  const width = Math.min(SIDE_MAX_PX, room);
  return width >= SIDE_MIN_PX ? Math.floor(width) : null;
}

/** A stored mode, or 'off'. `'true'` is the value the first on/off toggle stored. */
export function parseGlossMode(saved: string | null): GlossMode {
  if (saved === 'true') return 'above';
  return (GLOSS_MODES as readonly string[]).includes(saved ?? '') ? (saved as GlossMode) : 'off';
}

/** Rows for the translations beside a paragraph: each glossed word once, in reading order. */
export function sideGlossItems(
  words: string[],
  glosses: Map<string, string>,
  pack: LanguageConfig,
): { key: string; word: string; gloss: string }[] {
  const seen = new Set<string>();
  const items: { key: string; word: string; gloss: string }[] = [];
  for (const word of words) {
    const key = foldWord(word, pack);
    if (seen.has(key)) continue;
    const gloss = lookupByVocabKeys(glosses, word, pack);
    if (!gloss) continue;
    seen.add(key);
    items.push({ key, word, gloss });
  }
  return items;
}

const LEARNING_STATES = new Set<WordState>(['level1', 'level2', 'level3', 'level4']);

/** Characters before a gloss is cut with an ellipsis. */
const MAX_GLOSS_CHARS = 24;

/** The first meaning of a saved translation, short enough to print above a word. */
export function shortGloss(translation: string): string {
  const first = translation
    .split(/[;\n]/)[0]
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim();
  const text = first || translation.trim();
  return text.length > MAX_GLOSS_CHARS ? `${text.slice(0, MAX_GLOSS_CHARS - 1).trimEnd()}…` : text;
}

function glossSource(
  key: string,
  translations: Map<string, string>,
  baseForms: Map<string, string[]>,
): string | undefined {
  const own = translations.get(key);
  if (own) return own;
  for (const base of baseForms.get(key) ?? []) {
    const fromBase = translations.get(base);
    if (fromBase) return fromBase;
  }
  return undefined;
}

/** Folded word -> gloss, for the lesson's words in a learning state. */
export function lessonGlosses(
  keys: string[],
  states: Map<string, WordState>,
  translations: Map<string, string>,
  baseForms: Map<string, string[]>,
): Map<string, string> {
  const glosses = new Map<string, string>();
  for (const key of keys) {
    const state = states.get(key);
    if (!state || !LEARNING_STATES.has(state)) continue;
    const source = glossSource(key, translations, baseForms);
    if (source) glosses.set(key, shortGloss(source));
  }
  return glosses;
}

/** Words to ask the dictionary about: learning words with no saved translation. */
export function wordsNeedingMeanings(
  keys: string[],
  states: Map<string, WordState>,
  translations: Map<string, string>,
  baseForms: Map<string, string[]>,
): string[] {
  const words = new Set<string>();
  for (const key of keys) {
    const state = states.get(key);
    if (!state || !LEARNING_STATES.has(state)) continue;
    if (glossSource(key, translations, baseForms)) continue;
    words.add(baseForms.get(key)?.[0] ?? key);
  }
  return [...words];
}
