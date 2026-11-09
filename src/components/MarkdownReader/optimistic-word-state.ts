import type { WordState } from '@/types';

export interface WordStatePatch {
  map: Map<string, WordState>;
  rollback: (current: Map<string, WordState>) => Map<string, WordState>;
}

export function patchWordState(
  current: Map<string, WordState>,
  word: string,
  state: WordState,
): WordStatePatch {
  return patchWordStates(current, [word], state);
}

/**
 * Patch already-folded word keys and return a guarded rollback. The guard
 * prevents an older failed request from undoing a newer state choice.
 */
export function patchWordStates(
  current: Map<string, WordState>,
  words: string[],
  state: WordState,
): WordStatePatch {
  const previous = new Map(words.map((word) => [word, current.get(word)]));
  const map = new Map(current);
  for (const word of words) map.set(word, state);

  return {
    map,
    rollback(latest) {
      let restored = latest;
      for (const [word, prior] of previous) {
        if (latest.get(word) !== state) continue;
        if (restored === latest) restored = new Map(latest);
        if (prior) restored.set(word, prior);
        else restored.delete(word);
      }
      return restored;
    },
  };
}
