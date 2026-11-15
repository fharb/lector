import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';

// Sentence view: one sentence at a time. Translations are stubbed, so the spec needs no AI
// provider.

const COLLECTION = 'E2E Sentence view';
const TS = '2026-01-01T00:00:00.000Z';

async function openLesson(page: Page, textContent: string) {
  const created = await page.request.post(apiUrl('/api/collections'), {
    data: { title: COLLECTION, language: 'af' },
  });
  const { id } = await created.json();
  await page.request.post(apiUrl(`/api/collections/${id}/lessons?language=af`), {
    data: { title: 'Les', textContent },
  });
  const lessons = await (await page.request.get(apiUrl(`/api/collections/${id}/lessons`))).json();
  await page.goto(`/read/${lessons[0].id}`);
}

test.describe('Sentence view', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route('**/api/translate', (route) =>
      route.fulfill({ json: { translation: 'sentence translation' } }),
    );
    await page.route('**/api/translate/gloss', (route) =>
      route.fulfill({ body: 'gloss', contentType: 'text/plain' }),
    );
  });

  test.afterEach(async ({ page }) => {
    const res = await page.request.get(apiUrl('/api/collections?language=af'));
    for (const collection of await res.json()) {
      if (collection.title === COLLECTION) {
        await page.request.delete(apiUrl(`/api/collections/${collection.id}`));
      }
    }
    const vocab = await (await page.request.get(apiUrl('/api/vocab?language=af'))).json();
    for (const entry of vocab) {
      if (String(entry.id).startsWith('sentence-gloss-')) {
        await page.request.delete(apiUrl(`/api/vocab/${entry.id}`));
      }
    }
  });

  test('shows the translations of learning words above or beside the sentence', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const learning = `sinhond${Date.now().toString(36).replace(/\d/g, '')}`;
    await page.request.post(apiUrl('/api/vocab'), {
      data: {
        id: `sentence-gloss-${learning}`,
        text: learning,
        type: 'word',
        sentence: '',
        translation: 'dog',
        state: 'level2',
        stateUpdatedAt: TS,
        reviewCount: 0,
        createdAt: TS,
        pushedToAnki: false,
        language: 'af',
      },
    });
    await openLesson(page, `Die ${learning} blaf hard.`);
    await page.getByTestId('sentence-view-toggle').click();
    const view = page.getByTestId('sentence-view');
    const word = view.getByRole('button', { name: `Look up ${learning}`, exact: true });

    await page.getByTestId('gloss-toggle').click();
    await page.getByTestId('gloss-mode-above').click();
    await expect(word.locator('rt')).toHaveText('dog');

    await page.getByTestId('gloss-toggle').click();
    await page.getByTestId('gloss-mode-side').click();
    await expect(word.locator('rt')).toHaveCount(0);
    await expect(view.getByTestId('sentence-side-glosses')).toContainText(`${learning} dog`);

    // The list sits to the right, and the sentence stays centred.
    const text = await view.getByTestId('sentence-text').boundingBox();
    const side = await view.getByTestId('sentence-side-glosses').boundingBox();
    const panel = await view.boundingBox();
    expect(side!.x).toBeGreaterThan(text!.x + text!.width);
    expect(Math.abs(text!.x + text!.width / 2 - (panel!.x + panel!.width / 2))).toBeLessThan(4);
  });

  test('the controls stay in place for sentences of different length', async ({ page }) => {
    await openLesson(
      page,
      'Kort. Hierdie sin is heelwat langer as die eerste een en het baie meer woorde in.',
    );
    await page.getByTestId('sentence-view-toggle').click();
    const next = page.getByTestId('sentence-next');
    const before = await next.boundingBox();
    await next.click();
    await expect(page.getByTestId('sentence-position')).toHaveText('2 / 2');
    const after = await page.getByTestId('sentence-prev').boundingBox();
    expect(Math.round(after!.y)).toBe(Math.round(before!.y));
  });

  test('steps through the sentences, looks up a word and translates a sentence', async ({
    page,
  }) => {
    await openLesson(
      page,
      'Die kat slaap. Die hond blaf hard!\n\n## Kop\n\nNog **een** sin met `kode`?',
    );
    await page.getByTestId('sentence-view-toggle').click();

    const view = page.getByTestId('sentence-view');
    const text = view.getByTestId('sentence-text');
    const position = view.getByTestId('sentence-position');
    await expect(text).toHaveText('Die kat slaap.');
    await expect(position).toHaveText('1 / 4');
    await expect(view.getByTestId('sentence-prev')).toBeDisabled();

    await view.getByTestId('sentence-next').click();
    await expect(text).toHaveText('Die hond blaf hard!');
    await page.keyboard.press('ArrowRight');
    await expect(text).toHaveText('Kop');
    await page.keyboard.press('ArrowRight');
    await expect(text).toHaveText('Nog een sin met kode?');
    await expect(view.getByTestId('sentence-next')).toBeDisabled();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(text).toHaveText('Die hond blaf hard!');

    const drawer = page.getByTestId('translation-drawer');
    await view.getByRole('button', { name: 'Look up hond', exact: true }).click();
    await expect(drawer).toHaveAttribute('aria-hidden', 'false');
    await expect(drawer.locator('h2')).toContainText('hond');

    await view.getByTestId('sentence-translate').click();
    await expect(drawer).toContainText('sentence translation');
    await expect(drawer.getByTestId('selection-word')).toHaveCount(4);

    // The position survives a reload.
    await page.reload();
    await page.getByTestId('sentence-view-toggle').click();
    await expect(page.getByTestId('sentence-text')).toHaveText('Die hond blaf hard!');

    // The same button, in the same place, goes back to the whole text.
    const toggle = page.getByTestId('sentence-view-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const inSentenceView = await toggle.boundingBox();
    await toggle.click();
    await expect(page.getByTestId('sentence-view')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const inWholeText = await toggle.boundingBox();
    expect(Math.round(inWholeText!.x)).toBe(Math.round(inSentenceView!.x));
  });

  test('a lesson without text shows an empty state', async ({ page }) => {
    await openLesson(page, '```\nonly code\n```');
    await page.getByTestId('sentence-view-toggle').click();
    await expect(page.getByTestId('sentence-view')).toContainText(
      'This lesson has no sentences to show.',
    );
    await expect(page.getByTestId('sentence-position')).toHaveCount(0);
  });
});
