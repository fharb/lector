import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { BOOKS_DIR } from '../db';

const PDF_MAGIC = '%PDF-';

export type PdfImportMode = 'pages' | 'text';

export function parsePdfImportMode(value: unknown): PdfImportMode | null {
  if (value === undefined || value === null || value === '') return 'pages';
  return value === 'pages' || value === 'text' ? value : null;
}

/** True when the bytes open with the PDF header. Readers accept junk before it, so look in the first KiB. */
export function looksLikePdf(head: Uint8Array): boolean {
  const text = new TextDecoder('latin1').decode(head.subarray(0, 1024));
  return text.includes(PDF_MAGIC);
}

/** Derived from the lesson id, never read from the DB, so the data folder can move. */
export function pdfPathForLesson(lessonId: string): string {
  if (!lessonId || path.basename(lessonId) !== lessonId || lessonId.includes('..')) {
    throw new Error(`Invalid lesson id for a PDF file: ${JSON.stringify(lessonId)}`);
  }
  return path.join(BOOKS_DIR, `${lessonId}.pdf`);
}

export async function savePdfFile(destPath: string, data: Blob): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.${randomUUID()}.tmp`;
  await Bun.write(tmpPath, data);
  fs.renameSync(tmpPath, destPath);
}

export function deletePdfForLesson(lessonId: string): void {
  try {
    fs.unlinkSync(pdfPathForLesson(lessonId));
  } catch {
    /* already gone, or not a valid id */
  }
}

export interface OutlineEntry {
  title: string;
  /** 1-based page number. */
  page: number;
}

const MAX_OUTLINE_ENTRIES = 2000;

/** The client's `outline` field: JSON `[{ title, page }]`. Bad entries are dropped. */
export function parseOutline(value: unknown): OutlineEntry[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const entries: OutlineEntry[] = [];
  for (const item of raw.slice(0, MAX_OUTLINE_ENTRIES)) {
    if (!item || typeof item !== 'object') continue;
    const { title, page } = item as { title?: unknown; page?: unknown };
    if (typeof title !== 'string' || !title.trim()) continue;
    if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1) continue;
    entries.push({ title: title.trim().slice(0, 300), page });
  }
  return entries;
}
