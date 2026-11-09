import { expect, test, type Page } from '@playwright/test';
import { apiUrl } from './api';
import { pickLanguage } from './language-helpers';

// The dictionary half is covered by the API unit tests, so this stubs base-forms
// and needs no dictionary-ru.db.

const COLLECTION_TITLE = 'E2E Word Families';

function word(stem: string): string {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.replace(
    /\d/g,
    (digit) => 'абвгдежзик'[Number(digit)],
  );
  return `${stem}${suffix}`;
}

async function switchToRussian(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const selector = page.locator('aside').getByTestId('language-selector');
  await expect(selector).toBeVisible();
  await selector.click();
  await pickLanguage(page, 'ru');
  await expect(selector).toContainText('Русский');
}

async function createLesson(page: Page, language: string, textContent: string): Promise<string> {
  const collection = await page.request.post(apiUrl('/api/collections'), {
    data: { title: COLLECTION_TITLE, language },
  });
  const { id: collectionId } = await collection.json();
  await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
    data: { title: 'Урок', textContent },
  });
  const lessons = await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`));
  return (await lessons.json())[0].id;
}

async function setWordState(page: Page, target: string, state: string) {
  const res = await page.request.post(apiUrl('/api/known-words'), {
    data: { updates: [{ word: target, state }], language: 'ru' },
  });
  expect(res.ok()).toBeTruthy();
}

function stubBaseForms(page: Page, forms: Record<string, string[]>) {
  return page.route('**/api/lessons/*/base-forms*', (route) => route.fulfill({ json: forms }));
}

const lookup = (page: Page, target: string) =>
  page.getByRole('button', { name: `Look up ${target}`, exact: true });

test.describe('Recognizing word forms', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test.afterEach(async ({ page }) => {
    const res = await page.request.get(apiUrl('/api/collections?language=ru'));
    for (const collection of await res.json()) {
      if (collection.title === COLLECTION_TITLE) {
        await page.request.delete(apiUrl(`/api/collections/${collection.id}`));
      }
    }
    await page.request.put(apiUrl('/api/settings/targetLanguage'), { data: { value: 'af' } });
  });

  test('shows forms of a known base word as known, and only those', async ({ page }) => {
    await switchToRussian(page);
    const base = word('читать');
    const form = word('читала');
    const compound = `интернет-${word('троллей')}`;
    const compoundBase = `интернет-${word('тролль')}`;
    const unrelated = word('книга');
    const lessonId = await createLesson(page, 'ru', `${form} ${compound} ${unrelated}`);
    await setWordState(page, base, 'known');
    await setWordState(page, compoundBase, 'known');
    await stubBaseForms(page, { [form]: [base], [compound]: [compoundBase] });

    await page.goto(`/read/${lessonId}`);

    await expect(lookup(page, unrelated)).toHaveClass(/w-new-bg/, { timeout: 10000 });
    await expect(lookup(page, form)).not.toHaveClass(/w-new-bg/);
    await expect(lookup(page, compound)).not.toHaveClass(/w-new-bg/);
  });

  test('a form takes the learning level of its base word', async ({ page }) => {
    await switchToRussian(page);
    const base = word('читать');
    const form = word('читала');
    const lessonId = await createLesson(page, 'ru', form);
    await setWordState(page, base, 'level1');
    await stubBaseForms(page, { [form]: [base] });

    await page.goto(`/read/${lessonId}`);

    await expect(lookup(page, form)).toHaveClass(/w-l1-bg/, { timeout: 10000 });
  });

  test('stores nothing for a recognized form', async ({ page }) => {
    await switchToRussian(page);
    const base = word('читать');
    const form = word('читала');
    const lessonId = await createLesson(page, 'ru', form);
    await setWordState(page, base, 'known');
    await stubBaseForms(page, { [form]: [base] });

    await page.goto(`/read/${lessonId}`);
    await expect(lookup(page, form)).not.toHaveClass(/w-new-bg/, { timeout: 10000 });

    const states = await (await page.request.get(apiUrl('/api/known-words?language=ru'))).json();
    expect(states[form]).toBeUndefined();
  });

  test('the translation panel marks the stressed vowel', async ({ page }) => {
    await switchToRussian(page);
    const form = word('читала');
    const lessonId = await createLesson(page, 'ru', form);
    await page.route('**/api/dictionary/lookup*', (route) =>
      route.fulfill({
        json: {
          entry: {
            word: form,
            stressIndex: 3,
            senses: [{ partOfSpeech: 'verb', gloss: 'read' }],
            source: 'dict',
          },
        },
      }),
    );

    await page.goto(`/read/${lessonId}`);
    await lookup(page, form).click();

    await expect(page.getByTestId('stressed-vowel')).toHaveText('а́', { timeout: 10000 });
  });

  test('saves the base form and colours the tapped form', async ({ page }) => {
    await switchToRussian(page);
    const base = word('читать');
    const form = word('читала');
    const lessonId = await createLesson(page, 'ru', `${form} ${word('книга')}`);
    await stubBaseForms(page, { [form]: [base] });
    await page.route('**/api/dictionary/lookup*', (route) =>
      route.fulfill({
        json: {
          entry: {
            word: form,
            senses: [{ partOfSpeech: 'verb', gloss: `past of ${base}` }],
            baseOptions: [{ word: base, translation: 'to read' }],
            source: 'dict',
          },
        },
      }),
    );

    await page.goto(`/read/${lessonId}`);
    await lookup(page, form).click();
    await expect(page.getByTestId('save-as')).toContainText(base, { timeout: 10000 });
    await page.getByTestId('word-level-1').click();

    await expect(lookup(page, form)).toHaveClass(/w-l1-bg/);
    const savedBase = await page.request.get(
      apiUrl(`/api/vocab?language=ru&text=${encodeURIComponent(base)}`),
    );
    expect((await savedBase.json())[0]).toMatchObject({
      text: base,
      translation: 'to read',
      sentenceWord: form,
    });
    const savedForm = await page.request.get(
      apiUrl(`/api/vocab?language=ru&text=${encodeURIComponent(form)}`),
    );
    expect(await savedForm.json()).toEqual([]);
  });

  test('can save the exact form instead of the base form', async ({ page }) => {
    await switchToRussian(page);
    const base = word('читать');
    const form = word('читала');
    const lessonId = await createLesson(page, 'ru', form);
    await stubBaseForms(page, { [form]: [base] });
    await page.route('**/api/dictionary/lookup*', (route) =>
      route.fulfill({
        json: {
          entry: {
            word: form,
            senses: [{ partOfSpeech: 'verb', gloss: `past of ${base}` }],
            baseOptions: [{ word: base, translation: 'to read' }],
            source: 'dict',
          },
        },
      }),
    );

    await page.goto(`/read/${lessonId}`);
    await lookup(page, form).click();
    await page.getByTestId(`save-as-${form}`).click();
    await page.getByTestId('word-level-1').click();

    await expect(lookup(page, form)).toHaveClass(/w-l1-bg/);
    const states = await (await page.request.get(apiUrl('/api/known-words?language=ru'))).json();
    expect(states[form]).toBe('level1');
    expect(states[base]).toBeUndefined();
  });

  test('marking the remaining words saves one word per family', async ({ page }) => {
    await switchToRussian(page);
    const base = word('читать');
    const first = word('читала');
    const second = word('читаю');
    const lessonId = await createLesson(page, 'ru', `${first} ${second}`);
    await stubBaseForms(page, { [first]: [base], [second]: [base] });

    await page.goto(`/read/${lessonId}`);
    await expect(lookup(page, first)).toHaveClass(/w-new-bg/, { timeout: 10000 });
    await page.getByTestId('mark-remaining-known').click();
    await expect(page.getByTestId('mark-remaining-known-description')).toContainText('1 new word');
    await page.getByTestId('mark-remaining-known-confirm').click();

    await expect(lookup(page, first)).not.toHaveClass(/w-new-bg/);
    await expect(lookup(page, second)).not.toHaveClass(/w-new-bg/);
    const states = await (await page.request.get(apiUrl('/api/known-words?language=ru'))).json();
    expect(states[base]).toBe('known');
    expect(states[first]).toBeUndefined();
    expect(states[second]).toBeUndefined();
  });

  test('the reader still works when word forms fail to load', async ({ page }) => {
    await switchToRussian(page);
    const form = word('читала');
    const lessonId = await createLesson(page, 'ru', form);
    await page.route('**/api/lessons/*/base-forms*', (route) =>
      route.fulfill({ status: 500, json: { error: 'failed' } }),
    );

    await page.goto(`/read/${lessonId}`);

    await expect(lookup(page, form)).toHaveClass(/w-new-bg/, { timeout: 10000 });
  });
});

test.describe('Word forms in other languages', () => {
  test('does not ask for word forms', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    let requested = false;
    await page.route('**/api/lessons/*/base-forms*', (route) => {
      requested = true;
      return route.fulfill({ json: {} });
    });
    const target = word('huis');
    const lessonId = await createLesson(page, 'af', target);

    await page.goto(`/read/${lessonId}`);
    await expect(page.getByRole('button', { name: `Look up ${target}` })).toBeVisible({
      timeout: 10000,
    });

    expect(requested).toBe(false);
    const res = await page.request.get(apiUrl('/api/collections'));
    for (const collection of await res.json()) {
      if (collection.title === COLLECTION_TITLE) {
        await page.request.delete(apiUrl(`/api/collections/${collection.id}`));
      }
    }
  });
});
