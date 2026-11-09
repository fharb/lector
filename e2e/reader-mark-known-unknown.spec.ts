import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';

const COLLECTION_TITLE = 'E2E Mark Known Unknown';

function word(stem: string): string {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(
    /\d/g,
    (digit) => 'abcdefghij'[Number(digit)],
  );
  return `${stem}${suffix}`;
}

async function createLesson(page: Page, textContent: string): Promise<string> {
  const collection = await page.request.post(apiUrl('/api/collections'), {
    data: { title: COLLECTION_TITLE, language: 'af' },
  });
  const { id: collectionId } = await collection.json();
  await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
    data: { title: 'Les', textContent },
  });
  const lessons = await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`));
  return (await lessons.json())[0].id;
}

async function rate(page: Page, target: string, state: string) {
  const res = await page.request.post(apiUrl('/api/known-words'), {
    data: { updates: [{ word: target, state }], language: 'af' },
  });
  expect(res.ok()).toBeTruthy();
}

async function states(page: Page): Promise<Record<string, string>> {
  return (await page.request.get(apiUrl('/api/known-words?language=af'))).json();
}

const lookup = (page: Page, target: string) =>
  page.getByRole('button', { name: `Look up ${target}`, exact: true });
const control = (page: Page) => page.getByTestId('mark-known-unknown');

test.describe('Mark known words as unknown', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test.afterEach(async ({ page }) => {
    const res = await page.request.get(apiUrl('/api/collections'));
    for (const collection of await res.json()) {
      if (collection.title === COLLECTION_TITLE) {
        await page.request.delete(apiUrl(`/api/collections/${collection.id}`));
      }
    }
  });

  test('resets only known words, after the learner confirms', async ({ page }) => {
    const known = word('bekend');
    const learning = word('leer');
    const lessonId = await createLesson(page, `${known} ${learning}`);
    await rate(page, known, 'known');
    await rate(page, learning, 'level2');

    await page.goto(`/read/${lessonId}`);
    await expect(lookup(page, known)).not.toHaveClass(/w-new-bg/, { timeout: 10000 });

    await control(page).click();
    await expect(page.getByTestId('mark-known-unknown-description')).toContainText('1 known word');
    await page.getByTestId('mark-known-unknown-confirm').click();

    await expect(lookup(page, known)).toHaveClass(/w-new-bg/);
    await expect(lookup(page, learning)).toHaveClass(/w-l2-bg/);
    const saved = await states(page);
    expect(saved[known]).toBeUndefined();
    expect(saved[learning]).toBe('level2');
  });

  test('cancelling changes nothing', async ({ page }) => {
    const known = word('bekend');
    const lessonId = await createLesson(page, known);
    await rate(page, known, 'known');

    await page.goto(`/read/${lessonId}`);
    await expect(control(page)).toBeEnabled({ timeout: 10000 });
    await control(page).click();
    await page.getByTestId('mark-known-unknown-cancel').click();

    expect((await states(page))[known]).toBe('known');
  });

  test('is disabled when the lesson has no known words', async ({ page }) => {
    const target = word('nuut');
    const lessonId = await createLesson(page, target);

    await page.goto(`/read/${lessonId}`);
    await expect(lookup(page, target)).toHaveClass(/w-new-bg/, { timeout: 10000 });

    await expect(control(page)).toBeDisabled();
  });
});
