import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '@/lib/languages';
import type { TranscriptSegment } from '@/types';
import {
  belowStickyScrollTop,
  cueSentence,
  paragraphEndIndexes,
  paragraphGroups,
  parseTranscript,
  sentenceAt,
  sentenceParts,
  transcriptSegmentAt,
  transcriptSentences,
} from './transcript-sync';

const SEGMENTS: TranscriptSegment[] = [
  { start: 1, end: 3, text: 'een' },
  { start: 3, end: 5, text: 'twee' },
  { start: 8, end: 10, text: 'drie' },
];

describe('transcriptSegmentAt', () => {
  it('returns null before the first cue', () => {
    expect(transcriptSegmentAt(SEGMENTS, 0.5)).toBeNull();
  });

  it('finds the cue at its start and inside it', () => {
    expect(transcriptSegmentAt(SEGMENTS, 3)).toBe(1);
    expect(transcriptSegmentAt(SEGMENTS, 4.25)).toBe(1);
  });

  it('holds the last cue across a gap and after the end', () => {
    expect(transcriptSegmentAt(SEGMENTS, 6)).toBe(1);
    expect(transcriptSegmentAt(SEGMENTS, 99)).toBe(2);
  });

  it('returns null for an empty transcript', () => {
    expect(transcriptSegmentAt([], 5)).toBeNull();
  });
});

describe('belowStickyScrollTop', () => {
  it('leaves the gap between the sticky header and the row', () => {
    expect(belowStickyScrollTop({ rowTop: 2000, stickyHeight: 400, gap: 56 })).toBe(1544);
  });

  it('never scrolls above the top', () => {
    expect(belowStickyScrollTop({ rowTop: 420, stickyHeight: 400, gap: 56 })).toBe(0);
  });
});

describe('paragraphEndIndexes', () => {
  const cue = (text: string) => ({ text });
  const long = 'a'.repeat(160);

  it('ends a paragraph at a sentence once it is long enough', () => {
    expect(paragraphEndIndexes([cue(long), cue(`${long}.`), cue('b')])).toEqual(new Set([1]));
  });

  it('does not end a short paragraph at a sentence', () => {
    expect(paragraphEndIndexes([cue('Hallo.'), cue('Wereld.')])).toEqual(new Set());
  });

  it('ends a long paragraph even with no punctuation', () => {
    const cues = Array.from({ length: 4 }, () => cue(long));
    expect(paragraphEndIndexes(cues)).toEqual(new Set([3]));
  });

  it('returns nothing for no cues', () => {
    expect(paragraphEndIndexes([])).toEqual(new Set());
  });
});

describe('cueSentence', () => {
  const af = LANGUAGES.af;
  const cues = (...texts: string[]) => texts.map((text) => ({ text }));

  it('joins the cues a sentence runs across', () => {
    const segments = cues(
      'Hy slaap.',
      "Voici des images anciennes d'une",
      'vieille maison.',
      'Klaar.',
    );
    const whole = "Voici des images anciennes d'une vieille maison.";
    expect(cueSentence(segments, 1, 6, af)).toBe(whole);
    expect(cueSentence(segments, 2, 0, af)).toBe(whole);
  });

  it('picks the sentence of the clicked word when a cue holds two', () => {
    const segments = cues('Een. Twee woord', 'hier. Drie.');
    expect(cueSentence(segments, 0, 0, af)).toBe('Een.');
    expect(cueSentence(segments, 0, 5, af)).toBe('Twee woord hier.');
    expect(cueSentence(segments, 1, 6, af)).toBe('Drie.');
  });

  it('keeps the cues nearest the click when there is no punctuation', () => {
    const segments = cues(...Array.from({ length: 11 }, (_, i) => `${i}`.padEnd(90, 'x')));
    const result = cueSentence(segments, 5, 0, af);
    expect(result).toBe([4, 5, 6].map((i) => `${i}`.padEnd(90, 'x')).join(' '));
  });

  it('keeps a single cue that is over the cap', () => {
    const long = 'a'.repeat(400);
    expect(cueSentence(cues('Voor.', long, 'Na.'), 1, 0, af)).toBe(long);
  });

  it('joins without spaces in an unspaced script', () => {
    expect(cueSentence(cues('我喜欢', '读书。', '他来了。'), 0, 0, LANGUAGES.zh)).toBe(
      '我喜欢读书。',
    );
  });

  it('flattens line breaks inside a cue', () => {
    expect(cueSentence(cues('Een\ntwee', 'drie.'), 0, 0, af)).toBe('Een twee drie.');
  });

  it('returns the cue itself when it is the only one', () => {
    expect(cueSentence(cues('Net een'), 0, 0, af)).toBe('Net een');
  });
});

