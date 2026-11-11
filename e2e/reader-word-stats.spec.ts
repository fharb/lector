import { expect, test } from '@playwright/test';
import { apiUrl } from './api';

const COLLECTION = 'E2E Word Stats';

test.describe('Known and learning share in the reader header', () => {
  test.afterEach(async ({ page }) => {
    const res = await page.request.get(apiUrl('/api/collections?language=af'));
    for (const collection of await res.json()) {
      if (collection.title === COLLECTION) {
        await page.request.delete(apiUrl(`/api/collections/${collection.id}`));
      }
    }
  });

  test('shows the share of known, learning and new words, and updates it', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const stamp = Date.now().toString(36).replace(/\d/g, '');
    const [known, learning, ignored, fresh] = ['ken', 'leer', 'weg', 'nuut'].map(
      (word) => `stat${word}${stamp}`,
    );
    const states = await page.request.post(apiUrl('/api/known-words'), {
      data: {
        updates: [
          { word: known, state: 'known' },
          { word: learning, state: 'level1' },
          { word: ignored, state: 'ignored' },
        ],
        language: 'af',
      },
    });
    expect(states.ok()).toBeTruthy();
    const created = await page.request.post(apiUrl('/api/collections'), {
      data: { title: COLLECTION, language: 'af' },
    });
    const { id } = await created.json();
    await page.request.post(apiUrl(`/api/collections/${id}/lessons?language=af`), {
      data: { title: 'Les', textContent: `${known} ${learning} ${ignored} ${fresh} ${known}` },
    });
    const lessons = await (await page.request.get(apiUrl(`/api/collections/${id}/lessons`))).json();
    await page.goto(`/read/${lessons[0].id}`);

    const stats = page.getByTestId('lesson-word-stats');
    await expect(stats).toHaveAttribute(
      'title',
      '1 known, 1 learning, 1 new of 3 different words',
      { timeout: 10000 },
    );
    await expect(page.getByTestId('lesson-known-percent')).toHaveText('33% known');

    await page.getByRole('button', { name: `Look up ${fresh}`, exact: true }).click();
    await page.getByTestId('mark-word-known').click();
    await expect(page.getByTestId('lesson-known-percent')).toHaveText('67% known');

    await page.request.post(apiUrl('/api/known-words'), {
      data: {
        updates: [known, learning, ignored, fresh].map((word) => ({ word, state: 'new' })),
        language: 'af',
      },
    });
  });
});
