import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch, language } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  language: { code: 'af' },
}));

vi.mock('./api-base', () => ({ apiFetch }));
vi.mock('./data-layer', async () => {
  const { LANGUAGES } = await import('./languages');
  return {
    getActiveLanguage: () => language.code,
    getActivePack: () => LANGUAGES[language.code as keyof typeof LANGUAGES],
  };
});

import {
  enrichWord,
  forgetRememberedAnswers,
  streamWordGloss,
  translatePhrase,
  translateWord,
} from './claude';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const text = (body: string) => new Response(body, { status: 200 });
const failure = () => new Response(JSON.stringify({ error: 'down' }), { status: 500 });

beforeEach(() => {
  forgetRememberedAnswers();
  apiFetch.mockReset();
  language.code = 'af';
});

describe('remembered AI answers', () => {
  it('answers a second quick translation of the same word without a request', async () => {
    apiFetch.mockResolvedValueOnce(text('dog'));
    await streamWordGloss('hond', 'Die hond blaf.', () => {});

    const onDelta = vi.fn();
    expect(await streamWordGloss('Hond', 'Ek sien die hond.', onDelta)).toBe('dog');
    expect(onDelta).toHaveBeenCalledWith('dog');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('treats a stressed Russian spelling as the same word', async () => {
    language.code = 'ru';
    apiFetch.mockResolvedValueOnce(text('Moscow'));
    await streamWordGloss('Москва', '', () => {});
    expect(await streamWordGloss('москва́', '', () => {})).toBe('Moscow');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps answers apart by language', async () => {
    apiFetch.mockResolvedValueOnce(text('house')).mockResolvedValueOnce(text('home'));
    await streamWordGloss('huis', '', () => {});
    language.code = 'nl';
    expect(await streamWordGloss('huis', '', () => {})).toBe('home');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('asks again after a failed or empty answer', async () => {
    apiFetch
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(text('  '))
      .mockResolvedValueOnce(text('dog'));
    await expect(streamWordGloss('hond', '', () => {})).rejects.toThrow();
    await expect(streamWordGloss('hond', '', () => {})).rejects.toThrow();
    expect(await streamWordGloss('hond', '', () => {})).toBe('dog');
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it('remembers a translation in context per sentence', async () => {
    apiFetch
      .mockResolvedValueOnce(json({ translation: 'bank (money)' }))
      .mockResolvedValueOnce(json({ translation: 'bench' }));
    await translateWord('bank', 'Ek gaan bank toe.');
    expect((await translateWord('bank', 'Ek gaan bank toe.')).translation).toBe('bank (money)');
    expect((await translateWord('bank', 'Sit op die bank.')).translation).toBe('bench');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('asks again and replaces the answer when asked for a fresh one', async () => {
    apiFetch
      .mockResolvedValueOnce(json({ translation: 'wrong' }))
      .mockResolvedValueOnce(json({ translation: 'right' }));
    await translateWord('woord', 'Een woord.');
    expect((await translateWord('woord', 'Een woord.', { fresh: true })).translation).toBe('right');
    expect((await translateWord('woord', 'Een woord.')).translation).toBe('right');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it('makes one request when the same word is asked twice at once', async () => {
    apiFetch.mockResolvedValueOnce(json({ translation: 'cat' }));
    const [first, second] = await Promise.all([
      translateWord('kat', 'Die kat.'),
      translateWord('kat', 'Die kat.'),
    ]);
    expect(first.translation).toBe('cat');
    expect(second.translation).toBe('cat');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('remembers phrases and enriched entries', async () => {
    apiFetch
      .mockResolvedValueOnce(json({ translation: 'good morning' }))
      .mockResolvedValueOnce(json({ translation: 'dog', senses: [] }));
    await translatePhrase('goeie more', 'Goeie more!');
    await translatePhrase('goeie more', 'Goeie more!');
    await enrichWord('hond', '');
    await enrichWord('hond', 'Die hond.');
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
