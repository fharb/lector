'use client';

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, Languages, Play, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  lookupByVocabKeys,
  tokenize,
  type LanguageConfig,
  type WordSegmentation,
} from '@/lib/languages';
import { currentCueClass, stateClasses } from '@/components/MarkdownReader/theme';
import { isNumberWord } from '@/components/MarkdownReader/word-families';
import { formatTimestamp, type SentencePart } from '@/components/MarkdownReader/transcript-sync';
import type { WordState } from '@/types';

export interface SentencePanelProps {
  sentence: string;
  index: number;
  total: number;
  pack: LanguageConfig;
  segmentation: WordSegmentation | null;
  knownWordsMap: Map<string, WordState>;
  /** A video sentence cut at its subtitle cues. */
  parts?: SentencePart[] | null;
  showTimestamps?: boolean;
  /** The cue the video is at; only that piece is marked. */
  activeCue?: number | null;
  onPlayFrom?: (seconds: number) => void;
  /** `video` plays the sentence from the video, `listen` reads it with TTS. */
  playKind: 'video' | 'listen';
  onPlay: () => void;
  /** A word, or the whole sentence for its translation; the reader's drawer handles both. */
  onLookUp: (text: string, sentence: string) => void;
  onGo: (index: number) => void;
}

/** One sentence with its words, Play or Listen, Translate, and Previous / Next. Arrow keys step too. */
export default function SentencePanel({
  sentence,
  index,
  total,
  pack,
  segmentation,
  knownWordsMap,
  parts = null,
  showTimestamps = false,
  activeCue = null,
  onPlayFrom,
  playKind,
  onPlay,
  onLookUp,
  onGo,
}: SentencePanelProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea')) return;
      if (event.key === 'ArrowLeft' && index > 0) onGo(index - 1);
      if (event.key === 'ArrowRight' && index < total - 1) onGo(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onGo, total]);

  const words = (text: string) =>
    tokenize(text, pack, segmentation).map((token, i) => {
      if (!token.isWord || isNumberWord(token.text)) return <span key={i}>{token.text}</span>;
      const state = lookupByVocabKeys(knownWordsMap, token.text, pack) ?? 'new';
      return (
        <span
          key={i}
          role="button"
          tabIndex={0}
          aria-label={`Look up ${token.text}`}
          data-testid="sentence-word"
          data-reader-word={token.text}
          data-word-state={state}
          onClick={(event) => {
            if (!event.ctrlKey && !event.metaKey) onLookUp(token.text, sentence);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onLookUp(token.text, sentence);
          }}
          className={`cursor-pointer rounded px-0.5 hover:ring-2 hover:ring-ring/50 ${stateClasses[state]}`}
        >
          {token.text}
        </span>
      );
    });

  if (total === 0) {
    return (
      <p className="p-8 text-center text-muted-foreground" data-testid="sentence-view">
        This lesson has no sentences to show.
      </p>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-8"
      data-testid="sentence-view"
    >
      <p
        lang={pack.script.bcp47}
        dir={pack.script.direction}
        className="text-center font-serif text-2xl leading-relaxed text-foreground sm:text-3xl"
        data-testid="sentence-text"
      >
        {parts
          ? parts.map((part, i) => (
              <span key={part.cue}>
                {i > 0 && ' '}
                <span
                  data-testid="sentence-cue"
                  data-active-cue={part.cue === activeCue || undefined}
                  className={part.cue === activeCue ? currentCueClass : undefined}
                >
                  {showTimestamps && (
                    <button
                      type="button"
                      onClick={() => onPlayFrom?.(part.start)}
                      aria-label={`Play from ${formatTimestamp(part.start)}`}
                      data-testid="sentence-cue-timestamp"
                      className="mr-1 inline rounded px-0.5 align-baseline font-mono text-[0.5em] text-muted-foreground/70 tabular-nums hover:bg-accent hover:text-foreground"
                    >
                      {formatTimestamp(part.start)}
                    </button>
                  )}
                  {words(part.text)}
                </span>
              </span>
            ))
          : words(sentence)}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          onClick={onPlay}
          data-testid={playKind === 'video' ? 'sentence-play' : 'sentence-listen'}
        >
          {playKind === 'video' ? <Play className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {playKind === 'video' ? 'Play' : 'Listen'}
        </Button>
        <Button
          variant="outline"
          onClick={() => onLookUp(sentence, sentence)}
          data-testid="sentence-translate"
        >
          <Languages className="h-4 w-4" /> Translate
        </Button>
      </div>

      <div className="flex w-full items-center justify-between gap-2 border-t border-border pt-3">
        <Button
          variant="ghost"
          onClick={() => onGo(index - 1)}
          disabled={index === 0}
          data-testid="sentence-prev"
        >
          <ChevronLeft className="h-5 w-5" /> Previous
        </Button>
        <span className="text-sm text-muted-foreground" data-testid="sentence-position">
          {index + 1} / {total}
        </span>
        <Button
          variant="ghost"
          onClick={() => onGo(index + 1)}
          disabled={index >= total - 1}
          data-testid="sentence-next"
        >
          Next <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
