interface StressedWordProps {
  word: string;
  stressIndex?: number;
}

const ACUTE_ACCENT = '́';

export function StressedWord({ word, stressIndex }: StressedWordProps) {
  if (stressIndex === undefined || stressIndex >= word.length) return <>{word}</>;
  const vowel = word[stressIndex];
  return (
    <>
      {word.slice(0, stressIndex)}
      <span data-testid="stressed-vowel" className="text-amber-600 dark:text-amber-400">
        {vowel}
        {vowel.toLowerCase() === 'ё' ? '' : ACUTE_ACCENT}
      </span>
      {word.slice(stressIndex + 1)}
    </>
  );
}