describe('paragraphGroups', () => {
  it('splits cues after each paragraph end and keeps the rest', () => {
    expect(paragraphGroups(5, new Set([1, 3]))).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('keeps every cue in one group with no ends', () => {
    expect(paragraphGroups(3, new Set())).toEqual([[0, 1, 2]]);
  });

  it('returns no groups for no cues', () => {
    expect(paragraphGroups(0, new Set())).toEqual([]);
  });
});

describe('transcriptSentences', () => {
  const af = LANGUAGES.af;
  const cue = (start: number, text: string): TranscriptSegment => ({ start, end: start + 2, text });

  it('gives each sentence the time span of the cues it covers', () => {
    expect(
      transcriptSentences(
        [cue(0, 'Die kat slaap'), cue(2, 'lekker. Die hond'), cue(4, 'blaf hard!')],
        af,
      ),
    ).toEqual([
      { text: 'Die kat slaap lekker.', start: 0, end: 4, firstCue: 0, lastCue: 1, from: 0, to: 7 },
      { text: 'Die hond blaf hard!', start: 2, end: 6, firstCue: 1, lastCue: 2, from: 8, to: 10 },
    ]);
  });

  it('cuts a long sentence without punctuation at cue boundaries', () => {
    const cues = Array.from({ length: 12 }, (_, i) => cue(i * 2, `woord${i} `.repeat(4).trim()));
    const sentences = transcriptSentences(cues, af);
    expect(sentences.length).toBeGreaterThan(1);
    for (const sentence of sentences) expect(sentence.text.length).toBeLessThanOrEqual(200);
    expect(sentences[0].start).toBe(0);
    expect(sentences.at(-1)!.end).toBe(24);
    expect(sentences.map((s) => s.text).join(' ')).toBe(cues.map((c) => c.text).join(' '));
  });

  it('returns nothing for no cues', () => {
    expect(transcriptSentences([], af)).toEqual([]);
  });
});

describe('parseTranscript', () => {
  const meta = JSON.stringify({ videoId: 'abc' });
  const segments = JSON.stringify([{ start: 0, end: 1, text: 'Hallo' }]);

  it('reads a YouTube lesson and refuses anything else', () => {
    expect(
      parseTranscript({ sourceType: 'youtube', segments, sourceMeta: meta })?.meta.videoId,
    ).toBe('abc');
    expect(parseTranscript({ sourceType: null, segments, sourceMeta: meta })).toBeNull();
    expect(parseTranscript({ sourceType: 'youtube', segments: '[]', sourceMeta: meta })).toBeNull();
    expect(
      parseTranscript({ sourceType: 'youtube', segments: '{bad', sourceMeta: meta }),
    ).toBeNull();
  });
});

describe('sentenceAt', () => {
  const sentences = [{ start: 0 }, { start: 2 }, { start: 7 }];

  it('is the last sentence that has started', () => {
    expect(sentenceAt(sentences, 0)).toBe(0);
    expect(sentenceAt(sentences, 2)).toBe(1);
    expect(sentenceAt(sentences, 6.9)).toBe(1);
    expect(sentenceAt(sentences, 99)).toBe(2);
  });

  it('is the first sentence before any start, and 0 without sentences', () => {
    expect(sentenceAt([{ start: 3 }], 1)).toBe(0);
    expect(sentenceAt([], 5)).toBe(0);
  });
});

describe('sentenceParts', () => {
  const cues: TranscriptSegment[] = [
    { start: 0, end: 2, text: 'Die kat slaap' },
    { start: 2, end: 4, text: 'lekker. Die hond' },
    { start: 4, end: 6, text: 'blaf hard!' },
  ];

  it('cuts a sentence at its cue boundaries, with each cue start', () => {
    const [first, second] = transcriptSentences(cues, LANGUAGES.af);
    expect(sentenceParts(cues, first)).toEqual([
      { cue: 0, start: 0, text: 'Die kat slaap' },
      { cue: 1, start: 2, text: 'lekker.' },
    ]);
    expect(sentenceParts(cues, second)).toEqual([
      { cue: 1, start: 2, text: 'Die hond' },
      { cue: 2, start: 4, text: 'blaf hard!' },
    ]);
  });
});
