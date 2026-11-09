import { expect, test } from '@playwright/test';
import { apiUrl } from './api';

const COLLECTION_TITLE = 'E2E Numbers';

function word(stem: string): string {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(
    /\d/g,
    (digit) => 'abcdefghij'[Number(digit)],
  );
  return `${stem}${suffix}`;
}

test.describe('Numbers in the reader', () => {
  test.afterEach(async ({ page }) => {
    const res = await page.request.get(apiUrl('/api/collections'));
    for (const collection of await res.json()) {
      if (collection.title === COLLECTION_TITLE) {
        await page.request.delete(apiUrl(`/api/collections/${collection.id}`));
      }
    }
  });

  test('are ignored and left out of mark remaining', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const target = word('huis');
    const collection = await page.request.post(apiUrl('/api/collections'), {
      data: { title: COLLECTION_TITLE, language: 'af' },
    });
    const { id: collectionId } = await collection.json();
    await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
      data: { title: 'Les', textContent: `In 1987 en 70-80 was daar 1ste ${target}` },
    });
    const lessons = await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`));
    const lessonId = (await lessons.json())[0].id;

    await page.goto(`/read/${lessonId}`);
    await expect(page.getByRole('button', { name: `Look up ${target}`, exact: true })).toHaveClass(
      /w-new-bg/,
      { timeout: 10000 },
    );

    for (const number of ['1987', '70-80', '1ste']) {
      await expect(
        page.getByRole('button', { name: `Look up ${number}`, exact: true }),
      ).not.toHaveClass(/w-new-bg/);
    }

    const savedBefore = await (
      await page.request.get(apiUrl('/api/known-words?language=af'))
    ).json();
    await page.getByTestId('mark-remaining-known').click();
    await expect(page.getByTestId('mark-remaining-known-description')).not.toContainText('1987');
    await page.getByTestId('mark-remaining-known-cancel').click();
    expect(savedBefore['1987']).toBeUndefined();
  });
});
