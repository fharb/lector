import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';

const COLLECTION = 'E2E Glosses';
const TS = '2026-01-01T00:00:00.000Z';

async function saveWord(page: Page, text: string, state: string, translation: string) {
  const res = await page.request.post(apiUrl('/api/vocab'), {
    data: {
      id: `gloss-${text}-${Date.now()}`,
      text,
      type: 'word',
      sentence: '',
      translation,
      state,
      stateUpdatedAt: TS,
      reviewCount: 0,
      createdAt: TS,
      pushedToAnki: false,
      language: 'af',
    },
  });
  expect(res.ok()).toBeTruthy();
}

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

async function chooseMode(page: Page, mode: 'off' | 'above' | 'side') {
  await page.getByTestId('gloss-toggle').click();
  await page.getByTestId(`gloss-mode-${mode}`).click();
  await expect(page.getByTestId('gloss-toggle')).toHaveAttribute('data-gloss-mode', mode);
}

const glossOver = (page: Page, word: string) =>
  page
    .getByTestId('reader-word')
    .filter({ hasText: new RegExp(`^${word}`) })
    .locator('rt');

test.describe('Translations above learning words', () => {
  test.afterEach(async ({ page }) => {
    const res = await page.request.get(apiUrl('/api/collections?language=af'));
    for (const collection of await res.json()) {
      if (collection.title === COLLECTION) {
        await page.request.delete(apiUrl(`/api/collections/${collection.id}`));
      }
    }
    const vocab = await (await page.request.get(apiUrl('/api/vocab?language=af'))).json();
    for (const entry of vocab) {
      if (String(entry.id).startsWith('gloss-')) {
        await page.request.delete(apiUrl(`/api/vocab/${entry.id}`));
      }
    }
  });

  test('shows translations above, then beside the text, for learning words only', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1700, height: 900 });
    const stamp = Date.now().toString(36).replace(/\d/g, '');
    const learning = `glosshond${stamp}`;
    const second = `glossmuis${stamp}`;
    const known = `glosskat${stamp}`;
    const ignored = `glossweg${stamp}`;
    const fresh = `glossboom${stamp}`;
    await saveWord(page, learning, 'level2', 'dog; hound');
    await saveWord(page, second, 'level1', 'mouse');
    await saveWord(page, known, 'known', 'cat');
    await saveWord(page, ignored, 'ignored', 'away');
    await openLesson(
      page,
      `Die ${second} en ${known} sien ${ignored} by ${fresh} en ${learning} en ${second}.`,
    );
    const paragraph = page.locator('article p').first();
    await expect(paragraph).toBeVisible();
    const textBefore = await paragraph.boundingBox();

    await chooseMode(page, 'above');
    await expect(glossOver(page, learning)).toHaveText('dog', { timeout: 10000 });
    await expect(glossOver(page, known)).toHaveCount(0);
    await expect(glossOver(page, ignored)).toHaveCount(0);
    await expect(glossOver(page, fresh)).toHaveCount(0);

    await page.reload();
    await expect(glossOver(page, learning)).toHaveText('dog', { timeout: 10000 });

    await chooseMode(page, 'side');
    await expect(page.locator('article rt')).toHaveCount(0);
    const rows = page.getByTestId('side-gloss');
    await expect(rows).toHaveCount(2, { timeout: 10000 });
    await expect(rows.nth(0)).toHaveText(`${second} mouse`);
    await expect(rows.nth(1)).toHaveText(`${learning} dog`);

    const textBeside = await paragraph.boundingBox();
    expect(textBeside).toEqual(textBefore);
    const list = await page.getByTestId('side-glosses').boundingBox();
    expect(list && textBeside && list.x >= textBeside.x + textBeside.width).toBe(true);

    await chooseMode(page, 'off');
    await expect(rows).toHaveCount(0);
    await expect(glossOver(page, learning)).toHaveCount(0);
  });

  test('puts the translations under the paragraph on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const learning = `glossvis${Date.now().toString(36).replace(/\d/g, '')}`;
    await saveWord(page, learning, 'level1', 'fish');
    await openLesson(page, `Die ${learning} swem.`);
    await chooseMode(page, 'side');

    const list = await page.getByTestId('side-glosses').boundingBox();
    const text = await page.locator('article p').first().boundingBox();
    expect(list && text && list.y >= text.y + text.height).toBe(true);
  });

  test('shows nothing when no word is in a learning state', async ({ page }) => {
    await openLesson(page, 'Net nuwe woorde hier.');
    await chooseMode(page, 'above');
    await expect(page.locator('article rt')).toHaveCount(0);
    await chooseMode(page, 'side');
    await expect(page.getByTestId('side-gloss')).toHaveCount(0);
  });
});
