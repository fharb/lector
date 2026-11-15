export interface PdfTools {
  /** One string per page, in page order. */
  extractText(file: string): Promise<string[]>;
}

export interface TextItemLike {
  str: string;
  /** PDF text matrix; [4] and [5] are x and y, with y growing upwards. */
  transform: number[];
  height: number;
  hasEOL?: boolean;
}

/** A gap above this many line heights between two lines starts a new paragraph. */
const PARAGRAPH_GAP = 1.6;

/** Page text from pdf.js items: a line break at each end of line, a blank line at a large gap. */
export function pageTextFromItems(items: TextItemLike[]): string {
  const nextWithText: (TextItemLike | undefined)[] = [];
  let next: TextItemLike | undefined;
  for (let index = items.length - 1; index >= 0; index--) {
    nextWithText[index] = next;
    if (items[index].str.trim()) next = items[index];
  }
  return items
    .map((item, index) => {
      const after = nextWithText[index];
      if (!item.hasEOL || !after) return item.str;
      const gap = Math.abs(item.transform[5] - after.transform[5]);
      const lineHeight = Math.max(item.height, after.height, 1);
      return item.str + (gap > PARAGRAPH_GAP * lineHeight ? '\n\n' : '\n');
    })
    .join('');
}

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsModule: Promise<Pdfjs> | null = null;

export const pdfjsTools: PdfTools = {
  async extractText(file) {
    pdfjsModule ??= import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfjs = await pdfjsModule;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await Bun.file(file).arrayBuffer()),
      disableFontFace: true,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    });
    try {
      const doc = await task.promise;
      const pages: string[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        pages.push(
          pageTextFromItems(content.items.filter((item) => 'str' in item) as TextItemLike[]),
        );
        page.cleanup();
      }
      return pages;
    } finally {
      await task.destroy();
    }
  },
};
