import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';

function word(stem: string): string {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(
    /\d/g,
    (digit) => 'abcdefghij'[Number(digit)],
  );
  return `${stem}${suffix}`;
}

async function rate(page: Page, target: string, state: string) {
  const res = await page.request.post(apiUrl('/api/known-words'), {
    data: { updates: [{ word: target, state }], language: 'af' },
  });
  expect(res.ok()).toBeTruthy();
}

async function statesNow(page: Page): Promise<Record<string, string>> {
  return (await page.request.get(apiUrl('/api/known-words?language=af'))).json();
}

async function openAndSearch(page: Page, target: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/vocab');
  await page.getByPlaceholder('Search words, translations, or sentences...').fill(target);
  await expect(page.getByRole('cell', { name: target, exact: true })).toBeVisible({
    timeout: 10000,
  });
}

const stateMenu = (page: Page, target: string) =>
  page.getByRole('combobox', { name: `State of ${target}` });

test.describe('Known words in the vocab list', () => {
  test('lists a known word that has no vocab entry', async ({ page }) => {
    const target = word('bekend');
    await rate(page, target, 'known');

    await openAndSearch(page, target);

    await expect(stateMenu(page, target)).toHaveValue('known');
  });

  test('moves a known word back to learning', async ({ page }) => {
    const target = word('leer');
    await rate(page, target, 'known');
    await openAndSearch(page, target);

    await stateMenu(page, target).selectOption('level1');

    await expect(stateMenu(page, target)).toHaveValue('level1');
    const res = await page.request.get(apiUrl(`/api/vocab?language=af&text=${target}`));
    expect((await res.json())[0]).toMatchObject({ text: target, state: 'level1' });
  });

  test('marks a known word as unknown and removes it from the list', async ({ page }) => {
    const target = word('weg');
    await rate(page, target, 'known');
    await openAndSearch(page, target);

    await stateMenu(page, target).selectOption('new');

    await expect(page.getByRole('cell', { name: target, exact: true })).toHaveCount(0);
    expect((await statesNow(page))[target]).toBeUndefined();
  });

  test('changes the state of several selected words', async ({ page }) => {
    const prefix = word('groep');
    const first = `${prefix}a`;
    const second = `${prefix}b`;
    await rate(page, first, 'known');
    await rate(page, second, 'known');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/vocab');
    await page.getByPlaceholder('Search words, translations, or sentences...').fill(prefix);
    await expect(page.getByRole('cell', { name: first, exact: true })).toBeVisible({
      timeout: 10000,
    });

    await page.locator('thead input[type="checkbox"]').check();
    await page.getByTestId('bulk-state').selectOption('ignored');

    await expect
      .poll(async () => {
        const states = await statesNow(page);
        return [states[first], states[second]];
      })
      .toEqual(['ignored', 'ignored']);
  });
});
