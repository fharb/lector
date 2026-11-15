import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';

// Marking words with the mouse, and picking them with Ctrl+click. Translations are stubbed, so
// the specs need no AI provider.

const COLLECTION = 'E2E Selection';

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

function stubTranslations(page: Page) {
  return Promise.all([
    page.route('**/api/translate', (route) =>
      route.fulfill({ json: { translation: 'sentence translation' } }),
    ),
    page.route('**/api/translate/gloss', (route) =>
      route.fulfill({ body: 'gloss', contentType: 'text/plain' }),
    ),
  ]);
}

test.describe('Marking and picking words', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await stubTranslations(page);
  });

  test.afterEach(async ({ page }) => {
    const res = await page.request.get(apiUrl('/api/collections?language=af'));
    for (const collection of await res.json()) {
      if (collection.title === COLLECTION) {
        await page.request.delete(apiUrl(`/api/collections/${collection.id}`));
      }
    }
  });

  test('marking words with the mouse lists them, with known and ignore per word', async ({
    page,
  }) => {
    const first = word('eerste');
    const second = word('tweede');
    const third = word('derde');
    await openLesson(page, `${first} ${second} ${third} einde.`);

    const from = await lookup(page, first).boundingBox();
    const to = await lookup(page, third).boundingBox();
    if (!from || !to) throw new Error('No word boxes');
    await page.mouse.move(from.x + 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width - 2, to.y + to.height / 2, { steps: 5 });
    await page.mouse.up();

    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer).toContainText('sentence translation');
    await expect(drawer.getByTestId('add-to-anki-btn')).toHaveText('Add to Anki as a card');
    const rows = drawer.getByTestId('selection-word');
    await expect(rows).toHaveCount(3);

    await rows.filter({ hasText: second }).getByTestId('selection-word-ignore').click();
    await expect(lookup(page, second)).toHaveAttribute('data-word-state', 'ignored');
    await drawer.getByTestId('selection-new-known').click();
    await expect(lookup(page, first)).toHaveAttribute('data-word-state', 'known');
    await expect(lookup(page, third)).toHaveAttribute('data-word-state', 'known');
    await expect(lookup(page, second)).toHaveAttribute('data-word-state', 'ignored');

    // All known overwrites the earlier Ignore.
    await drawer.getByTestId('selection-all-known').click();
    await expect(lookup(page, second)).toHaveAttribute('data-word-state', 'known');
  });

  test('a marking across two paragraphs keeps the words of both', async ({ page }) => {
    const first = word('begin');
    const last = word('einde');
    await openLesson(
      page,
      `${first} van die eerste paragraaf

Tweede paragraaf tot ${last} hier.`,
    );

    const from = await lookup(page, first).boundingBox();
    const to = await lookup(page, last).boundingBox();
    if (!from || !to) throw new Error('No word boxes');
    await page.mouse.move(from.x + 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width - 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();

    const rows = page.getByTestId('translation-drawer').getByTestId('selection-word');
    await expect(rows.filter({ hasText: first })).toHaveCount(1);
    await expect(rows.filter({ hasText: last })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^paragraafTweede/ })).toHaveCount(0);
    await expect(lookup(page, first)).toHaveAttribute('data-marking', '');
    await expect(lookup(page, last)).toHaveAttribute('data-marking', '');
  });

  test('a marking too long to translate still lists its words', async ({ page }) => {
    const first = word('lank');
    const last = word('einde');
    const middle = Array.from({ length: 40 }, (_, i) => `woord${'abcdefghij'[i % 10]}`).join(' ');
    await openLesson(page, `${first} ${middle} ${last}.`);
    let translated = false;
    await page.route('**/api/translate', (route) => {
      translated = true;
      return route.fulfill({ json: { translation: 'sentence translation' } });
    });

    const from = await lookup(page, first).boundingBox();
    const to = await lookup(page, last).boundingBox();
    if (!from || !to) throw new Error('No word boxes');
    await page.mouse.move(from.x + 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width - 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();

    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer.getByTestId('phrase-too-long')).toBeVisible();
    await expect(drawer.getByTestId('selection-word').filter({ hasText: last })).toHaveCount(1);
    expect(translated).toBe(false);
  });

  test('a click between words ends a marking and the Ctrl+click picks', async ({ page }) => {
    const first = word('een');
    const last = word('twee');
    await openLesson(page, `${first} en ${last}`);
    const drawer = page.getByTestId('translation-drawer');

    const from = await lookup(page, first).boundingBox();
    const to = await lookup(page, last).boundingBox();
    if (!from || !to) throw new Error('No word boxes');
    const emptyX = to.x + to.width + 200;
    const emptyY = to.y + to.height / 2;

    await page.mouse.move(from.x + 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width - 2, emptyY, { steps: 5 });
    await page.mouse.up();
    await expect(lookup(page, first)).toHaveAttribute('data-marking', '');

    await page.mouse.click(emptyX, emptyY);
    await expect(page.locator('[data-marking]')).toHaveCount(0);
    await expect(drawer).toHaveAttribute('aria-hidden', 'true');

    await lookup(page, first).click({ modifiers: ['Control'] });
    await lookup(page, last).click({ modifiers: ['Control'] });
    await expect(drawer.locator('h2')).toHaveText('2 words selected');
    await page.mouse.click(emptyX, emptyY);
    await expect(drawer).toHaveAttribute('aria-hidden', 'true');
    await lookup(page, first).click({ modifiers: ['Control'] });
    await expect(drawer.locator('h2')).toHaveText('1 word selected');
  });

  test('a click between words empties the docked drawer', async ({ page }) => {
    await page.setViewportSize({ width: 1700, height: 900 });
    const first = word('son');
    const last = word('maan');
    await openLesson(page, `${first} en ${last}`);
    const drawer = page.getByTestId('translation-drawer');

    await lookup(page, first).click();
    await expect(drawer.getByTestId('translation-drawer-empty')).toHaveCount(0);
    const box = await lookup(page, last).boundingBox();
    if (!box) throw new Error('No word box');
    await page.mouse.click(box.x + box.width + 200, box.y + box.height / 2);
    await expect(drawer.getByTestId('translation-drawer-empty')).toBeVisible();
  });

  test('Ctrl+click picks separate words for one list, and closing clears it', async ({ page }) => {
    const first = word('kat');
    const second = word('hond');
    await openLesson(page, `Die ${first} sien die ${second}.`);

    await lookup(page, first).click({ modifiers: ['Control'] });
    await lookup(page, second).click({ modifiers: ['Control'] });

    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer.locator('h2')).toHaveText('2 words selected');
    await expect(drawer.getByTestId('selection-word')).toHaveCount(2);
    await expect(drawer.getByTestId('mark-word-known')).toHaveCount(0);

    await drawer.getByTestId('selection-new-known').click();
    await expect(lookup(page, first)).toHaveAttribute('data-word-state', 'known');
    await expect(lookup(page, second)).toHaveAttribute('data-word-state', 'known');

    await lookup(page, first).click({ modifiers: ['Control'] });
    await expect(drawer.getByTestId('selection-word')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await lookup(page, second).click();
    await expect(drawer.locator('h2')).not.toHaveText(/words selected/);
  });
});
