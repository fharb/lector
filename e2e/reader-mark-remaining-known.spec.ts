import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';

const COLLECTION_TITLE = 'E2E Mark Remaining';

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

async function setWordState(page: Page, target: string, state: string) {
  const res = await page.request.post(apiUrl('/api/known-words'), {
    data: { updates: [{ word: target, state }], language: 'af' },
  });
  expect(res.ok()).toBeTruthy();
}

async function wordStates(page: Page): Promise<Record<string, string>> {
  const res = await page.request.get(apiUrl('/api/known-words?language=af'));
  return res.json();
}

const lookup = (page: Page, target: string) =>
  page.getByRole('button', { name: `Look up ${target}`, exact: true });
const control = (page: Page) => page.getByTestId('mark-remaining-known');

async function confirmMarkRemaining(page: Page) {
  await control(page).click();
  await page.getByTestId('mark-remaining-known-confirm').click();
}

test.describe('Mark remaining words as known', () => {
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

  test('marks only new words, after the learner confirms', async ({ page }) => {
    const first = word('eerste');
    const second = word('tweede');
    const capitalised = `${second[0].toUpperCase()}${second.slice(1)}`;
    const linked = word('skakel');
    const urlPart = word('adres');
    const heading = word('opskrif');
    const learning = word('leer');
    const ignored = word('geignoreer');
    const lessonId = await createLesson(
      page,
      `# ${heading}\n\n${first} ${capitalised} ${second} ${learning} ${ignored} [${linked}](https://example.com/${urlPart})`,
    );
    await setWordState(page, learning, 'level1');
    await setWordState(page, ignored, 'ignored');

    await page.goto(`/read/${lessonId}`);
    await expect(lookup(page, first)).toHaveClass(/w-new-bg/, { timeout: 10000 });

    await control(page).click();
    await expect(page.getByTestId('mark-remaining-known-description')).toContainText('3 new words');
    await page.getByTestId('mark-remaining-known-cancel').click();
    await expect(page.getByTestId('mark-remaining-known-description')).toBeHidden();
    expect((await wordStates(page))[first]).toBeUndefined();
    await expect(lookup(page, first)).toHaveClass(/w-new-bg/);

    const statWrite = page.waitForRequest(
      (request) => request.method() === 'PUT' && request.url().includes('/api/stats/today'),
    );
    await confirmMarkRemaining(page);

    await expect(lookup(page, first)).not.toHaveClass(/w-new-bg/);
    await expect(lookup(page, linked)).not.toHaveClass(/w-new-bg/);
    expect((await statWrite).postDataJSON()).toEqual({ field: 'wordsMarkedKnown', amount: 3 });

    await expect
      .poll(() => wordStates(page))
      .toMatchObject({
        [first]: 'known',
        [second]: 'known',
        [linked]: 'known',
        [learning]: 'level1',
        [ignored]: 'ignored',
      });
    const states = await wordStates(page);
    expect(states[heading]).toBeUndefined();
    expect(states[urlPart]).toBeUndefined();

    const vocab = await page.request.get(apiUrl(`/api/vocab?language=af&text=${first}`));
    expect(await vocab.json()).toEqual([]);

    await page.reload();
    await expect(lookup(page, first)).toBeVisible({ timeout: 10000 });
    await expect(control(page)).toBeDisabled();
  });

  test('uses the singular form for one new word', async ({ page }) => {
    const only = word('enkel');
    const lessonId = await createLesson(page, only);

    await page.goto(`/read/${lessonId}`);
    await expect(lookup(page, only)).toBeVisible({ timeout: 10000 });
    await control(page).click();
    await expect(page.getByTestId('mark-remaining-known-description')).toContainText(
      '1 new word in',
    );
  });

  test('disables the control when the lesson has no words', async ({ page }) => {
    const lessonId = await createLesson(page, '!!! ... ???');

    await page.goto(`/read/${lessonId}`);
    await expect(page.getByText('!!!')).toBeVisible({ timeout: 10000 });
    await expect(control(page)).toBeDisabled();
  });

  test('restores the word colours when the save fails', async ({ page }) => {
    const target = word('fout');
    const lessonId = await createLesson(page, target);
    await page.route('**/api/known-words', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`/read/${lessonId}`);
    await expect(lookup(page, target)).toHaveClass(/w-new-bg/, { timeout: 10000 });
    await confirmMarkRemaining(page);

    await expect(page.getByText('Could not mark the words as known')).toBeVisible();
    await expect(lookup(page, target)).toHaveClass(/w-new-bg/);
    await expect(control(page)).toBeEnabled();
    expect((await wordStates(page))[target]).toBeUndefined();
  });

  test('shows only the plan-limit prompt when the plan is full', async ({ page }) => {
    const target = word('limiet');
    const lessonId = await createLesson(page, target);
    await page.route('**/api/known-words', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'plan_limit',
          metric: 'maxKnownWords',
          limit: 1,
          used: 1,
          requested: 1,
          plan: 'free',
          upgrade: 'cloud',
        }),
      });
    });

    await page.goto(`/read/${lessonId}`);
    await expect(lookup(page, target)).toHaveClass(/w-new-bg/, { timeout: 10000 });
    await confirmMarkRemaining(page);

    await expect(page.getByText('Word-state fair-use limit reached')).toBeVisible();
    await expect(page.getByText('Could not mark the words as known')).toBeHidden();
    await expect(lookup(page, target)).toHaveClass(/w-new-bg/);
  });

  test('works in listen-along', async ({ page }) => {
    const spoken = word('gesproke');
    const learning = word('leer');
    const text = `${spoken} ${learning}`;
    const lessonId = await createLesson(page, text);
    await setWordState(page, learning, 'level1');

    await page.route(`**/api/lessons/${lessonId}`, async (route) => {
      const response = await route.fetch();
      const lesson = await response.json();
      await route.fulfill({
        response,
        json: { ...lesson, transcriptionStatus: 'done', audioDurationMs: 2000 },
      });
    });
    await page.route(`**/api/lessons/${lessonId}/segments`, (route) =>
      route.fulfill({ json: [{ idx: 0, startMs: 0, endMs: 2000, text }] }),
    );
    await page.route(`**/api/lessons/${lessonId}/audio`, (route) =>
      route.fulfill({ status: 200, contentType: 'audio/wav', body: '' }),
    );

    await page.goto(`/read/${lessonId}`);
    await page.getByTestId('listen-along-toggle').click({ timeout: 10000 });
    const listen = page.getByTestId('listen-along');
    const spokenWord = listen.getByTestId('reader-word').filter({ hasText: spoken });
    await expect(spokenWord).toHaveClass(/w-new-bg/);

    await listen.getByTestId('mark-remaining-known').click();
    await expect(page.getByTestId('mark-remaining-known-description')).toContainText(
      '1 new word in',
    );
    await page.getByTestId('mark-remaining-known-confirm').click();

    await expect(spokenWord).not.toHaveClass(/w-new-bg/);
    await expect
      .poll(() => wordStates(page))
      .toMatchObject({ [spoken]: 'known', [learning]: 'level1' });
    await expect(listen.getByTestId('mark-remaining-known')).toBeDisabled();
  });
});
