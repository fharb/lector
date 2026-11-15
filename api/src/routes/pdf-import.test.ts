import '../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { BOOKS_DIR, db } from '../db';
import { makeEntitlements, parsePlanLimitOverrides, type PlanLimits } from '../lib/entitlements';
import { parseEpub } from '../lib/epub-parser';
import { deletePdfForLesson, looksLikePdf, parseOutline, pdfPathForLesson } from '../lib/pdf-files';
import { makeImportRoutes } from './import';
import lessons from './lessons';
import collections from './collections';

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n' + 'x'.repeat(91));

function engine(overrides: Partial<PlanLimits> = {}) {
  const defaults = parsePlanLimitOverrides(undefined);
  return makeEntitlements({
    enforced: true,
    freeTierEnabled: true,
    exemptEmails: new Set(),
    prices: [],
    planLimits: {
      ...defaults,
      free: {
        ...defaults.free,
        maxCollections: 10,
        maxLessons: 10,
        maxCollectionMetadataBytes: 10_000,
        ...overrides,
      },
    },
    resolveEmail: () => null,
    isByok: () => false,
    compedPlan: () => null,
    now: () => new Date('2026-11-13T12:00:00Z'),
  });
}

function form(
  fields: Partial<{
    name: string;
    bytes: Uint8Array<ArrayBuffer>;
    mode: string;
    outline: string;
    title: string;
  }> = {},
) {
  const data = new FormData();
  data.append('file', new File([fields.bytes ?? PDF_BYTES], fields.name ?? 'Anatomie.pdf'));
  data.append('language', 'fr');
  if (fields.mode !== undefined) data.append('mode', fields.mode);
  if (fields.outline !== undefined) data.append('outline', fields.outline);
  if (fields.title !== undefined) data.append('title', fields.title);
  return data;
}

function reset() {
  for (const row of db
    .prepare("SELECT id FROM lessons WHERE userId = 'local' AND sourceType = 'pdf'")
    .all() as { id: string }[]) {
    fs.rmSync(pdfPathForLesson(row.id), { force: true });
  }
  db.prepare("DELETE FROM lessons WHERE userId = 'local'").run();
  db.prepare("DELETE FROM collections WHERE userId = 'local'").run();
  db.prepare("DELETE FROM usage_counters WHERE userId = 'local'").run();
}

beforeEach(reset);
afterEach(reset);

async function importPdf(data = form(), limits?: Partial<PlanLimits>) {
  const app = makeImportRoutes({ engine: engine(limits), parse: parseEpub });
  return app.request('/pdf', { method: 'POST', body: data });
}

function lessonRow(id: string) {
  return db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as Record<string, unknown>;
}

describe('POST /api/import/pdf', () => {
  test('stores the file and creates a pending page lesson', async () => {
    const response = await importPdf();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ title: 'Anatomie', mode: 'pages', pdfStatus: 'pending' });

    const row = lessonRow(body.lessonId);
    expect(row).toMatchObject({
      sourceType: 'pdf',
      pdfStatus: 'pending',
      language: 'fr',
      collectionId: body.collectionId,
    });
    expect(JSON.parse(row.sourceMeta as string)).toEqual({
      mode: 'pages',
      originalName: 'Anatomie.pdf',
    });
    expect(new Uint8Array(fs.readFileSync(path.join(BOOKS_DIR, `${body.lessonId}.pdf`)))).toEqual(
      PDF_BYTES,
    );
    expect(
      db.prepare('SELECT author FROM collections WHERE id = ?').get(body.collectionId),
    ).toEqual({ author: 'PDF import' });
  });

  test('text mode keeps the outline for the worker', async () => {
    const response = await importPdf(
      form({
        mode: 'text',
        title: 'Cours',
        outline: JSON.stringify([
          { title: 'Chapitre 1', page: 1 },
          { title: '', page: 2 },
        ]),
      }),
    );
    const body = await response.json();
    expect(body.title).toBe('Cours');
    expect(JSON.parse(lessonRow(body.lessonId).sourceMeta as string)).toEqual({
      mode: 'text',
      originalName: 'Anatomie.pdf',
      outline: [{ title: 'Chapitre 1', page: 1 }],
    });
  });

  test('rejects a missing file, a wrong extension, a fake PDF and a bad mode', async () => {
    const noFile = new FormData();
    noFile.append('language', 'fr');
    const app = makeImportRoutes({ engine: engine(), parse: parseEpub });
    expect((await app.request('/pdf', { method: 'POST', body: noFile })).status).toBe(400);

    const wrongName = await importPdf(form({ name: 'notes.txt' }));
    expect(wrongName.status).toBe(400);
    expect(await wrongName.json()).toEqual({ error: 'Choose a .pdf file.' });

    const fake = await importPdf(form({ bytes: new TextEncoder().encode('hello world') }));
    expect(fake.status).toBe(400);
    expect(await fake.json()).toEqual({ error: 'The file is not a PDF.' });

    const badMode = await importPdf(form({ mode: 'images' }));
    expect(badMode.status).toBe(400);

    expect(db.prepare("SELECT COUNT(*) AS n FROM lessons WHERE userId = 'local'").get()).toEqual({
      n: 0,
    });
    expect(fs.readdirSync(BOOKS_DIR).filter((name) => name.endsWith('.pdf'))).toEqual([]);
  });

  test('a plan limit refuses the import and removes the stored file', async () => {
    const response = await importPdf(form(), { maxLessons: 0 });
    expect(response.status).toBe(429);
    expect(fs.readdirSync(BOOKS_DIR).filter((name) => name.endsWith('.pdf'))).toEqual([]);
  });
});

