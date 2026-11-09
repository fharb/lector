import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StressedWord } from './StressedWord';

const render = (word: string, stressIndex?: number) =>
  renderToStaticMarkup(<StressedWord word={word} stressIndex={stressIndex} />);

describe('StressedWord', () => {
  it('marks the stressed vowel and keeps the rest of the word', () => {
    const html = render('читала', 3);
    expect(html).toContain('>а́<');
    expect(html.startsWith('чит')).toBe(true);
    expect(html.endsWith('ла')).toBe(true);
  });

  it('highlights ё without adding an accent', () => {
    expect(render('ёлка', 0)).toContain('>ё<');
  });

  it('keeps capital letters', () => {
    expect(render('Читала', 3)).toContain('Чит');
  });

  it('shows the plain word without a position or with a position past its end', () => {
    expect(render('читала')).toBe('читала');
    expect(render('дом', 9)).toBe('дом');
  });
});
