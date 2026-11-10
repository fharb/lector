import { activeSegmentIndex } from '@/components/ListenAlong/utils';
import { sentenceSpanAt, type LanguageConfig } from '@/lib/languages';
import type { TranscriptSegment } from '@/types';

/** The cue the video is inside, or the last one it passed. Null before the first cue. */
export function transcriptSegmentAt(segments: TranscriptSegment[], seconds: number): number | null {
  const index = activeSegmentIndex(
    segments.map((segment) => ({ startMs: segment.start * 1000 })),
    seconds * 1000,
  );
  return index < 0 ? null : index;
}

export const LINES_BELOW_VIDEO = 2;

/** The scrollTop that leaves `gap` pixels between a sticky header and a row. */
export function belowStickyScrollTop({
  rowTop,
  stickyHeight,
  gap,
}: {
  rowTop: number;
  stickyHeight: number;
  gap: number;
}): number {
  return Math.max(0, rowTop - stickyHeight - gap);
}

const PARAGRAPH_MIN_CHARS = 300;
const PARAGRAPH_MAX_CHARS = 600;
const SENTENCE_END = /[.!?…。！？؟»"”)\]]$/u;

/** Indexes of the cues that end a paragraph when cues flow together as running text. */
export function paragraphEndIndexes(segments: Pick<TranscriptSegment, 'text'>[]): Set<number> {
  const ends = new Set<number>();
  let length = 0;
  segments.forEach((segment, index) => {
    length += segment.text.length + 1;
    const sentenceEnds = SENTENCE_END.test(segment.text.trim());
    if ((length >= PARAGRAPH_MIN_CHARS && sentenceEnds) || length >= PARAGRAPH_MAX_CHARS) {
      ends.add(index);
      length = 0;
    }
  });
  return ends;
}

const MAX_CUE_SENTENCE_CHARS = 300;

/**
 * The sentence around `offset` in cue `index`, joined across neighbouring cues.
 * Past the cap it keeps the whole cues nearest the click.
 */
export function cueSentence(
  segments: Pick<TranscriptSegment, 'text'>[],
  index: number,
  offset: number,
  pack: LanguageConfig,
): string {
  const separator = pack.script.kind === 'cjk-unspaced' ? '' : ' ';
  const span = (i: number) => segments[i].text.length + separator.length;

  let first = index;
  for (let chars = 0; first > 0 && chars < MAX_CUE_SENTENCE_CHARS; chars += span(first)) first--;
  let last = index;
  for (let chars = 0; last < segments.length - 1 && chars < MAX_CUE_SENTENCE_CHARS; ) {
    last++;
    chars += span(last);
  }

  const cues = segments.slice(first, last + 1).map((segment) => segment.text);
  const joined = cues.join(separator);
  const starts: number[] = [];
  cues.reduce((start, cue, i) => {
    starts[i] = start;
    return start + cue.length + separator.length;
  }, 0);
  const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

  const clicked = index - first;
  const sentence = sentenceSpanAt(joined, starts[clicked] + offset, pack);
  if (sentence.end - sentence.start <= MAX_CUE_SENTENCE_CHARS) {
    return tidy(joined.slice(sentence.start, sentence.end));
  }

  let low = clicked;
  let high = clicked;
  let length = cues[clicked].length;
  const fits = (i: number): boolean => {
    if (i < 0 || i >= cues.length) return false;
    const next = length + separator.length + cues[i].length;
    if (next > MAX_CUE_SENTENCE_CHARS) return false;
    length = next;
    return true;
  };
  for (let grew = true; grew; ) {
    const before = fits(low - 1);
    if (before) low--;
    const after = fits(high + 1);
    if (after) high++;
    grew = before || after;
  }
  return tidy(
    joined.slice(
      Math.max(sentence.start, starts[low]),
      Math.min(sentence.end, starts[high] + cues[high].length),
    ),
  );
}
