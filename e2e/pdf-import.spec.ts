import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { apiUrl } from './api';
import { switchLanguage } from './language-helpers';

// PDF import. The worker in the e2e API reads the text with pdf.js. Status screens are
// driven with page.route stubs.

const FIXTURE = path.join(__dirname, 'fixtures', 'sample-ru-fr.pdf');
const OUTLINE_FIXTURE = path.join(__dirname, 'fixtures', 'with-outline.pdf');
const PREFIX = 'E2E PDF';
const TS = '2026-01-01T00:00:00.000Z';

async function cleanup(page: Page) {
  for (const language of ['ru', 'af']) {
    const res = await page.request.get(apiUrl(`/api/collections?language=${language}`));
    for (const c of await res.json()) {
      if (String(c.title).startsWith(PREFIX)) {
        await page.request.delete(apiUrl(`/api/collections/${c.id}?language=${language}`));
      }
    }
  }
  const vocab = await (await page.request.get(apiUrl('/api/vocab?language=ru'))).json();
  for (const entry of vocab) {
    if (String(entry.id).startsWith('pdf-e2e-')) {
      await page.request.delete(apiUrl(`/api/vocab/${entry.id}?language=ru`));
    }
  }
}

async function uploadFixture(
  page: Page,
  title: string,
  mode: 'pages' | 'text' = 'pages',
  fixture = FIXTURE,
): Promise<{ collectionId: string; lessonId: string }> {
  const res = await page.request.post(apiUrl('/api/import/pdf'), {
    multipart: {
      file: { name: 'sample.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(fixture) },
      language: 'ru',
      mode,
      title,
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function waitReady(page: Page, lessonId: string) {
  await expect
    .poll(
      async () =>
        (await (await page.request.get(apiUrl(`/api/lessons/${lessonId}?language=ru`))).json())
          .pdfStatus,
      { timeout: 30000 },
    )
    .toBe('ready');
}

const lessonRoute = (lessonId: string) => new RegExp(`/api/lessons/${lessonId}([?].*)?$`);

const overlayWord = (page: Page, word: string) =>
  page.locator(`[data-testid="pdf-word"][data-reader-word="${word}"]`).first();

async function openImportDialog(page: Page) {
  await page
    .getByRole('button', { name: /Import/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Import PDF' }).click();
  await expect(page.getByTestId('pdf-import-modal')).toBeVisible();
}

test.describe('PDF import', () => {
  test.beforeEach(async ({ page }) => {
    await switchLanguage(page, 'ru', 'Русский');
    await cleanup(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanup(page);
    await page.request.put(apiUrl('/api/settings/targetLanguage'), { data: { value: 'af' } });
  });

  test('happy path: keep the pages, click words, read sentences and table rows', async ({
    page,
  }) => {
    await openImportDialog(page);
    await expect(page.getByTestId('pdf-mode-pages')).toBeChecked();
    await page.getByTestId('pdf-file-input').setInputFiles({
      name: `${PREFIX} Anatomy.pdf`,
      mimeType: 'application/pdf',
      buffer: fs.readFileSync(FIXTURE),
    });
    await expect(page.locator('#pdf-title')).toHaveValue(`${PREFIX} Anatomy`);
    await page.getByTestId('pdf-import-submit').click();

    await page.waitForURL(/\/read\//, { timeout: 15000 });
    await expect(page.getByTestId('pdf-reader')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('pdf-page-indicator')).toHaveText('1 / 2');

    // The word split across lines is one word with two boxes.
    const joined = page.locator('[data-testid="pdf-word"][data-reader-word="перекачивает"]');
    await expect(joined).toHaveCount(1, { timeout: 15000 });

    await overlayWord(page, 'кровь').click();
    const drawer = page.getByTestId('translation-drawer');
    await expect(drawer).toContainText(
      'Сердце — полый мышечный орган, который перекачивает кровь по сосудам.',
    );
    await expect(drawer).not.toContainText('Оно бьётся');

    // A table cell takes its row as the sentence.
    await overlayWord(page, 'Печень').click();
    await expect(drawer).toContainText('Печень | 1500 г');

    // Marking a word known recolours it on the page.
    await overlayWord(page, 'кровь').click();
    await page.keyboard.press('k');
    await expect(overlayWord(page, 'кровь')).toHaveAttribute('data-word-state', 'known');

    // The lesson row in the collection shows a normal word count.
    await page.goto('/');
    await page.getByText(`${PREFIX} Anatomy`).first().click();
    await expect(page.getByText(/\d+ words/).first()).toBeVisible();
  });

  test('extract the text: the PDF becomes a normal lesson and the file is deleted', async ({
    page,
  }) => {
    await openImportDialog(page);
    await page.getByTestId('pdf-file-input').setInputFiles({
      name: `${PREFIX} Text.pdf`,
      mimeType: 'application/pdf',
      buffer: fs.readFileSync(FIXTURE),
    });
    await page.getByTestId('pdf-mode-text').check();
    await expect(page.getByTestId('pdf-text-warning')).toContainText('Tables and figures are lost');
    await page.getByTestId('pdf-import-submit').click();

    await page.waitForURL(/\/read\//, { timeout: 15000 });
    const lessonId = page.url().split('/read/')[1];
    await expect(page.getByTestId('reader-word').filter({ hasText: /^перекачивает$/ })).toBeVisible(
      {
        timeout: 30000,
      },
    );
    await expect(page.getByTestId('pdf-reader')).toHaveCount(0);

    const lesson = await (
      await page.request.get(apiUrl(`/api/lessons/${lessonId}?language=ru`))
    ).json();
    expect(lesson.sourceType).toBeNull();
    expect(lesson.textContent).toContain('Le cœur est un organe musculaire creux.');
    expect(
      (await page.request.get(apiUrl(`/api/lessons/${lessonId}/pdf?language=ru`))).status(),
    ).toBe(404);
  });

  test('the dialog refuses a file that is not a PDF', async ({ page }) => {
    await openImportDialog(page);
    await page.getByTestId('pdf-file-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(page.getByTestId('pdf-import-error')).toHaveText('Choose a .pdf file.');
    await expect(page.getByTestId('pdf-import-submit')).toBeDisabled();

    await page.getByTestId('pdf-file-input').setInputFiles({
      name: 'fake.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('not really a pdf'),
    });
    await page.getByTestId('pdf-import-submit').click();
    await expect(page.getByTestId('pdf-import-error')).toHaveText(
      'The file could not be opened as a PDF.',
    );
  });

  test('the dialog refuses a PDF without text, such as a scan', async ({ page }) => {
    await openImportDialog(page);
    await page.getByTestId('pdf-file-input').setInputFiles({
      name: 'scan.pdf',
      mimeType: 'application/pdf',
      buffer: fs.readFileSync(path.join(__dirname, 'fixtures', 'no-text.pdf')),
    });
    await page.getByTestId('pdf-import-submit').click();
    await expect(page.getByTestId('pdf-import-error')).toContainText(
      'This PDF has no text, so it cannot be imported.',
    );
    await expect(page).not.toHaveURL(/\/read\//);
  });

  test('the reader shows progress while the job runs', async ({ page }) => {
    const { lessonId } = await uploadFixture(page, `${PREFIX} Pending`);
    await page.route(lessonRoute(lessonId), async (route) => {
      const response = await route.fetch();
      const lesson = await response.json();
      await route.fulfill({
        response,
        json: { ...lesson, pdfStatus: 'processing' },
      });
    });
    await page.goto(`/read/${lessonId}`);
    await expect(page.getByTestId('pdf-pending')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('pdf-status')).toHaveText('Reading the PDF…');
  });

  test('a failed job shows the reason and a retry button', async ({ page }) => {
    const { lessonId } = await uploadFixture(page, `${PREFIX} Failed`);
    let failed = true;
    await page.route(lessonRoute(lessonId), async (route) => {
      const response = await route.fetch();
      const lesson = await response.json();
      await route.fulfill({
        response,
        json: failed
          ? {
              ...lesson,
              pdfStatus: 'failed',
              pdfError: 'The file could not be read',
            }
          : lesson,
      });
    });
    let retried = false;
    await page.route(`**/api/lessons/${lessonId}/retry-pdf*`, async (route) => {
      retried = true;
      failed = false;
      await route.fulfill({ json: { success: true } });
    });

    await page.goto(`/read/${lessonId}`);
    await expect(page.getByTestId('pdf-failed')).toContainText('The file could not be read');
    await page.getByTestId('retry-pdf').click();
    expect(retried).toBe(true);
    await expect(page.getByTestId('pdf-reader')).toBeVisible({ timeout: 30000 });
  });

  test('restores the reading page and shows translations beside and on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const { lessonId } = await uploadFixture(page, `${PREFIX} Glosses`);
    await waitReady(page, lessonId);
    await page.request.post(apiUrl('/api/vocab'), {
      data: {
        id: `pdf-e2e-${Date.now()}`,
        text: 'сердце',
        type: 'word',
        sentence: '',
        translation: 'heart',
        state: 'level2',
        stateUpdatedAt: TS,
        reviewCount: 0,
        createdAt: TS,
        pushedToAnki: false,
        language: 'ru',
      },
    });
    await page.request.put(apiUrl(`/api/lessons/${lessonId}/progress?language=ru`), {
      data: { scrollPosition: 2, percentComplete: 100 },
    });

    await page.goto(`/read/${lessonId}`);
    await expect(page.getByTestId('pdf-page-indicator')).toHaveText('2 / 2', { timeout: 15000 });

    await page.getByTestId('gloss-toggle').click();
    await page.getByTestId('gloss-mode-side').click();
    await page.getByTestId('pdf-page-1').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('pdf-side-glosses-1')).toContainText('heart');

    // On a wide screen the list goes beside the page, and the page stays centred.
    await page.setViewportSize({ width: 2400, height: 900 });
    const scroll = await page.getByTestId('pdf-scroll').boundingBox();
    const pageBox = await page.getByTestId('pdf-page-1').boundingBox();
    const sideBox = await page.getByTestId('pdf-side-glosses-1').boundingBox();
    if (!scroll || !pageBox || !sideBox) throw new Error('No layout boxes');
    expect(Math.abs(pageBox.x + pageBox.width / 2 - (scroll.x + scroll.width / 2))).toBeLessThan(
      12,
    );
    expect(sideBox.x).toBeGreaterThan(pageBox.x + pageBox.width);
    await page.setViewportSize({ width: 1600, height: 900 });

    await page.getByTestId('gloss-toggle').click();
    await expect(page.getByTestId('gloss-mode-above')).toHaveText('On hover');
    await page.getByTestId('gloss-mode-above').click();
    await overlayWord(page, 'Сердце').hover();
    await expect(page.getByTestId('pdf-hover-gloss')).toHaveText('heart');
  });

  test('the contents menu and the page field jump to a page', async ({ page }) => {
    const { lessonId } = await uploadFixture(page, `${PREFIX} Contents`, 'pages', OUTLINE_FIXTURE);
    await waitReady(page, lessonId);
    await page.goto(`/read/${lessonId}`);
    const indicator = page.getByTestId('pdf-page-indicator');
    await expect(indicator).toHaveText('1 / 2', { timeout: 15000 });

    await page.getByTestId('pdf-contents').click();
    const items = page.getByTestId('pdf-contents-item');
    await expect(items).toHaveText([
      /Part one: the heart\s*1/,
      /Table of masses\s*1/,
      /Part two: le coeur\s*2/,
    ]);
    await items.filter({ hasText: 'Part two' }).click();
    await expect(indicator).toHaveText('2 / 2');

    await page.getByTestId('pdf-contents').click();
    await expect(items.filter({ hasText: 'Part two' })).toHaveAttribute('aria-current', 'location');
    await page.keyboard.press('Escape');

    await indicator.click();
    await page.getByTestId('pdf-page-input').fill('1');
    await page.keyboard.press('Enter');
    await expect(indicator).toHaveText('1 / 2');

    await indicator.click();
    await page.getByTestId('pdf-page-input').fill('99');
    await page.keyboard.press('Enter');
    await expect(indicator).toHaveText('2 / 2');
  });

  test('a PDF without bookmarks has no contents menu', async ({ page }) => {
    const { lessonId } = await uploadFixture(page, `${PREFIX} No contents`);
    await waitReady(page, lessonId);
    await page.goto(`/read/${lessonId}`);
    await expect(page.getByTestId('pdf-page-indicator')).toHaveText('1 / 2', { timeout: 15000 });
    await expect(page.getByTestId('pdf-contents')).toHaveCount(0);
  });

  test('marks the new words of the current page as known, then ignores the next page', async ({
    page,
  }) => {
    const { lessonId } = await uploadFixture(page, `${PREFIX} Page words`);
    await waitReady(page, lessonId);
    await page.goto(`/read/${lessonId}`);
    await expect(overlayWord(page, 'кровь')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('pdf-page-words').click();
    await page.getByTestId('pdf-page-known').click();
    await expect(page.getByTestId('pdf-page-words-dialog-description')).toContainText(
      'on page 1 will become known',
    );
    await page.getByTestId('pdf-page-words-dialog-confirm').click();
    await expect(overlayWord(page, 'кровь')).toHaveAttribute('data-word-state', 'known');
    await expect(overlayWord(page, 'Печень')).toHaveAttribute('data-word-state', 'known');

    const states = async () =>
      (await (await page.request.get(apiUrl('/api/known-words?language=ru'))).json()) as Record<
        string,
        string
      >;
    expect((await states())['cœur']).toBeUndefined();

    await page.getByTestId('pdf-page-2').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('pdf-page-indicator')).toHaveText('2 / 2');
    await expect(overlayWord(page, 'organe')).toBeVisible();
    await page.getByTestId('pdf-page-words').click();
    await page.getByTestId('pdf-page-ignore').click();
    await page.getByTestId('pdf-page-words-dialog-confirm').click();
    await expect(overlayWord(page, 'organe')).toHaveAttribute('data-word-state', 'ignored');
    await expect.poll(async () => (await states())['organe']).toBe('ignored');
    expect((await states())['кровь']).toBe('known');
    await expect(page.getByTestId('pdf-page-words')).toBeDisabled();
  });

  test('zoom changes the page width and deleting the collection removes the PDF', async ({
    page,
  }) => {
    const { lessonId, collectionId } = await uploadFixture(page, `${PREFIX} Zoom`);
    await waitReady(page, lessonId);
    await page.goto(`/read/${lessonId}`);
    const firstPage = page.getByTestId('pdf-page-1');
    await expect(firstPage).toBeVisible({ timeout: 15000 });
    const before = (await firstPage.boundingBox())!.width;
    await page.getByTestId('pdf-zoom-out').click();
    await expect.poll(async () => (await firstPage.boundingBox())!.width).toBeLessThan(before);

    expect(
      (await page.request.get(apiUrl(`/api/lessons/${lessonId}/pdf?language=ru`))).status(),
    ).toBe(200);
    await page.request.delete(apiUrl(`/api/collections/${collectionId}?language=ru`));
    expect(
      (await page.request.get(apiUrl(`/api/lessons/${lessonId}/pdf?language=ru`))).status(),
    ).toBe(404);
    await page.evaluate(() => localStorage.removeItem('lector-pdf-zoom'));
  });
});
