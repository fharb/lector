const VOWEL_LETTERS = 'аеёиоуыэюя';
// U+032F marks a non-syllabic vowel, which has no vowel letter of its own.
const IPA_VOWELS = /[aɐəeɛiɪɨoɵuʉæʊy](?!̯)/g;

function countIpaVowels(ipa: string): number {
  return ipa.match(IPA_VOWELS)?.length ?? 0;
}

/** Index of the stressed vowel in a folded word, or undefined when word and IPA do not line up. */
export function stressedVowelIndex(word: string, ipa: string): number | undefined {
  if (word.includes(' ')) return undefined;
  const vowels = [...word].flatMap((letter, index) =>
    VOWEL_LETTERS.includes(letter) ? [index] : [],
  );
  if (vowels.length === 0) return undefined;

  const transcription = ipa.split(' / ')[0];
  if (countIpaVowels(transcription) !== vowels.length) return undefined;
  const yo = word.indexOf('ё');
  if (yo >= 0) return yo;
  if (vowels.length === 1) return vowels[0];

  const mark = transcription.indexOf('ˈ');
  if (mark < 0) return undefined;
  return vowels[countIpaVowels(transcription.slice(0, mark))];
}
