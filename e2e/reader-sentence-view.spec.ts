import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';

// Sentence view: one sentence at a time. Translations are stubbed, so the spec needs no AI
// provider.

const COLLECTION = 'E2E Sentence view';

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
