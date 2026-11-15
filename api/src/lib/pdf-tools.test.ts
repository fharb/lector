import '../test-guard';
import { describe, expect, test } from 'bun:test';
import path from 'path';
import { pageTextFromItems, pdfjsTools, type TextItemLike } from './pdf-tools';

const FIXTURE = path.join(import.meta.dir, '..', '..', '..', 'e2e', 'fixtures', 'sample-ru-fr.pdf');

function item(str: string, y: number, hasEOL = true, height = 12): TextItemLike {
  return { str, transform: [height, 0, 0, height, 72, y], height, hasEOL };
}

describe('pageTextFromItems', () => {
  test('a line break at each end of line, a blank line at a large gap', () => {
    expect(
      pageTextFromItems([
        item('Первая строка', 700),
        item('вторая строка', 686),
        item('Новый абзац', 640),
      ]),
    ).toBe('Первая строка\nвторая строка\n\nНовый абзац');
  });

  test('items on one line join without a break', () => {
    expect(pageTextFromItems([item('Le ', 700, false), item('cœur', 700)])).toBe('Le cœur');
  });

  test('an empty page gives an empty string', () => {
    expect(pageTextFromItems([])).toBe('');
  });
});

describe('pdfjsTools', () => {
  test('reads the text of each page', async () => {
    const pages = await pdfjsTools.extractText(FIXTURE);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('Сердце — полый мышечный орган');
    expect(pages[1]).toContain('Le cœur est un organe musculaire creux.');
  });
});
