import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';

// The sentence of a phrase marked with the mouse comes from its words, not from where the drag
// started. Translations are stubbed, so the spec needs no AI provider.

const COLLECTION = 'E2E Phrase sentence';

function word(stem: string): string {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(
    /\d/g,
    (digit) => 'abcdefghij'[Number(digit)],
  );
  return `${stem}${suffix}`;
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

const lookup = (page: Page, target: string) =>
  page.getByRole('button', { name: `Look up ${target}`, exact: true });

test.describe('Phrase sentence', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route('**/api/translate', (route) =>
      route.fulfill({ json: { translation: 'sentence translation' } }),
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

  test('a marked phrase takes the sentence of its words, wherever the drag starts', async ({
    page,
  }) => {
    const before = word('voor');
    const first = word('arm');
    const second = word('been');
    await openLesson(page, `Die eerste sin is hier. Dan kom ${before} ${first} ${second} daarna.`);
    const drawer = page.getByTestId('translation-drawer');
    const sentence = `Dan kom ${before} ${first} ${second} daarna.`;

    const gapStart = await lookup(page, before).boundingBox();
    const from = await lookup(page, first).boundingBox();
    const to = await lookup(page, second).boundingBox();
    if (!gapStart || !from || !to) throw new Error('No word boxes');
    const y = from.y + from.height / 2;

    // Mouse down on the space before the first word.
    await page.mouse.move((gapStart.x + gapStart.width + from.x) / 2, y);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width - 2, y, { steps: 5 });
    await page.mouse.up();
    await expect(drawer).toContainText(sentence);
    await expect(drawer).not.toContainText('Die eerste sin');

    await page.keyboard.press('Escape');

    // Right to left.
    await page.mouse.move(to.x + to.width - 2, y);
    await page.mouse.down();
    await page.mouse.move(from.x + 2, y, { steps: 5 });
    await page.mouse.up();
    await expect(drawer).toContainText(sentence);
    await expect(drawer).not.toContainText('Die eerste sin');
  });
});
