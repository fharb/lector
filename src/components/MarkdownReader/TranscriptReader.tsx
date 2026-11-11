'use client';

import { cueSentence, paragraphEndIndexes, paragraphGroups } from './transcript-sync';
import { sideGlossItems, type GlossPlacement } from './word-glosses';
import SideGlosses from './SideGlosses';
import { Fragment, memo } from 'react';
import type { LanguageConfig, WordSegmentation } from '@/lib/languages';
import { foldWord, lookupByVocabKeys } from '@/lib/languages';
import type { TranscriptSegment, WordState } from '@/types';
import type { WordSource } from './types';
import type { ActiveReaderWord } from './ReaderArticle';
import { collectWords, computePhraseHighlightSet, splitWords } from './utils';
import { wordReading, type AnnotationMode } from './annotation';
import { readerWrapClass } from './wrap';
import { proseStyleVars, type ProseStyle } from '@/lib/prose-style';
import WordCell from '@/components/WordCell';

/** mm:ss / h:mm:ss label for a second offset (mirrors the server helper). */
function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

interface TranscriptReaderProps {
  segments: TranscriptSegment[];
  sourceUrl: string;
  pack: LanguageConfig;
  /** Resolved reader typography (#570). */
  prose: ProseStyle;
  /**
   * The lesson's stored segmentation (#289 4.2). A YouTube lesson's
   * `segmentWords` is built from the flattened transcript, which is exactly the
   * text of these cues, so the vocabulary covers them.
   */
  segmentation: WordSegmentation | null;
  knownWordsMap: Map<string, WordState>;
  /** Folded word -> pronunciation for the ruby layer (#289 4.4). */
  readings: Map<string, string> | null;
  annotationMode: AnnotationMode;
  /** Folded word -> translation printed above it. Null when translations are off. */
  glosses: Map<string, string> | null;
  glossPlacement: GlossPlacement;
  showTimestamps: boolean;
  highlightedPhrase: string[];
  activeWord: ActiveReaderWord | null;
  activeSegmentIndex: number | null;
  onWordClick: (word: string, sentence: string, source?: WordSource) => void;
  onActivateWord: (word: ActiveReaderWord) => void;
  onClearPhrase: () => void;
  onSeek: (seconds: number, segmentIndex: number) => void;
}

/**
 * Renders a timestamped transcript. Each cue is one row: a clickable timestamp
 * (seeks the player) plus the cue's words, rendered with the exact same word
 * machinery as the markdown reader (splitWords + foldWord + stateClasses), so
 * known/unknown states, the translation drawer, and vocab actions all work
 * unchanged. `blockId` is the segment index — the same "exact instance clicked"
 * highlight the markdown reader uses per block.
 */
