'use client';

import type * as Pdfjs from 'pdfjs-dist';

let loader: Promise<typeof Pdfjs> | null = null;

/** pdf.js with one shared module worker. Browser only. */
export function loadPdfjs(): Promise<typeof Pdfjs> {
  loader ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    );
    return pdfjs;
  });
  return loader;
}

export interface OutlineEntry {
  title: string;
  /** 1-based. */
  page: number;
  /** 0 for a top-level bookmark. */
  level?: number;
}

type OutlineNode = Awaited<ReturnType<Pdfjs.PDFDocumentProxy['getOutline']>>[number];

async function pageOf(doc: Pdfjs.PDFDocumentProxy, node: OutlineNode): Promise<number | null> {
  try {
    const dest = typeof node.dest === 'string' ? await doc.getDestination(node.dest) : node.dest;
    const target = dest?.[0];
    if (typeof target === 'number') return target + 1;
    if (target && typeof target === 'object') return (await doc.getPageIndex(target)) + 1;
  } catch {
    /* a broken destination is skipped */
  }
  return null;
}

const LETTER = /\p{L}/gu;
/** Must match MIN_LETTERS in api/src/lib/pdf-worker.ts. */
const MIN_LETTERS = 20;

export interface PdfInspection {
  /** False when the file cannot be opened as a PDF. */
  readable: boolean;
  /** True as soon as one page has text; a scan without OCR has none. */
  hasText: boolean;
  outline: OutlineEntry[];
}

/** Opens the file once: is there text, and the top level of its bookmarks. Reads pages only until one has text. */
export async function inspectPdf(file: File): Promise<PdfInspection> {
  const pdfjs = await loadPdfjs();
  const url = URL.createObjectURL(file);
  const task = pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: true });
  try {
    const doc = await task.promise;
    let hasText = false;
    for (let n = 1; n <= doc.numPages && !hasText; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join('');
      hasText = (text.match(LETTER)?.length ?? 0) >= MIN_LETTERS;
    }
    return { readable: true, hasText, outline: await readOutline(doc) };
  } catch {
    return { readable: false, hasText: false, outline: [] };
  } finally {
    void task.destroy();
    URL.revokeObjectURL(url);
  }
}

/** The bookmarks in reading order, `depth` levels deep; a single root bookmark is skipped. */
export async function readOutline(doc: Pdfjs.PDFDocumentProxy, depth = 1): Promise<OutlineEntry[]> {
  const entries: OutlineEntry[] = [];
  const walk = async (nodes: OutlineNode[], level: number) => {
    for (const node of nodes) {
      const page = await pageOf(doc, node);
      const title = node.title?.trim();
      if (page && title) entries.push({ title, page, level });
      if (level + 1 < depth && node.items?.length) await walk(node.items, level + 1);
    }
  };
  try {
    let outline = (await doc.getOutline()) ?? [];
    while (outline.length === 1 && outline[0].items?.length) outline = outline[0].items;
    await walk(outline, 0);
  } catch {
    /* no usable outline */
  }
  return entries;
}
