// Generates e2e/fixtures/sample-ru-fr.pdf: two digital pages (Russian with a
// hyphenated line end and a table, then French) for the PDF import specs,
// e2e/fixtures/with-outline.pdf: the same pages with bookmarks, and
// e2e/fixtures/no-text.pdf: one page with a drawing and no text, like a scan.
// Helvetica is referenced, not embedded. A ToUnicode map makes the text extractable.
//
// Regenerate with: node e2e/fixtures/build-pdf-fixture.mjs
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));

const pages = [
  [
    { x: 72, y: 780, size: 16, text: 'Сердце человека' },
    { x: 72, y: 750, size: 12, text: 'Сердце — полый мышечный орган, который перека-' },
    { x: 72, y: 735, size: 12, text: 'чивает кровь по сосудам. Оно бьётся без остановки.' },
    { x: 72, y: 690, size: 12, text: 'Орган' },
    { x: 260, y: 690, size: 12, text: 'Масса' },
    { x: 72, y: 672, size: 12, text: 'Сердце' },
    { x: 260, y: 672, size: 12, text: '300 г' },
    { x: 72, y: 654, size: 12, text: 'Печень' },
    { x: 260, y: 654, size: 12, text: '1500 г' },
  ],
  [
    { x: 72, y: 780, size: 16, text: 'Le cœur' },
    { x: 72, y: 750, size: 12, text: 'Le cœur est un organe musculaire creux.' },
    { x: 72, y: 735, size: 12, text: 'Il pompe le sang dans tout le corps.' },
  ],
];

const codes = new Map();
let next = 128;
for (const line of pages.flat()) {
  for (const ch of line.text) {
    const cp = ch.codePointAt(0);
    if (cp >= 32 && cp < 127) codes.set(ch, cp);
    else if (!codes.has(ch)) codes.set(ch, next++);
  }
}
if (next > 256) throw new Error('Too many distinct characters for one simple font');

const hex = (n, width = 2) => n.toString(16).toUpperCase().padStart(width, '0');
const encode = (text) => [...text].map((ch) => hex(codes.get(ch))).join('');

const differences = [...codes]
  .filter(([, code]) => code >= 128)
  .sort((a, b) => a[1] - b[1])
  .map(([ch, code]) => `${code} /uni${hex(ch.codePointAt(0), 4)}`)
  .join(' ');

const bfchar = [...codes]
  .sort((a, b) => a[1] - b[1])
  .map(([ch, code]) => `<${hex(code)}> <${hex(ch.codePointAt(0), 4)}>`);
const toUnicode = [
  '/CIDInit /ProcSet findresource begin',
  '12 dict begin',
  'begincmap',
  '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
  '/CMapName /Lector-UCS def',
  '/CMapType 2 def',
  '1 begincodespacerange <00> <FF> endcodespacerange',
  ...Array.from({ length: Math.ceil(bfchar.length / 100) }, (_, i) => {
    const chunk = bfchar.slice(i * 100, i * 100 + 100);
    return `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar`;
  }),
  'endcmap',
  'CMapName currentdict /CMap defineresource pop',
  'end',
  'end',
].join('\n');

/** `outline`: top-level bookmarks `{ title, page, children? }`, ASCII titles, 1-based pages. */
function buildSample(fileName, outline = []) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalog = add(null);
  const pagesObj = add(null);
  const cmap = add(
    `<< /Length ${Buffer.byteLength(toUnicode)} >>\nstream\n${toUnicode}\nendstream`,
  );
  const font = add(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 255 ` +
      `/Widths [${Array(224).fill(500).join(' ')}] ` +
      `/Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [${differences}] >> ` +
      `/ToUnicode ${cmap} 0 R >>`,
  );

  const pageIds = pages.map((lines) => {
    const content = lines
      .map((l) => `BT /F1 ${l.size} Tf 1 0 0 1 ${l.x} ${l.y} Tm <${encode(l.text)}> Tj ET`)
      .join('\n');
    const stream = add(
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
    return add(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`,
    );
  });

  // Each level is a linked list: Parent, Prev/Next, First/Last, Count.
  const addOutlineLevel = (entries, parent) => {
    const ids = entries.map(() => add(null));
    entries.forEach((entry, i) => {
      const kids = entry.children?.length ? addOutlineLevel(entry.children, ids[i]) : null;
      objects[ids[i] - 1] =
        `<< /Title (${entry.title}) /Parent ${parent} 0 R ` +
        (i > 0 ? `/Prev ${ids[i - 1]} 0 R ` : '') +
        (i < ids.length - 1 ? `/Next ${ids[i + 1]} 0 R ` : '') +
        (kids ? `/First ${kids[0]} 0 R /Last ${kids.at(-1)} 0 R /Count ${kids.length} ` : '') +
        `/Dest [${pageIds[entry.page - 1]} 0 R /Fit] >>`;
    });
    return ids;
  };
  let outlineRoot = null;
  if (outline.length > 0) {
    outlineRoot = add(null);
    const top = addOutlineLevel(outline, outlineRoot);
    objects[outlineRoot - 1] =
      `<< /Type /Outlines /First ${top[0]} 0 R /Last ${top.at(-1)} 0 R /Count ${top.length} >>`;
  }

  objects[catalog - 1] =
    `<< /Type /Catalog /Pages ${pagesObj} 0 R` +
    (outlineRoot ? ` /Outlines ${outlineRoot} 0 R` : '') +
    ' >>';
  objects[pagesObj - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  writeFileSync(join(here, fileName), Buffer.from(pdf, 'latin1'));
  console.log(`Wrote ${fileName} (${Buffer.byteLength(pdf, 'latin1')} bytes)`);
}

buildSample('sample-ru-fr.pdf');
buildSample('with-outline.pdf', [
  { title: 'Part one: the heart', page: 1, children: [{ title: 'Table of masses', page: 1 }] },
  { title: 'Part two: le coeur', page: 2 },
]);

const drawing = '0.5 g 72 500 300 200 re f';
const scanObjects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>',
  `<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`,
];
let scan = '%PDF-1.4\n';
const scanOffsets = [];
scanObjects.forEach((body, index) => {
  scanOffsets.push(scan.length);
  scan += `${index + 1} 0 obj\n${body}\nendobj\n`;
});
const scanXref = scan.length;
scan += `xref\n0 ${scanObjects.length + 1}\n0000000000 65535 f \n`;
scan += scanOffsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
scan += `trailer\n<< /Size ${scanObjects.length + 1} /Root 1 0 R >>\nstartxref\n${scanXref}\n%%EOF\n`;
writeFileSync(join(here, 'no-text.pdf'), scan, 'latin1');
console.log(`Wrote no-text.pdf (${scan.length} bytes)`);
