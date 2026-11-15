import {
  sentenceSpanAt,
  tokenize,
  type LanguageConfig,
  type WordSegmentation,
} from '@/lib/languages';

/** A pdf.js text item in page units: origin top left, y grows downwards. */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fractions of the page width and height. */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageWord {
  text: string;
  rects: PageRect[];
  sentence: string;
}

export interface PageLayout {
  words: PageWord[];
  /** The page text in reading order, paragraphs separated by blank lines. */
  text: string;
}

export interface LayoutOptions {
  /** Relative width of a string, for placing words inside an item. Defaults to the character count. */
  measure?: (text: string) => number;
  segmentation?: WordSegmentation | null;
}

interface Segment {
  pieces: PdfTextItem[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Line {
  segments: Segment[];
  y0: number;
  y1: number;
}

type FlowUnit = { kind: 'text'; segment: Segment } | { kind: 'row'; cells: Segment[] };

interface CharSource {
  piece: PdfTextItem;
  offset: number;
}

interface Paragraph {
  kind: 'text' | 'row';
  chars: string[];
  sources: (CharSource | null)[];
}

const LIGATURES = /[ﬀ-ﬆ]/g;
const SOFT_HYPHEN = /­/g;
const LINE_END_HYPHEN = /[-­‐]$/;
const LETTER = /\p{L}/u;
const LOWER = /\p{Ll}/u;
/** Gap, in font heights, that separates two segments on one line (a column gutter or a table cell). */
const SEGMENT_GAP = 1.0;
/** Gap, in font heights, under which two items touch without a space. */
const SPACE_GAP = 0.15;

function normalizeItem(str: string): string {
  return str.replace(LIGATURES, (ch) => ch.normalize('NFKC')).replace(/\s+/g, ' ');
}

function centerY(box: { y: number; height: number }): number {
  return box.y + box.height / 2;
}

function segmentOf(pieces: PdfTextItem[]): Segment {
  return {
    pieces,
    x0: Math.min(...pieces.map((p) => p.x)),
    x1: Math.max(...pieces.map((p) => p.x + p.width)),
    y0: Math.min(...pieces.map((p) => p.y)),
    y1: Math.max(...pieces.map((p) => p.y + p.height)),
  };
}

function buildLines(pieces: PdfTextItem[], rtl: boolean): Line[] {
  const sorted = [...pieces].sort((a, b) => centerY(a) - centerY(b) || a.x - b.x);
  const groups: PdfTextItem[][] = [];
  for (const piece of sorted) {
    const current = groups[groups.length - 1];
    if (current) {
      const anchor = current[0];
      const tolerance = 0.5 * Math.min(anchor.height, piece.height);
      if (Math.abs(centerY(piece) - centerY(anchor)) <= tolerance) {
        current.push(piece);
        continue;
      }
    }
    groups.push([piece]);
  }

  return groups.map((group) => {
    const ordered = [...group].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
    const segments: PdfTextItem[][] = [];
    for (const piece of ordered) {
      const current = segments[segments.length - 1];
      const previous = current?.[current.length - 1];
      const gap = previous
        ? rtl
          ? previous.x - (piece.x + piece.width)
          : piece.x - (previous.x + previous.width)
        : 0;
      if (current && gap <= SEGMENT_GAP * Math.max(piece.height, previous!.height)) {
        current.push(piece);
      } else {
        segments.push([piece]);
      }
    }
    const built = segments.map(segmentOf);
    return {
      segments: built,
      y0: Math.min(...built.map((s) => s.y0)),
      y1: Math.max(...built.map((s) => s.y1)),
    };
  });
}

type Side = 'left' | 'right' | 'full';

function sideOf(segment: Segment, pageWidth: number): Side {
  const mid = pageWidth / 2;
  const slack = pageWidth * 0.02;
  if (segment.x1 <= mid + slack) return 'left';
  if (segment.x0 >= mid - slack) return 'right';
  return 'full';
}

/** Two columns when most wide segments sit wholly on one side of the middle, with enough on each side. */
function isTwoColumn(lines: Line[], pageWidth: number): boolean {
  const wide = lines.flatMap((line) => line.segments).filter((s) => s.x1 - s.x0 >= pageWidth * 0.2);
  if (wide.length < 6) return false;
  const sides = wide.map((s) => sideOf(s, pageWidth));
  const left = sides.filter((s) => s === 'left').length;
  const right = sides.filter((s) => s === 'right').length;
  return left >= 3 && right >= 3 && left + right >= wide.length * 0.6;
}

function flowUnits(lines: Line[], pageWidth: number, rtl: boolean): FlowUnit[] {
  if (!isTwoColumn(lines, pageWidth)) {
    return lines.map((line) =>
      line.segments.length > 1
        ? { kind: 'row', cells: line.segments }
        : { kind: 'text', segment: line.segments[0] },
    );
  }

  const segments = lines.flatMap((line) => line.segments).sort((a, b) => a.y0 - b.y0);
  const units: FlowUnit[] = [];
  let first: Segment[] = [];
  let second: Segment[] = [];
  const flush = () => {
    for (const segment of [...first, ...second]) units.push({ kind: 'text', segment });
    first = [];
    second = [];
  };
  for (const segment of segments) {
    const side = sideOf(segment, pageWidth);
    if (side === 'full') {
      flush();
      units.push({ kind: 'text', segment });
    } else if ((side === 'left') !== rtl) {
      first.push(segment);
    } else {
      second.push(segment);
    }
  }
  flush();
  return units;
}

function pushPiece(paragraph: Paragraph, piece: PdfTextItem, until = piece.str.length): void {
  for (let i = 0; i < until; i++) {
    paragraph.chars.push(piece.str[i]);
    paragraph.sources.push({ piece, offset: i });
  }
}

function pushGap(paragraph: Paragraph, text: string): void {
  for (const ch of text) {
    paragraph.chars.push(ch);
    paragraph.sources.push(null);
  }
}

function lastChar(paragraph: Paragraph): string {
  return paragraph.chars[paragraph.chars.length - 1] ?? '';
}

function appendSegment(
  paragraph: Paragraph,
  segment: Segment,
  rtl: boolean,
  spaced: boolean,
): void {
  let previous: PdfTextItem | null = null;
  for (const piece of segment.pieces) {
    if (previous) {
      const gap = rtl
        ? previous.x - (piece.x + piece.width)
        : piece.x - (previous.x + previous.width);
      const needsSpace =
        spaced &&
        gap > SPACE_GAP * Math.max(piece.height, previous.height) &&
        lastChar(paragraph) !== ' ' &&
        !piece.str.startsWith(' ');
      if (needsSpace) pushGap(paragraph, ' ');
    }
    pushPiece(paragraph, piece);
    previous = piece;
  }
}

/** Join `segment` to the paragraph as its next line, dropping a hyphen that splits a word. */
function appendLine(paragraph: Paragraph, segment: Segment, rtl: boolean, spaced: boolean): void {
  while (lastChar(paragraph) === ' ') {
    paragraph.chars.pop();
    paragraph.sources.pop();
  }
  const end = paragraph.chars.length;
  const firstChar = segment.pieces[0]?.str.trimStart()[0] ?? '';
  if (
    end >= 2 &&
    LINE_END_HYPHEN.test(paragraph.chars[end - 1]) &&
    LETTER.test(paragraph.chars[end - 2]) &&
    LOWER.test(firstChar)
  ) {
    paragraph.chars.pop();
    paragraph.sources.pop();
  } else if (spaced) {
    pushGap(paragraph, ' ');
  }
  appendSegment(paragraph, segment, rtl, spaced);
}

function buildParagraphs(units: FlowUnit[], rtl: boolean, spaced: boolean): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | null = null;
  let previous: Segment | null = null;

  for (const unit of units) {
    if (unit.kind === 'row') {
      const row: Paragraph = { kind: 'row', chars: [], sources: [] };
      unit.cells.forEach((cell, index) => {
        if (index > 0) pushGap(row, ' | ');
        appendSegment(row, cell, rtl, spaced);
      });
      paragraphs.push(row);
      current = null;
      previous = null;
      continue;
    }

    const segment = unit.segment;
    const height = segment.y1 - segment.y0;
    const continues =
      current !== null &&
      previous !== null &&
      segment.y0 - previous.y1 < 0.9 * Math.max(height, previous.y1 - previous.y0) &&
      segment.y0 >= previous.y0 &&
      segment.x0 < previous.x1 &&
      segment.x1 > previous.x0;
    if (continues && current) {
      appendLine(current, segment, rtl, spaced);
    } else {
      current = { kind: 'text', chars: [], sources: [] };
      appendSegment(current, segment, rtl, spaced);
      paragraphs.push(current);
    }
    previous = segment;
  }
  return paragraphs;
}

function rectsFor(
  sources: (CharSource | null)[],
  measure: (text: string) => number,
  pageWidth: number,
  pageHeight: number,
  rtl: boolean,
): PageRect[] {
  const runs: { piece: PdfTextItem; from: number; to: number }[] = [];
  for (const source of sources) {
    if (!source) continue;
    const run = runs[runs.length - 1];
    if (run && run.piece === source.piece && source.offset === run.to) run.to += 1;
    else runs.push({ piece: source.piece, from: source.offset, to: source.offset + 1 });
  }
  return runs.map(({ piece, from, to }) => {
    const total = measure(piece.str) || 1;
    const start = (measure(piece.str.slice(0, from)) / total) * piece.width;
    const end = (measure(piece.str.slice(0, to)) / total) * piece.width;
    const left = rtl ? piece.x + piece.width - end : piece.x + start;
    return {
      x: left / pageWidth,
      y: piece.y / pageHeight,
      width: (end - start) / pageWidth,
      height: piece.height / pageHeight,
    };
  });
}

type Matrix = [number, number, number, number, number, number];

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  fontName?: string;
}

