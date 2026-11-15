import { test, expect, type Page } from '@playwright/test';
import { apiUrl } from './api';

// The vocab list's Source column, its sort, and the collection filter. A saved word stores its
// lesson id, so each of these goes through the lesson's collection.

const TS = '2026-01-01T00:00:00.000Z';

async function seedSource(page: Page, title: string, word: string, id: string) {
  const created = await page.request.post(apiUrl('/api/collections'), {
    data: { title, language: 'af' },
  });
  const { id: collectionId } = await created.json();
  await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons?language=af`), {
    data: { title: 'Les', textContent: `${word} hier.` },
  });
  const lessons = await (
    await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`))
  ).json();
  await page.request.post(apiUrl('/api/vocab'), {
    data: {
      id,
      text: word,
      type: 'word',
      sentence: `${word} hier.`,
      translation: 'x',
      state: 'level1',
      stateUpdatedAt: TS,
      reviewCount: 0,
      bookId: lessons[0].id,
      createdAt: TS,
      pushedToAnki: false,
      language: 'af',
    },
  });
  return collectionId as string;
}

test.describe('Vocab source', () => {
  const tag = `src${Date.now().toString(36)}`;
  const first = `${tag}a`;
  const second = `${tag}b`;

  test.afterEach(async ({ page }) => {
    for (const id of [`e2e-${first}`, `e2e-${second}`]) {
      await page.request.delete(apiUrl(`/api/vocab/${id}?language=af`));
    }
    const collections = await (
      await page.request.get(apiUrl('/api/collections?language=af'))
    ).json();
    for (const c of collections) {
      if (String(c.title).startsWith(`E2E Source ${tag}`)) {
        await page.request.delete(apiUrl(`/api/collections/${c.id}`));
      }
    }
  });

  test('shows, sorts and filters by the collection of the lesson', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // Word "…a" comes from the collection named "Z…", so a sort by source reverses the word order.
    await seedSource(page, `E2E Source ${tag} Z`, first, `e2e-${first}`);
    const alpha = await seedSource(page, `E2E Source ${tag} A`, second, `e2e-${second}`);

    await page.goto('/vocab');
    const search = page.getByPlaceholder(/Search words/i);
    await expect(search).toBeVisible({ timeout: 30000 });
    await search.fill(tag);
    const rows = page.getByRole('row').filter({ hasText: tag });
    await expect(rows).toHaveCount(2);

    await expect(rows.filter({ hasText: first })).toContainText(`E2E Source ${tag} Z`);
    await expect(rows.filter({ hasText: second })).toContainText(`E2E Source ${tag} A`);

    await page.getByRole('columnheader', { name: /Source/ }).click();
    await expect(rows.nth(0)).toContainText(second);
    await expect(rows.nth(1)).toContainText(first);
    await page.getByRole('columnheader', { name: /Source/ }).click();
    await expect(rows.nth(0)).toContainText(first);

    await page.locator('select').filter({ hasText: 'All Collections' }).selectOption(alpha);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(second);
  });
});
