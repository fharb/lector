import { expect, test } from '@playwright/test';
import { apiUrl } from './api';

const COLLECTION = 'E2E AI Memory';

test.describe('AI answers within a reading session', () => {
  test.afterEach(async ({ page }) => {
    const res = await page.request.get(apiUrl('/api/collections?language=af'));
    for (const collection of await res.json()) {
      if (collection.title === COLLECTION) {
        await page.request.delete(apiUrl(`/api/collections/${collection.id}`));
      }
    }
  });

  test('a second click on the same word shows the translation without a new request', async ({
    page,
  }) => {
    const word = `geheue${Date.now().toString(36).replace(/\d/g, '')}`;
    let glossRequests = 0;
    await page.route('**/api/dictionary/lookup*', (route) =>
      route.fulfill({ json: { entry: null } }),
    );
    await page.route('**/api/translate/gloss', (route) => {
      glossRequests += 1;
      return route.fulfill({ status: 200, contentType: 'text/plain', body: 'memory' });
    });

    const created = await page.request.post(apiUrl('/api/collections'), {
      data: { title: COLLECTION, language: 'af' },
    });
    const { id } = await created.json();
    await page.request.post(apiUrl(`/api/collections/${id}/lessons?language=af`), {
      data: { title: 'Les', textContent: `Eers ${word}.\n\nDan weer ${word}.` },
    });
    const lessons = await (await page.request.get(apiUrl(`/api/collections/${id}/lessons`))).json();
    await page.goto(`/read/${lessons[0].id}`);

    const words = page.getByRole('button', { name: `Look up ${word}`, exact: true });
    const drawer = page.getByTestId('translation-drawer');
    await words.nth(0).click();
    await expect(drawer).toContainText('memory', { timeout: 10000 });
    await page.keyboard.press('Escape');

    await words.nth(1).click();
    await expect(drawer).toContainText('memory');
    expect(glossRequests).toBe(1);
  });
});
