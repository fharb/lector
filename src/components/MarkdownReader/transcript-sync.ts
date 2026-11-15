import { activeSegmentIndex } from '@/components/ListenAlong/utils';
import { sentenceSpanAt, splitSentences, type LanguageConfig } from '@/lib/languages';
import type { Lesson, TranscriptSegment, YouTubeSourceMeta } from '@/types';

/** The cues and the video of a YouTube lesson. Null for any other lesson, or a malformed payload. */
export function parseTranscript(
  lesson: Pick<Lesson, 'sourceType' | 'segments' | 'sourceMeta'>,
): { segments: TranscriptSegment[]; meta: YouTubeSourceMeta } | null {
  if (lesson.sourceType !== 'youtube') return null;
  try {
    const segments = lesson.segments ? (JSON.parse(lesson.segments) as TranscriptSegment[]) : [];
    const meta = lesson.sourceMeta ? (JSON.parse(lesson.sourceMeta) as YouTubeSourceMeta) : null;
    if (!Array.isArray(segments) || segments.length === 0 || !meta?.videoId) return null;
    return { segments, meta };
  } catch {
    return null;
  }
}

/** mm:ss / h:mm:ss label for a second offset (mirrors the server helper). */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/** The sentence playing at `seconds`: the last one that has started. */
export function sentenceAt(sentences: Pick<TimedSentence, 'start'>[], seconds: number): number {
  let index = 0;
  sentences.forEach((sentence, i) => {
    if (sentence.start <= seconds) index = i;
  });
  return index;
}

export interface TimedSentence {
  text: string;
  /** Seconds: the start of its first cue and the end of its last cue. */
  start: number;
  end: number;
  firstCue: number;
  lastCue: number;
  /** Character offsets: where it starts in its first cue, and ends in its last cue. */
  from: number;
  to: number;
}

export interface SentencePart {
  cue: number;
  start: number;
  text: string;
}

/** The sentence cut at its cue boundaries, each piece with its cue and that cue's start. */
export function sentenceParts(
  segments: TranscriptSegment[],
  sentence: Pick<TimedSentence, 'firstCue' | 'lastCue' | 'from' | 'to'>,
): SentencePart[] {
  const parts: SentencePart[] = [];
  for (let cue = sentence.firstCue; cue <= sentence.lastCue; cue++) {
    const text = segments[cue].text
      .slice(
        cue === sentence.firstCue ? sentence.from : 0,
        cue === sentence.lastCue ? sentence.to : undefined,
      )
      .replace(/\s+/g, ' ')
      .trim();
    if (text) parts.push({ cue, start: segments[cue].start, text });
  }
  return parts;
}

/** A sentence longer than this, as in captions without punctuation, is cut at cue boundaries. */
const MAX_TIMED_SENTENCE_CHARS = 200;

/** The transcript's sentences, each with the cues and the time span it covers. */
export function transcriptSentences(
  segments: TranscriptSegment[],
  pack: LanguageConfig,
): TimedSentence[] {
  const separator = pack.script.kind === 'cjk-unspaced' ? '' : ' ';
  const starts: number[] = [];
  let joined = '';
  segments.forEach((segment, i) => {
    if (i > 0) joined += separator;
    starts.push(joined.length);
    joined += segment.text;
  });
  const cueAt = (offset: number) => {
    let cue = 0;
    while (cue + 1 < starts.length && starts[cue + 1] <= offset) cue++;
    return cue;
  };
  const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

  const result: TimedSentence[] = [];
  const pushSpan = (from: number, to: number) => {
    const text = tidy(joined.slice(from, to));
    if (!text) return;
    const firstCue = cueAt(from);
    const lastCue = cueAt(Math.max(from, to - 1));
    result.push({
      text,
      start: segments[firstCue].start,
      end: segments[lastCue].end,
      firstCue,
      lastCue,
      from: from - starts[firstCue],
      to: to - starts[lastCue],
    });
  };
  let cursor = 0;
  for (const sentence of splitSentences(joined, pack)) {
    const from = joined.indexOf(sentence, cursor);
    const to = from + sentence.length;
    cursor = to;
    const first = cueAt(from);
    const last = cueAt(Math.max(from, to - 1));
    if (tidy(sentence).length <= MAX_TIMED_SENTENCE_CHARS || first === last) {
      pushSpan(from, to);
      continue;
    }
    let chunkFrom = from;
    for (let cue = first + 1; cue <= last; cue++) {
      const cueEnd = Math.min(to, starts[cue] + segments[cue].text.length);
      if (tidy(joined.slice(chunkFrom, cueEnd)).length > MAX_TIMED_SENTENCE_CHARS) {
        pushSpan(chunkFrom, starts[cue]);
        chunkFrom = starts[cue];
      }
    }
    pushSpan(chunkFrom, to);
  }
  return result;
}

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

/** Cue indexes grouped into paragraphs, using the ends from `paragraphEndIndexes`. */
export function paragraphGroups(count: number, ends: Set<number>): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  for (let index = 0; index < count; index++) {
    current.push(index);
    if (ends.has(index)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
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