async function seedReadyPdf(): Promise<{
  lessonId: string;
  collectionId: string;
  pdfPath: string;
}> {
  const body = await (await importPdf()).json();
  db.prepare("UPDATE lessons SET pdfStatus = 'ready' WHERE id = ?").run(body.lessonId);
  return { ...body, pdfPath: pdfPathForLesson(body.lessonId) };
}

describe('GET /api/lessons/:id/pdf', () => {
  test('serves the whole file and byte ranges', async () => {
    const { lessonId } = await seedReadyPdf();

    const full = await lessons.request(`/${lessonId}/pdf?language=fr`);
    expect(full.status).toBe(200);
    expect(full.headers.get('Content-Type')).toBe('application/pdf');
    expect(full.headers.get('Accept-Ranges')).toBe('bytes');
    expect(full.headers.get('Access-Control-Expose-Headers')).toContain('Content-Range');
    expect((await full.arrayBuffer()).byteLength).toBe(100);

    const part = await lessons.request(`/${lessonId}/pdf?language=fr`, {
      headers: { Range: 'bytes=0-4' },
    });
    expect(part.status).toBe(206);
    expect(part.headers.get('Content-Range')).toBe('bytes 0-4/100');
    expect(new TextDecoder().decode(await part.arrayBuffer())).toBe('%PDF-');

    const outside = await lessons.request(`/${lessonId}/pdf?language=fr`, {
      headers: { Range: 'bytes=500-' },
    });
    expect(outside.status).toBe(416);
  });

  test('404 for a lesson without a PDF, in another language, or with the file gone', async () => {
    const { lessonId, pdfPath } = await seedReadyPdf();
    expect((await lessons.request(`/${lessonId}/pdf?language=ru`)).status).toBe(404);
    fs.rmSync(pdfPath);
    expect((await lessons.request(`/${lessonId}/pdf?language=fr`)).status).toBe(404);
    expect((await lessons.request('/missing/pdf?language=fr')).status).toBe(404);
  });
});

describe('POST /api/lessons/:id/retry-pdf', () => {
  test('re-queues only a failed PDF job', async () => {
    const { lessonId } = await seedReadyPdf();
    expect(
      (await lessons.request(`/${lessonId}/retry-pdf?language=fr`, { method: 'POST' })).status,
    ).toBe(404);

    db.prepare("UPDATE lessons SET pdfStatus = 'failed', pdfError = 'boom' WHERE id = ?").run(
      lessonId,
    );
    const response = await lessons.request(`/${lessonId}/retry-pdf?language=fr`, {
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(lessonRow(lessonId)).toMatchObject({ pdfStatus: 'pending', pdfError: null });
  });
});

describe('deleting PDF lessons', () => {
  test('deleting the lesson removes the file', async () => {
    const { lessonId, pdfPath } = await seedReadyPdf();
    const response = await lessons.request(`/${lessonId}?language=fr`, { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(fs.existsSync(pdfPath)).toBe(false);
  });

  test('deleting the collection removes the file', async () => {
    const { collectionId, pdfPath } = await seedReadyPdf();
    const response = await collections.request(`/${collectionId}?language=fr`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);
    expect(fs.existsSync(pdfPath)).toBe(false);
  });

  test('the lesson listing carries the PDF status', async () => {
    const { collectionId } = await seedReadyPdf();
    const response = await collections.request(`/${collectionId}/lessons?language=fr`);
    const [row] = await response.json();
    expect(row).toMatchObject({ sourceType: 'pdf', pdfStatus: 'ready', pdfError: null });
  });
});

describe('pdf-files helpers', () => {
  test('looksLikePdf finds the header near the start', () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('\n\n%PDF-1.7'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('PK\u0003\u0004'))).toBe(false);
  });

  test('the file comes from the lesson id, and odd ids are refused', () => {
    expect(pdfPathForLesson('abc')).toBe(path.join(BOOKS_DIR, 'abc.pdf'));
    expect(() => pdfPathForLesson('../outside')).toThrow(/Invalid lesson id/);
    expect(() => pdfPathForLesson('')).toThrow(/Invalid lesson id/);
    const outside = path.join(BOOKS_DIR, '..', 'outside.pdf');
    fs.writeFileSync(outside, 'keep');
    deletePdfForLesson('../outside');
    expect(fs.existsSync(outside)).toBe(true);
    fs.rmSync(outside);
  });

  test('parseOutline keeps valid entries only', () => {
    expect(parseOutline('not json')).toEqual([]);
    expect(parseOutline(JSON.stringify({ title: 'x', page: 1 }))).toEqual([]);
    expect(
      parseOutline(
        JSON.stringify([
          { title: ' Intro ', page: 1 },
          { title: 'Zero', page: 0 },
          { title: 'Float', page: 1.5 },
          { page: 3 },
        ]),
      ),
    ).toEqual([{ title: 'Intro', page: 1 }]);
  });
});
