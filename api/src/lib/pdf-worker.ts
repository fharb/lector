import { Database } from 'bun:sqlite';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { buildSegmentWords, countWords } from './html-to-markdown';
import { normalizeText } from './languages';
import { packForLanguage } from './active-language';
import {
  deletePdfForLesson,
  pdfPathForLesson,
  type OutlineEntry,
  type PdfImportMode,
} from './pdf-files';
import { pdfjsTools, type PdfTools } from './pdf-tools';
import { Sentry } from './sentry';

export interface PdfSourceMeta {
  mode: PdfImportMode;
  originalName?: string;
  pageCount?: number;
  outline?: OutlineEntry[];
  /** 1-based pages with no text layer, for example a scanned figure. */
  emptyPages?: number[];
}

export interface PendingPdf {
  userId: string;
  id: string;
  collectionId: string | null;
  title: string;
  language: string;
  sourceMeta: string | null;
}

const MIN_LETTERS = 20;
const PAGES_PER_TEXT_LESSON = 10;

const LETTER = /\p{L}/gu;

/** True when a page has almost no letters: a scan, or a page that is only a figure. */
export function pageIsEmpty(text: string): boolean {
  return (text.match(LETTER)?.length ?? 0) < MIN_LETTERS;
}

export const NO_TEXT_ERROR =
  'This PDF has no text, so it cannot be imported. It is probably a scan: run it through OCR first, then import it again.';

const LIGATURES = /[ﬀ-ﬆ]/g;
const CONTROL = /[\u0000-\u0008\u000b\u000e-\u001f\u007f]/g;
const LINE_END_HYPHEN = /(\p{L})[-­‐]\n(\p{Ll})/gu;

