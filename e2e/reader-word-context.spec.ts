import { expect, test } from '@playwright/test';
import { apiUrl } from './api';

const COLLECTION = 'E2E Word Context';

test.describe('Word context in the reader', () => {
  test.afterEach(async ({ page }) => {
    const res = await page.request.get(apiUrl('/api/collections?language=af'));
    for (const collection of await res.json()) {
      if (collection.title === COLLECTION) {
        await page.request.delete(apiUrl(`/api/collections/${collection.id}`));
      }
    }
  });

  test('uses the sentence of the clicked word when the word repeats', async ({ page }) => {
    const created = await page.request.post(apiUrl('/api/collections'), {
      data: { title: COLLECTION, language: 'af' },
    });
    const { id } = await created.json();
    await page.request.post(apiUrl(`/api/collections/${id}/lessons?language=af`), {
      data: { title: 'Les', textContent: 'Ek sien die hond. Hy sien die kat.' },
    });
    const lessons = await (await page.request.get(apiUrl(`/api/collections/${id}/lessons`))).json();

    await page.goto(`/read/${lessons[0].id}`);
    await page.getByTestId('reader-word').filter({ hasText: /^die$/ }).nth(1).click();

    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer).toContainText('Hy sien die kat.');
    await expect(drawer).not.toContainText('Ek sien die hond.');
  });
});
