import '../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import { BOOKS_DIR } from '../db';
import {
  applyTextResult,
  escapeMarkdown,
  NO_TEXT_ERROR,
  pageIsEmpty,
  pageParagraphs,
  processNextPendingPdf,
  resetStalePdfJobs,
  selectNextPendingPdf,
  textChapters,
  type PendingPdf,
} from './pdf-worker';
import type { PdfTools } from './pdf-tools';

const PAGE_TEXT =
  'Сердце человека — полый мышечный орган.\nОн перекачивает кровь по сосудам.\n\nВторой абзац страницы.';
const FRENCH_TEXT = 'Le cœur est un organe musculaire creux qui pompe le sang.';

function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE lessons (
      userId TEXT NOT NULL DEFAULT 'local',
      id TEXT NOT NULL,
      collectionId TEXT,
      title TEXT NOT NULL DEFAULT '',
      sortOrder INTEGER NOT NULL DEFAULT 0,
      textContent TEXT NOT NULL DEFAULT '',
      wordCount INTEGER DEFAULT 0,
      segmentWords TEXT,
      language TEXT NOT NULL DEFAULT 'ru',
      createdAt TEXT NOT NULL,
      lastReadAt TEXT NOT NULL DEFAULT '',
      sourceType TEXT,
      sourceMeta TEXT,
      pdfStatus TEXT,
      pdfError TEXT,
      PRIMARY KEY (userId, id)
    );
  `);
}

function writePdf(name: string): string {
  const file = path.join(BOOKS_DIR, name);
  fs.mkdirSync(BOOKS_DIR, { recursive: true });
  fs.writeFileSync(file, '%PDF-1.4 test');
  return file;
}

function insertPdfLesson(
  db: Database,
  options: { id?: string; mode?: 'pages' | 'text'; status?: string; outline?: unknown } = {},
): { id: string; file: string } {
  const id = options.id ?? 'pdf-1';
  const file = writePdf(`${id}.pdf`);
  db.prepare(
    `INSERT INTO lessons (userId, id, collectionId, title, language, createdAt, sourceType, sourceMeta, pdfStatus)
     VALUES ('local', ?, 'col-1', 'Анатомия', 'ru', '2026-11-01T00:00:00Z', 'pdf', ?, ?)`,
  ).run(
    id,
    JSON.stringify({ mode: options.mode ?? 'pages', outline: options.outline }),
    options.status ?? 'pending',
  );
  return { id, file };
}

function lesson(db: Database, id = 'pdf-1') {
  return db.prepare("SELECT * FROM lessons WHERE userId = 'local' AND id = ?").get(id) as Record<
    string,
    unknown
  >;
}

function fakeTools(texts: string[] | Error): PdfTools {
  return {
    async extractText() {
      if (texts instanceof Error) throw texts;
      return texts;
    },
  };
}

let db: Database;
beforeEach(() => {
  db = new Database(':memory:');
  createSchema(db);
});
afterEach(() => {
  db.close();
  for (const name of fs.existsSync(BOOKS_DIR) ? fs.readdirSync(BOOKS_DIR) : []) {
    if (name.startsWith('pdf-')) fs.rmSync(path.join(BOOKS_DIR, name), { force: true });
  }
});

describe('pageIsEmpty', () => {
  test('a page with text is not empty, a page with almost no letters is', () => {
    expect(pageIsEmpty(PAGE_TEXT)).toBe(false);
    expect(pageIsEmpty('')).toBe(true);
    expect(pageIsEmpty('  12  \n Fig. 3 ')).toBe(true);
  });
});

describe('pageParagraphs', () => {
  test('joins the lines of a paragraph and keeps paragraph breaks', () => {
    expect(pageParagraphs(PAGE_TEXT)).toEqual([
      'Сердце человека — полый мышечный орган. Он перекачивает кровь по сосудам.',
      'Второй абзац страницы.',
    ]);
  });

  test('joins a word hyphenated at a line end, but not a capitalised next line', () => {
    expect(pageParagraphs('перека-\nчивает и Жан-\nПоль')).toEqual(['перекачивает и Жан- Поль']);
  });

  test('splits ligatures and drops soft hyphens and control characters', () => {
    expect(pageParagraphs('efﬁcace­ment\u0007')).toEqual(['efficacement']);
  });
});

describe('escapeMarkdown', () => {
  test('escapes inline markers and block starts', () => {
    expect(escapeMarkdown('a *b* [c]')).toBe('a \\*b\\* \\[c\\]');
    expect(escapeMarkdown('# Titre')).toBe('\\# Titre');
    expect(escapeMarkdown('1. Liste')).toBe('\\1. Liste');
    expect(escapeMarkdown('Texte normal.')).toBe('Texte normal.');
  });
});

describe('textChapters', () => {
  test('splits by outline entries in page order, with a lead-in before the first', () => {
    expect(
      textChapters(
        [
          { title: 'Глава 2', page: 5 },
          { title: 'Глава 1', page: 3 },
          { title: 'Out of range', page: 99 },
        ],
        8,
        'Книга',
      ),
    ).toEqual([
      { title: 'Книга', firstPage: 1, lastPage: 2 },
      { title: 'Глава 1', firstPage: 3, lastPage: 4 },
      { title: 'Глава 2', firstPage: 5, lastPage: 8 },
    ]);
  });

  test('without an outline, groups ten pages per lesson', () => {
    expect(textChapters([], 23, 'Livre').map((c) => [c.title, c.firstPage, c.lastPage])).toEqual([
      ['Livre (pp. 1–10)', 1, 10],
      ['Livre (pp. 11–20)', 11, 20],
      ['Livre (pp. 21–23)', 21, 23],
    ]);
    expect(textChapters([], 4, 'Livre')).toEqual([{ title: 'Livre', firstPage: 1, lastPage: 4 }]);
  });
});

describe('job queue', () => {
  test('selects the oldest pending PDF and resets interrupted jobs', () => {
    insertPdfLesson(db, { id: 'pdf-a', status: 'processing' });
    insertPdfLesson(db, { id: 'pdf-b', status: 'ready' });
    expect(selectNextPendingPdf(db)).toBeNull();
    expect(resetStalePdfJobs(db)).toBe(1);
    expect(selectNextPendingPdf(db)?.id).toBe('pdf-a');
  });

  test('idle when nothing is pending', async () => {
    expect(await processNextPendingPdf(db, fakeTools([]))).toEqual({ state: 'idle' });
  });
});

describe('pages mode', () => {
  test('stores the page texts and makes the lesson ready', async () => {
    const { file } = insertPdfLesson(db);
    const tools = fakeTools([PAGE_TEXT, FRENCH_TEXT]);

    const outcome = await processNextPendingPdf(db, tools);

    expect(outcome).toEqual({ state: 'done', lessonId: 'pdf-1', pages: 2, emptyPages: 0 });
    const row = lesson(db);
    expect(row.pdfStatus).toBe('ready');
    expect(row.sourceType).toBe('pdf');
    expect(JSON.parse(row.sourceMeta as string)).toMatchObject({ mode: 'pages', pageCount: 2 });
    expect(row.textContent).toContain('полый мышечный орган. Он перекачивает');
    expect(row.wordCount).toBe(25);
    expect(fs.existsSync(file)).toBe(true);
  });

  test('pages without text are noted, and the lesson is still ready', async () => {
    insertPdfLesson(db);
    const outcome = await processNextPendingPdf(db, fakeTools([PAGE_TEXT, '', 'Fig. 2']));
    expect(outcome).toMatchObject({ state: 'done', emptyPages: 2 });
    expect(JSON.parse(lesson(db).sourceMeta as string).emptyPages).toEqual([2, 3]);
    expect(lesson(db).pdfStatus).toBe('ready');
  });

  test('a PDF with no text fails for good, with a message for the reader', async () => {
    insertPdfLesson(db);
    const outcome = await processNextPendingPdf(db, fakeTools(['', ' 3 ']));
    expect(outcome).toEqual({ state: 'failed', lessonId: 'pdf-1', error: NO_TEXT_ERROR });
    expect(lesson(db)).toMatchObject({ pdfStatus: 'failed', pdfError: NO_TEXT_ERROR });
  });

  test('a missing file fails at once', async () => {
    const { file } = insertPdfLesson(db);
    fs.rmSync(file);
    const outcome = await processNextPendingPdf(db, fakeTools([PAGE_TEXT]));
    expect(outcome).toMatchObject({ state: 'failed', error: 'The PDF file is missing on disk' });
  });

  test('a tool error fails the job with its message', async () => {
    insertPdfLesson(db);
    const outcome = await processNextPendingPdf(db, fakeTools(new Error('Unreadable')));
    expect(outcome).toMatchObject({ state: 'failed', error: 'Unreadable' });
    expect(lesson(db)).toMatchObject({ pdfStatus: 'failed', pdfError: 'Unreadable' });
  });
});

describe('text mode', () => {
  test('turns the PDF into lessons by outline and deletes the file', async () => {
    const { file } = insertPdfLesson(db, {
      mode: 'text',
      outline: [
        { title: 'Глава 1', page: 1 },
        { title: 'Глава 2', page: 2 },
      ],
    });

    const outcome = await processNextPendingPdf(db, fakeTools([PAGE_TEXT, FRENCH_TEXT]));

    expect(outcome.state).toBe('done');
    const rows = db
      .prepare(
        "SELECT id, title, sortOrder, textContent, sourceType, pdfStatus FROM lessons WHERE collectionId = 'col-1' ORDER BY sortOrder",
      )
      .all() as Record<string, unknown>[];
    expect(rows.map((row) => [row.title, row.sortOrder, row.sourceType, row.pdfStatus])).toEqual([
      ['Глава 1', 0, null, null],
      ['Глава 2', 1, null, null],
    ]);
    expect(rows[0].id).toBe('pdf-1');
    expect(rows[0].textContent).toBe(pageParagraphs(PAGE_TEXT).join('\n\n'));
    expect(rows[1].textContent).toBe(FRENCH_TEXT);
    expect(fs.existsSync(file)).toBe(false);
  });

  test('drops chapters without text, and refuses a PDF with no text at all', () => {
    const row: PendingPdf = {
      userId: 'local',
      id: 'pdf-1',
      collectionId: 'col-1',
      title: 'Livre',
      language: 'fr',
      sourceMeta: null,
    };
    expect(() => applyTextResult(db, row, { mode: 'text' }, [[], []])).toThrow(/no text/);
  });
});