/** Page text as paragraphs: ligatures split, words broken at line ends joined, lines inside a paragraph joined. */
export function pageParagraphs(text: string): string[] {
  const cleaned = normalizeText(
    text
      .replace(/\r\n?/g, '\n')
      .replace(LIGATURES, (ch) => ch.normalize('NFKC'))
      .replace(CONTROL, '')
      .replace(/­(?!\n)/g, ''),
  ).replace(LINE_END_HYPHEN, '$1$2');
  return cleaned
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

const MARKDOWN_INLINE = /([\\`*_[\]<>])/g;
const MARKDOWN_BLOCK_START = /^(#{1,6}\s|[-+*]\s|\d{1,9}[.)]\s|\||=+\s*$|-{3,}\s*$)/;

export function escapeMarkdown(paragraph: string): string {
  const inline = paragraph.replace(MARKDOWN_INLINE, '\\$1');
  return MARKDOWN_BLOCK_START.test(inline) ? `\\${inline}` : inline;
}

export interface TextChapter {
  title: string;
  firstPage: number;
  lastPage: number;
}

/** Lesson boundaries for text mode: the top outline entries in page order, or fixed blocks of pages. */
export function textChapters(
  outline: OutlineEntry[],
  pageCount: number,
  bookTitle: string,
): TextChapter[] {
  const starts = new Map<number, string>();
  for (const entry of [...outline].sort((a, b) => a.page - b.page)) {
    if (entry.page > pageCount || starts.has(entry.page)) continue;
    starts.set(entry.page, entry.title);
  }
  if (starts.size > 0) {
    const pages = [...starts.keys()];
    const chapters: TextChapter[] = [];
    if (pages[0] > 1) {
      chapters.push({ title: bookTitle, firstPage: 1, lastPage: pages[0] - 1 });
    }
    pages.forEach((page, index) => {
      chapters.push({
        title: starts.get(page)!,
        firstPage: page,
        lastPage: index + 1 < pages.length ? pages[index + 1] - 1 : pageCount,
      });
    });
    return chapters;
  }
  const chapters: TextChapter[] = [];
  for (let first = 1; first <= pageCount; first += PAGES_PER_TEXT_LESSON) {
    const last = Math.min(pageCount, first + PAGES_PER_TEXT_LESSON - 1);
    chapters.push({
      title:
        pageCount <= PAGES_PER_TEXT_LESSON
          ? bookTitle
          : `${bookTitle} (${first === last ? `p. ${first}` : `pp. ${first}–${last}`})`,
      firstPage: first,
      lastPage: last,
    });
  }
  return chapters;
}

export function parsePdfSourceMeta(value: string | null): PdfSourceMeta {
  try {
    const parsed = value ? JSON.parse(value) : null;
    if (parsed && typeof parsed === 'object' && (parsed.mode === 'pages' || parsed.mode === 'text'))
      return parsed as PdfSourceMeta;
  } catch {
    /* fall through */
  }
  return { mode: 'pages' };
}

export function resetStalePdfJobs(database: Database): number {
  return database
    .prepare("UPDATE lessons SET pdfStatus = 'pending' WHERE pdfStatus = 'processing'")
    .run().changes;
}

export function selectNextPendingPdf(database: Database): PendingPdf | null {
  return (
    (database
      .prepare(
        `SELECT userId, id, collectionId, title, language, sourceMeta
           FROM lessons
          WHERE pdfStatus = 'pending' AND sourceType = 'pdf'
          ORDER BY createdAt, id
          LIMIT 1`,
      )
      .get() as PendingPdf | undefined) ?? null
  );
}

function lessonExists(database: Database, row: PendingPdf): boolean {
  return Boolean(
    database.prepare('SELECT 1 FROM lessons WHERE userId = ? AND id = ?').get(row.userId, row.id),
  );
}

function markFailed(database: Database, row: PendingPdf, message: string): void {
  database
    .prepare("UPDATE lessons SET pdfStatus = 'failed', pdfError = ? WHERE userId = ? AND id = ?")
    .run(message.slice(0, 500), row.userId, row.id);
}

/** Pages mode: the lesson keeps its PDF and gets the joined page text. */
export function applyPagesResult(
  database: Database,
  row: PendingPdf,
  meta: PdfSourceMeta,
  pages: string[][],
): void {
  const pack = packForLanguage(row.language);
  const text = pages
    .map((paragraphs) => paragraphs.join('\n\n'))
    .filter(Boolean)
    .join('\n\n');
  database
    .prepare(
      `UPDATE lessons
          SET textContent = ?, wordCount = ?, segmentWords = ?, sourceMeta = ?,
              pdfStatus = 'ready', pdfError = NULL
        WHERE userId = ? AND id = ?`,
    )
    .run(
      text,
      countWords(text, pack),
      buildSegmentWords(text, pack),
      JSON.stringify(meta),
      row.userId,
      row.id,
    );
}

/** Text mode: the pending lesson becomes the first chapter, the rest are added after it, and the PDF goes. */
export function applyTextResult(
  database: Database,
  row: PendingPdf,
  meta: PdfSourceMeta,
  pages: string[][],
): number {
  const pack = packForLanguage(row.language);
  const chapters = textChapters(meta.outline ?? [], pages.length, row.title)
    .map((chapter) => ({
      title: normalizeText(chapter.title),
      markdown: pages
        .slice(chapter.firstPage - 1, chapter.lastPage)
        .flat()
        .map(escapeMarkdown)
        .join('\n\n'),
    }))
    .filter((chapter) => chapter.markdown.trim());
  if (chapters.length === 0) throw new Error('The PDF has no text to extract');

  const insert = database.prepare(
    `INSERT INTO lessons (id, collectionId, title, sortOrder, textContent, wordCount, segmentWords,
                          language, createdAt, lastReadAt, userId, sourceMeta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  const finalMeta = JSON.stringify({ ...meta, outline: undefined });
  database.transaction(() => {
    const [first, ...rest] = chapters;
    database
      .prepare(
        `UPDATE lessons
            SET title = ?, textContent = ?, wordCount = ?, segmentWords = ?, sourceType = NULL,
                sourceMeta = ?, pdfStatus = NULL, pdfError = NULL
          WHERE userId = ? AND id = ?`,
      )
      .run(
        first.title,
        first.markdown,
        countWords(first.markdown, pack),
        buildSegmentWords(first.markdown, pack),
        finalMeta,
        row.userId,
        row.id,
      );
    rest.forEach((chapter, index) => {
      insert.run(
        randomUUID(),
        row.collectionId,
        chapter.title,
        index + 1,
        chapter.markdown,
        countWords(chapter.markdown, pack),
        buildSegmentWords(chapter.markdown, pack),
        row.language,
        now,
        now,
        row.userId,
        finalMeta,
      );
    });
  })();
  deletePdfForLesson(row.id);
  return chapters.length;
}

export type PdfDrainOutcome =
  | { state: 'idle' }
  | { state: 'done'; lessonId: string; pages: number; emptyPages: number }
  | { state: 'failed'; lessonId: string; error: string };

/** One drain step: claim the oldest pending PDF, read its text, and store the result. */
export async function processNextPendingPdf(
  database: Database,
  tools: PdfTools,
): Promise<PdfDrainOutcome> {
  const row = selectNextPendingPdf(database);
  if (!row) return { state: 'idle' };

  const claimed = database
    .prepare(
      `UPDATE lessons SET pdfStatus = 'processing'
        WHERE userId = ? AND id = ? AND pdfStatus = 'pending'`,
    )
    .run(row.userId, row.id).changes;
  if (claimed === 0) return { state: 'idle' };

  const file = pdfPathForLesson(row.id);
  if (!fs.existsSync(file)) {
    const message = 'The PDF file is missing on disk';
    markFailed(database, row, message);
    return { state: 'failed', lessonId: row.id, error: message };
  }

  const meta = parsePdfSourceMeta(row.sourceMeta);
  try {
    const texts = await tools.extractText(file);
    if (!lessonExists(database, row)) return { state: 'idle' };
    meta.pageCount = texts.length;
    const emptyPages = texts.flatMap((text, index) => (pageIsEmpty(text) ? [index + 1] : []));
    if (emptyPages.length === texts.length) throw new Error(NO_TEXT_ERROR);
    if (emptyPages.length > 0) meta.emptyPages = emptyPages;
    const pages = texts.map(pageParagraphs);
    if (meta.mode === 'text') applyTextResult(database, row, meta, pages);
    else applyPagesResult(database, row, meta, pages);
    return {
      state: 'done',
      lessonId: row.id,
      pages: pages.length,
      emptyPages: emptyPages.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    markFailed(database, row, message);
    return { state: 'failed', lessonId: row.id, error: message };
  }
}

let loopTimer: ReturnType<typeof setInterval> | null = null;
let kickTimer: ReturnType<typeof setTimeout> | null = null;
let ticking = false;
let staleJobsReset = false;
let activeTools: PdfTools = pdfjsTools;

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    // Not at boot: the e2e setup wipes DATA_DIR while the API starts, so the DB must open lazily.
    if (!staleJobsReset) {
      resetStalePdfJobs(db);
      staleJobsReset = true;
    }
    for (;;) {
      const outcome = await Sentry.startSpan({ name: 'pdf-worker.tick', op: 'queue.process' }, () =>
        processNextPendingPdf(db, activeTools),
      );
      if (outcome.state === 'idle') break;
      if (outcome.state === 'done') {
        console.log(
          `[pdf-worker] lesson ${outcome.lessonId}: ${outcome.pages} pages, ${outcome.emptyPages} without text`,
        );
      } else {
        console.warn(`[pdf-worker] lesson ${outcome.lessonId} failed: ${outcome.error}`);
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    console.error('[pdf-worker] tick failed:', err);
  } finally {
    ticking = false;
  }
}

/** Ask the loop to look for work now, for example right after an upload. */
export function kickPdfWorker(): void {
  if (loopTimer) void tick();
}

/** On unless PDF_WORKER=0. */
export function startPdfWorker(tools: PdfTools = pdfjsTools): boolean {
  if (process.env.PDF_WORKER === '0') return false;
  if (loopTimer) return true;
  activeTools = tools;
  const intervalMs = Math.max(
    1000,
    parseInt(process.env.PDF_WORKER_INTERVAL_MS || '5000', 10) || 5000,
  );
  loopTimer = setInterval(() => void tick(), intervalMs);
  loopTimer.unref?.();
  kickTimer = setTimeout(() => void tick(), 1000);
  kickTimer.unref?.();
  console.log(`[pdf-worker] enabled (every ${intervalMs}ms)`);
  return true;
}

export function stopPdfWorker(): void {
  if (loopTimer) clearInterval(loopTimer);
  if (kickTimer) clearTimeout(kickTimer);
  loopTimer = null;
  kickTimer = null;
}
