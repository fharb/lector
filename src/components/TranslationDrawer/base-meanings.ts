import { foldWord, type LanguageConfig } from '@/lib/languages';

/** The meanings of the base words a form belongs to, at most three, never the word itself. */
export function baseMeanings(
  word: string,
  options: Array<{ word: string; translation: string }> | undefined,
  pack: LanguageConfig,
): Array<{ word: string; translation: string }> {
  const key = foldWord(word, pack);
  return (options ?? [])
    .filter((option) => option.translation && foldWord(option.word, pack) !== key)
    .slice(0, 3);
}