function TranscriptReader({
  segments,
  sourceUrl,
  pack,
  prose,
  segmentation,
  knownWordsMap,
  readings,
  annotationMode,
  glosses,
  glossPlacement,
  showTimestamps,
  highlightedPhrase,
  activeWord,
  activeSegmentIndex,
  onWordClick,
  onActivateWord,
  onClearPhrase,
  onSeek,
}: TranscriptReaderProps) {
  // Whether the reading sits out of flow above the word, or in the line box
  // where ruby layout widens the word to fit it. See `annotationOverhang`.
  const overhangs = pack.pronunciation.annotationOverhang;
  const paragraphEnds = paragraphEndIndexes(segments);
  const glossesAbove = glossPlacement === 'above' ? glosses : null;
  const sideGlosses = glossPlacement === 'above' ? null : glosses;
  const renderSegment = (segment: TranscriptSegment, segmentIndex: number) => {
    const words = collectWords(segment.text, pack, segmentation);
    const phraseSet = computePhraseHighlightSet(words, highlightedPhrase, pack);
    const source: WordSource = {
      sourceUrl,
      startMs: Math.round(segment.start * 1000),
      endMs: Math.round(segment.end * 1000),
    };

    let wordIndex = -1;
    let nextPartOffset = 0;
    return (
      <div
        key={segmentIndex}
        data-testid="transcript-segment"
        data-segment-index={segmentIndex}
        data-active-segment={activeSegmentIndex === segmentIndex || undefined}
        className={`inline rounded box-decoration-clone transition-colors ${
          activeSegmentIndex === segmentIndex
            ? 'bg-[color-mix(in_srgb,var(--clay)_38%,transparent)] shadow-[0_0_0_2px_var(--clay)]'
            : ''
        }`}
      >
        {showTimestamps && (
          <button
            type="button"
            data-testid="transcript-timestamp"
            onClick={() => onSeek(segment.start, segmentIndex)}
            title="Play from here"
            aria-label={`Play from ${formatTimestamp(segment.start)}`}
            className="mr-1 inline rounded px-0.5 align-baseline font-mono text-[0.6em] text-muted-foreground/70 tabular-nums transition-colors hover:bg-accent hover:text-foreground"
          >
            {formatTimestamp(segment.start)}
          </button>
        )}
        {/* <p> so the reader's drag-select phrase lookup (closest('p')) works. */}
        <p
          className="inline"
          style={{
            lineHeight:
              (annotationMode !== 'off' && readings !== null) || glossesAbove !== null
                ? 'var(--reader-line-height-annotated)'
                : 'var(--reader-line-height)',
          }}
        >
          {splitWords(segment.text, pack, segmentation).map((part, partIndex) => {
            const partOffset = nextPartOffset;
            nextPartOffset += part.text.length;
            if (!part.isWord) {
              return (
                <span key={partIndex} data-leaf="">
                  {part.text}
                </span>
              );
            }
            wordIndex += 1;
            const thisIndex = wordIndex;
            const key = foldWord(part.text, pack);
            const state = lookupByVocabKeys(knownWordsMap, part.text, pack);
            const gloss = glossesAbove
              ? lookupByVocabKeys(glossesAbove, part.text, pack)
              : undefined;
            return (
              <WordCell
                key={partIndex}
                text={part.text}
                state={state}
                isActive={
                  activeWord?.blockId === segmentIndex && activeWord.wordIndex === thisIndex
                }
                isPhraseHighlighted={phraseSet.has(thisIndex)}
                reading={gloss ?? wordReading(annotationMode, readings, key, state)}
                readingOverhangs={gloss ? false : overhangs}
                onActivate={() => {
                  onClearPhrase();
                  onActivateWord({ blockId: segmentIndex, wordIndex: thisIndex });
                  onWordClick(
                    part.text,
                    cueSentence(segments, segmentIndex, partOffset, pack),
                    source,
                  );
                }}
              />
            );
          })}
        </p>{' '}
      </div>
    );
  };

  return (
    <div
      // See the note on the reader article: the glyph shapes follow the
      // lesson's language, not the interface language.
      lang={pack.script.bcp47}
      dir={pack.script.direction}
      className={`mx-auto max-w-[46em] px-4 py-6 text-foreground sm:px-8 sm:py-8 ${readerWrapClass(pack)}`}
      // Same typography seam as the markdown article (#570): publish the custom
      // properties here and every cue below inherits them.
      style={{
        fontSize: 'var(--reader-font-size)',
        letterSpacing: 'var(--reader-letter-spacing)',
        ...proseStyleVars(prose, pack),
      }}
      data-testid="transcript-reader"
    >
      {sideGlosses
        ? paragraphGroups(segments.length, paragraphEnds).map((indexes) => (
            <div
              key={indexes[0]}
              className={`not-last:mb-4 ${glossPlacement === 'side' ? 'relative' : ''}`}
            >
              {indexes.map((index) => renderSegment(segments[index], index))}
              <SideGlosses
                beside={glossPlacement === 'side'}
                items={sideGlossItems(
                  indexes.flatMap((index) =>
                    collectWords(segments[index].text, pack, segmentation),
                  ),
                  sideGlosses,
                  pack,
                )}
                pack={pack}
              />
            </div>
          ))
        : segments.map((segment, segmentIndex) => (
            <Fragment key={segmentIndex}>
              {renderSegment(segment, segmentIndex)}
              {paragraphEnds.has(segmentIndex) && <span aria-hidden className="block h-4" />}
            </Fragment>
          ))}
    </div>
  );
}

export default memo(TranscriptReader);
