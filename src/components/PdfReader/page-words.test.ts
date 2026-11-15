import { describe, expect, it } from 'vitest';
import { getLanguageConfig } from '@/lib/languages';
import { layoutPage, toPageItems, type PdfTextItem } from './page-words';

describe('toPageItems', () => {
  const viewport = [1, 0, 0, -1, 0, 800];

  it('flips PDF space to top-left page coordinates', () => {
    expect(
      toPageItems([{ str: 'Cœur', transform: [12, 0, 0, 12, 50, 700], width: 30 }], viewport),
    ).toEqual([{ str: 'Cœur', x: 50, y: 100 - 12 * 0.8, width: 30, height: 12 }]);
  });

  it('uses the font ascent and skips rotated text and marked-content entries', () => {
    const items = toPageItems(
      [
        { str: 'a', transform: [10, 0, 0, 10, 0, 0], width: 5, fontName: 'f1' },
        { str: 'rotated', transform: [0, 10, -10, 0, 0, 0], width: 5 },
        { type: 'beginMarkedContent' },
      ],
      viewport,
      (font) => (font === 'f1' ? 0.5 : 0.8),
    );
    expect(items).toEqual([{ str: 'a', x: 0, y: 795, width: 5, height: 10 }]);
  });
});

const ru = getLanguageConfig('ru');
const fr = getLanguageConfig('fr');
const he = getLanguageConfig('he');
const PAGE = { width: 600, height: 800 };
const H = 10;

/** One item per line, as monospace text at 6 units per character. */
function line(str: string, x: number, y: number): PdfTextItem {
  return { str, x, y, width: str.length * 6, height: H };
}

describe('layoutPage', () => {
  it('returns nothing for a page without text', () => {
    expect(layoutPage([], PAGE, fr)).toEqual({ words: [], text: '' });
    expect(layoutPage([line('   ', 10, 10)], PAGE, fr)).toEqual({ words: [], text: '' });
  });

  it('joins lines into a paragraph and gives each word its sentence', () => {
    const layout = layoutPage(
      [line('Le cœur pompe le sang. Il bat', 50, 100), line('sans arrêt.', 50, 112)],
      PAGE,
      fr,
    );
    expect(layout.text).toBe('Le cœur pompe le sang. Il bat sans arrêt.');
    const bat = layout.words.find((w) => w.text === 'bat')!;
    expect(bat.sentence).toBe('Il bat sans arrêt.');
    expect(layout.words.find((w) => w.text === 'cœur')!.sentence).toBe('Le cœur pompe le sang.');
  });

  it('places word boxes inside their item, as page fractions', () => {
    const layout = layoutPage([line('Le cœur', 60, 100)], PAGE, fr);
    const [le, coeur] = layout.words;
    expect(le.rects).toEqual([{ x: 60 / 600, y: 100 / 800, width: 12 / 600, height: H / 800 }]);
    expect(coeur.rects[0].x).toBeCloseTo((60 + 18) / 600);
    expect(coeur.rects[0].width).toBeCloseTo(24 / 600);
  });

  it('joins a word hyphenated at a line end into one word with two boxes', () => {
    const layout = layoutPage(
      [line('Сердце перека-', 50, 100), line('чивает кровь.', 50, 112)],
      PAGE,
      ru,
    );
    expect(layout.text).toBe('Сердце перекачивает кровь.');
    const word = layout.words.find((w) => w.text === 'перекачивает')!;
    expect(word.rects).toHaveLength(2);
    expect(word.rects[0].y).toBeCloseTo(100 / 800);
    expect(word.rects[1].y).toBeCloseTo(112 / 800);
    expect(word.sentence).toBe('Сердце перекачивает кровь.');
  });

  it('keeps the hyphen when the next line starts with a capital', () => {
    const layout = layoutPage([line('Жан-', 50, 100), line('Поль пришёл.', 50, 112)], PAGE, ru);
    expect(layout.text).toBe('Жан- Поль пришёл.');
  });

  it('splits ligatures and drops soft hyphens', () => {
    const layout = layoutPage([line('Une efﬁcace mé­thode.', 50, 100)], PAGE, fr);
    expect(layout.words.map((w) => w.text)).toEqual(['Une', 'efficace', 'méthode']);
  });

  it('inserts a space between items that do not touch, and none between items that do', () => {
    const layout = layoutPage(
      [
        { str: 'mus', x: 50, y: 100, width: 18, height: H },
        { str: 'cle', x: 68, y: 100, width: 18, height: H },
        { str: 'creux', x: 92, y: 100, width: 30, height: H },
      ],
      PAGE,
      fr,
    );
    expect(layout.text).toBe('muscle creux');
    expect(layout.words[0].rects).toHaveLength(2);
  });

  it('reads two columns top to bottom, the left column first', () => {
    const items: PdfTextItem[] = [];
    for (let i = 0; i < 4; i++) {
      items.push(line(`Gauche ligne numéro ${i + 1} du texte`, 40, 100 + i * 12));
      items.push(line(`Droite ligne numéro ${i + 1} du texte`, 330, 100 + i * 12));
    }
    items.push(line('Titre qui couvre toute la largeur de la page imprimée ici', 60, 70));
    const layout = layoutPage(items, PAGE, fr);
    const paragraphs = layout.text.split('\n\n');
    expect(paragraphs[0]).toBe('Titre qui couvre toute la largeur de la page imprimée ici');
    expect(paragraphs[1]).toContain('Gauche ligne numéro 1 du texte Gauche ligne numéro 2');
    expect(paragraphs[1]).toContain('Gauche ligne numéro 4 du texte');
    expect(paragraphs[2]).toContain('Droite ligne numéro 1');
    expect(paragraphs[1]).not.toContain('Droite');
  });

  it('treats a line with separate cells as a table row, the row being the sentence', () => {
    const layout = layoutPage(
      [
        line('Organe', 50, 100),
        line('Poids', 250, 100),
        line('Fonction', 400, 100),
        line('Cœur', 50, 130),
        line('300 g', 250, 130),
        line('Pompe', 400, 130),
      ],
      PAGE,
      fr,
    );
    expect(layout.text.split('\n\n')).toEqual([
      'Organe | Poids | Fonction',
      'Cœur | 300 g | Pompe',
    ]);
    expect(layout.words.find((w) => w.text === 'Pompe')!.sentence).toBe('Cœur | 300 g | Pompe');
  });

  it('starts a new paragraph after a large vertical gap', () => {
    const layout = layoutPage([line('Premier.', 50, 100), line('Second.', 50, 140)], PAGE, fr);
    expect(layout.text).toBe('Premier.\n\nSecond.');
  });

  it('orders right-to-left items from right to left', () => {
    const layout = layoutPage(
      [
        { str: 'עולם', x: 100, y: 100, width: 24, height: H },
        { str: 'שלום', x: 130, y: 100, width: 24, height: H },
      ],
      PAGE,
      he,
    );
    expect(layout.words.map((w) => w.text)).toEqual(['שלום', 'עולם']);
  });

  it('uses the measure for the position of a word inside an item', () => {
    const layout = layoutPage([line('ab cd', 0, 0)], PAGE, fr, {
      measure: (text) => [...text].reduce((sum, ch) => sum + (ch === 'a' ? 3 : 1), 0),
    });
    const cd = layout.words[1];
    expect(cd.rects[0].x).toBeCloseTo(((5 / 7) * 30) / 600);
  });
});