/**
 * pdf.js text items in the coordinates of a scale-1 viewport. Rotated text is left out.
 * `ascent` is the font ascent as a fraction of the font height, from pdf.js `styles`.
 */
export function toPageItems(
  items: unknown[],
  viewportTransform: number[],
  ascent: (fontName: string | undefined) => number = () => 0.8,
): PdfTextItem[] {
  const result: PdfTextItem[] = [];
  for (const raw of items) {
    const item = raw as Partial<RawTextItem>;
    if (typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
    const tx = multiply(viewportTransform as Matrix, item.transform as Matrix);
    if (Math.abs(tx[1]) > Math.abs(tx[0]) * 0.05 || tx[0] <= 0) continue;
    const fontHeight = Math.hypot(tx[2], tx[3]);
    if (!fontHeight) continue;
    const scaleX = Math.hypot(viewportTransform[0], viewportTransform[1]);
    result.push({
      str: item.str,
      x: tx[4],
      y: tx[5] - fontHeight * ascent(item.fontName),
      width: (item.width ?? 0) * scaleX,
      height: fontHeight,
    });
  }
  return result;
}

/** Words of one PDF page with their boxes and sentences, in reading order. */
export function layoutPage(
  items: PdfTextItem[],
  page: { width: number; height: number },
  pack: LanguageConfig,
  options: LayoutOptions = {},
): PageLayout {
  const measure = options.measure ?? ((text: string) => text.length);
  const rtl = pack.script.direction === 'rtl';
  const spaced = pack.script.kind !== 'cjk-unspaced';
  const pieces: PdfTextItem[] = items
    .map((item) => ({ ...item, str: normalizeItem(item.str) }))
    .filter((item) => item.str.trim() && item.width > 0 && item.height > 0);
  if (pieces.length === 0) return { words: [], text: '' };

  const lines = buildLines(pieces, rtl);
  const paragraphs = buildParagraphs(flowUnits(lines, page.width, rtl), rtl, spaced);

  const words: PageWord[] = [];
  const texts: string[] = [];
  for (const paragraph of paragraphs) {
    const joined = paragraph.chars.join('');
    const text = joined.replace(SOFT_HYPHEN, '');
    texts.push(text.trim());
    const sources = paragraph.sources.filter((_, i) => paragraph.chars[i] !== '­');
    for (const token of tokenize(text, pack, options.segmentation)) {
      if (!token.isWord) continue;
      const span =
        paragraph.kind === 'row'
          ? { start: 0, end: text.length }
          : sentenceSpanAt(text, token.start, pack);
      words.push({
        text: token.text,
        rects: rectsFor(
          sources.slice(token.start, token.end),
          measure,
          page.width,
          page.height,
          rtl,
        ),
        sentence: text.slice(span.start, span.end).trim(),
      });
    }
  }
  return { words, text: texts.filter(Boolean).join('\n\n') };
}
