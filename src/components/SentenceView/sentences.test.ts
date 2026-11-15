import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '@/lib/languages';
import { lessonSentences } from './sentences';

const fr = LANGUAGES.fr;

describe('lessonSentences', () => {
  it('splits paragraphs into sentences, in order', () => {
    expect(lessonSentences('Le cœur bat. Il pompe le sang !\n\nUn autre paragraphe ?', fr)).toEqual(
      ['Le cœur bat.', 'Il pompe le sang !', 'Un autre paragraphe ?'],
    );
  });

  it('drops markup but keeps the words of emphasis and links', () => {
    expect(lessonSentences('# Titre\n\nUn **mot** et un [lien](https://x.fr).', fr)).toEqual([
      'Titre',
      'Un mot et un lien.',
    ]);
  });

  it('leaves code blocks out and joins the lines of a paragraph', () => {
    expect(lessonSentences('Une phrase\nsur deux lignes.\n\n```\ncode();\n```', fr)).toEqual([
      'Une phrase sur deux lignes.',
    ]);
  });

  it('keeps list items and returns nothing for an empty lesson', () => {
    expect(lessonSentences('- Premier.\n- Second.', fr)).toEqual(['Premier.', 'Second.']);
    expect(lessonSentences('', fr)).toEqual([]);
  });
});
