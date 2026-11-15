'use client';

import clsx from 'clsx';
import TargetText from '@/components/TargetText';
import { wordStateColors, wordStateLabels } from '../constants';
import type { SelectionWord } from '../types';

type Target = 'known' | 'ignored';

const BUTTON = 'rounded-md px-2 py-1 text-xs font-medium';
const IDLE: Record<Target, string> = {
  known: 'bg-muted text-foreground hover:bg-[var(--primary-soft)] hover:text-[var(--primary-text)]',
  ignored: 'bg-muted text-foreground hover:bg-accent',
};
const ACTIVE: Record<Target, string> = {
  known: 'bg-primary text-primary-foreground',
  ignored: 'bg-muted-foreground text-card',
};

/** The words of a selection, each with Known and Ignore, and both for all new words or all words. */
export default function SelectionWords({
  words,
  onSetState,
  onLookupWord,
}: {
  words: SelectionWord[];
  onSetState?: (words: string[], state: Target) => void;
  onLookupWord?: (word: string) => void;
}) {
  const newWords = words.filter((w) => w.state === 'new').map((w) => w.word);
  const bulkRows = [
    {
      label: 'New',
      testId: 'new',
      targets: newWords,
      known: `✓ ${newWords.length} new known`,
      ignore: `✕ Ignore ${newWords.length} new`,
    },
    {
      label: 'All',
      testId: 'all',
      targets: words.map((w) => w.word),
      known: `✓ All ${words.length} known`,
      ignore: `✕ Ignore all ${words.length}`,
    },
  ].filter((row) => row.targets.length > 0);

  return (
    <section className="border-b border-border px-4 py-3" data-testid="selection-words">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Words ({words.length})
      </h3>
      {onSetState && (
        <div className="mb-3 space-y-1.5">
          {bulkRows.map((row) => (
            <div key={row.testId} className="flex flex-wrap items-center gap-1">
              <span className="w-14 text-xs text-muted-foreground">{row.label}</span>
              <button
                onClick={() => onSetState(row.targets, 'known')}
                data-testid={`selection-${row.testId}-known`}
                className={clsx(BUTTON, IDLE.known)}
              >
                {row.known}
              </button>
              <button
                onClick={() => onSetState(row.targets, 'ignored')}
                data-testid={`selection-${row.testId}-ignore`}
                className={clsx(BUTTON, IDLE.ignored)}
              >
                {row.ignore}
              </button>
            </div>
          ))}
        </div>
      )}
      <ul className="space-y-1">
        {words.map(({ word, state }) => (
          <li
            key={word}
            className="flex items-center gap-2"
            data-testid="selection-word"
            data-word={word}
            data-word-state={state}
          >
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${wordStateColors[state].dot}`}
              title={wordStateLabels[state]}
            />
            {onLookupWord ? (
              <button
                onClick={() => onLookupWord(word)}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline"
                title={`Look up ${word}`}
              >
                <TargetText as="span">{word}</TargetText>
              </button>
            ) : (
              <TargetText as="span" className="min-w-0 flex-1 truncate text-sm font-medium">
                {word}
              </TargetText>
            )}
            {onSetState &&
              (['known', 'ignored'] as const).map((target) => (
                <button
                  key={target}
                  onClick={() => onSetState([word], target)}
                  aria-pressed={state === target}
                  aria-label={target === 'known' ? `Mark ${word} as known` : `Ignore ${word}`}
                  data-testid={
                    target === 'known' ? 'selection-word-known' : 'selection-word-ignore'
                  }
                  className={clsx(BUTTON, state === target ? ACTIVE[target] : IDLE[target])}
                >
                  {target === 'known' ? '✓ Known' : '✕ Ignore'}
                </button>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
