'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { makeWordSegmentation, type LanguageConfig } from '@/lib/languages';
import { speak, stopSpeaking } from '@/lib/tts';
import { parseSegmentWords } from '@/components/MarkdownReader/utils';
import type { Lesson, WordState } from '@/types';
import { lessonSentences } from './sentences';
import SentencePanel from './SentencePanel';

const positionKey = (lessonId: string) => `lector-sentence-${lessonId}`;

function readPosition(lessonId: string): number {
  try {
    const saved = Number(localStorage.getItem(positionKey(lessonId)));
    return Number.isInteger(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
}

export interface SentenceViewProps {
  lesson: Lesson;
  pack: LanguageConfig;
  knownWordsMap: Map<string, WordState>;
  onLookUp: (text: string, sentence: string) => void;
  onBack: () => void;
  headerAction?: ReactNode;
  /** The last header control, where the whole-text reader has it too. */
  trailingAction?: ReactNode;
}

/** A text lesson one sentence at a time. YouTube lessons show `SentencePanel` under their player instead. */
export default function SentenceView({
  lesson,
  pack,
  knownWordsMap,
  onLookUp,
  onBack,
  headerAction,
  trailingAction,
}: SentenceViewProps) {
  const sentences = useMemo(
    () => lessonSentences(lesson.textContent, pack),
    [lesson.textContent, pack],
  );
  const segmentation = useMemo(
    () => makeWordSegmentation(parseSegmentWords(lesson.segmentWords)),
    [lesson.segmentWords],
  );
  const [index, setIndex] = useState(() => readPosition(lesson.id));
  const current = Math.min(index, Math.max(0, sentences.length - 1));

  useEffect(() => {
    try {
      localStorage.setItem(positionKey(lesson.id), String(current));
    } catch {
      /* storage unavailable */
    }
  }, [current, lesson.id]);
  useEffect(() => () => stopSpeaking(), []);

  const go = useCallback((next: number) => {
    stopSpeaking();
    setIndex(next);
  }, []);

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <h1 className="mx-2 min-w-0 flex-1 truncate text-center text-sm font-medium text-foreground sm:text-lg">
          {lesson.title}
        </h1>
        <div className="flex items-center gap-2">
          {headerAction}
          {trailingAction}
        </div>
      </header>
      <div className="flex flex-1 items-center overflow-y-auto">
        <SentencePanel
          sentence={sentences[current] ?? ''}
          index={current}
          total={sentences.length}
          pack={pack}
          segmentation={segmentation}
          knownWordsMap={knownWordsMap}
          playKind="listen"
          onPlay={() => void speak(sentences[current] ?? '')}
          onLookUp={onLookUp}
          onGo={go}
        />
      </div>
    </div>
  );
}
