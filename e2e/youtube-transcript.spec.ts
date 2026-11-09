import { test, expect } from '@playwright/test';
import { apiUrl } from './api';

// YouTube transcript import (#334). The Hono API serves fixtures via
// LECTOR_YOUTUBE_FIXTURE (playwright.config.ts) instead of live YouTube, so
// these never touch the network. Fixture videos:
//   vid00000010 — "Klein Rooikappie", Afrikaans creator + auto-generated tracks
//   vid00000011 — no captions
const VIDEO_URL = 'https://www.youtube.com/watch?v=vid00000010';
const NO_CAPTIONS_URL = 'https://youtu.be/vid00000011';

// These drive the API's LECTOR_YOUTUBE_FIXTURE seam, set only on the dev
// webServer (playwright.config.ts). The production Docker image run
// (E2E_EXTERNAL_SERVER) has no fixture env — importing there would hit live
// YouTube, which CI must never do — so skip, exactly like starter-content.spec.
const externalServer = !!process.env.E2E_EXTERNAL_SERVER;

async function cleanupImports(page: import('@playwright/test').Page) {
  const res = await page.request.get(apiUrl('/api/collections'));
  const collections = await res.json();
  for (const c of collections) {
    if (['Klein Rooikappie', 'Geen onderskrifte'].includes(c.title)) {
      await page.request.delete(apiUrl(`/api/collections/${c.id}`));
    }
  }
}

test.describe('YouTube transcript import', () => {
  test.skip(externalServer, 'transcript-import fixtures are not shipped in the production image');

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await cleanupImports(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupImports(page);
  });

  test('imports a captioned video and renders a timestamped, seekable transcript', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByText('YouTube Transcript').click();

    await page.getByTestId('yt-url-input').fill(VIDEO_URL);
    await page.getByTestId('yt-find-captions').click();

    // Both caption tracks are offered, creator distinguished from auto-generated.
    const options = page.getByTestId('yt-track-option');
    await expect(options).toHaveCount(2);
    await expect(page.getByText('Creator captions', { exact: true })).toBeVisible();
    await expect(page.getByText('Auto-generated', { exact: true })).toBeVisible();

    // Import the creator track → navigates to the reader.
    await options.first().click();

    await expect(page.getByTestId('transcript-reader')).toBeVisible({ timeout: 15000 });
    const segments = page.getByTestId('transcript-segment');
    await expect(segments).toHaveCount(3);

    // Timestamps are rendered per cue.
    const timestamps = page.getByTestId('transcript-timestamp');
    await expect(timestamps.nth(0)).toContainText('0:00');
    await expect(timestamps.nth(1)).toContainText('0:03');
    await expect(timestamps.nth(2)).toContainText('0:07');

    // The embedded player is present, keyed to the source video — never hosted.
    const player = page.getByTestId('yt-player');
    await expect(player).toHaveAttribute('data-video-id', 'vid00000010');

    // Clicking a cue's timestamp seeks the player to that second.
    await timestamps.nth(1).click();
    await expect(player).toHaveAttribute('data-seek-seconds', '3');
    await expect(segments.nth(1)).toHaveAttribute('data-active-segment', 'true');
  });

  test('a transcript word is clickable and opens the translation drawer', async ({ page }) => {
    // Import via the API (fixtures) for speed, then open the reader.
    const res = await page.request.post(apiUrl('/api/import/youtube'), {
      data: { url: VIDEO_URL, languageCode: 'af', kind: 'standard', language: 'af' },
    });
    expect(res.ok()).toBeTruthy();
    const { lessonId } = await res.json();

    await page.goto(`/read/${lessonId}`);
    await expect(page.getByTestId('transcript-reader')).toBeVisible({ timeout: 15000 });

    const word = page.getByTestId('reader-word').filter({ hasText: 'Eendag' }).first();
    await word.click();
    await expect(word).toHaveAttribute('data-active-word', 'true');
    await expect(page.getByTestId('translation-drawer')).toBeVisible();
  });

  test('pre-seeded known words highlight in the transcript', async ({ page }) => {
    // Seed "die" as known before importing (active-language rules apply).
    await page.request.post(apiUrl('/api/vocab'), {
      data: { text: 'die', type: 'word', state: 'known', language: 'af' },
    });

    const res = await page.request.post(apiUrl('/api/import/youtube'), {
      data: { url: VIDEO_URL, languageCode: 'af', kind: 'standard', language: 'af' },
    });
    const { lessonId } = await res.json();

    await page.goto(`/read/${lessonId}`);
    await expect(page.getByTestId('transcript-reader')).toBeVisible({ timeout: 15000 });

    // "die" appears in cues 2 and 3; both instances render with the known state.
    const die = page.getByTestId('reader-word').filter({ hasText: /^die$/ });
    await expect(die.first()).toHaveAttribute('data-word-state', 'known');

    // Cleanup the seeded vocab.
    const vocab = await (await page.request.get(apiUrl('/api/vocab?state=known'))).json();
    for (const v of vocab) {
      if (v.text === 'die') await page.request.delete(apiUrl(`/api/vocab/${v.id}`));
    }
  });

  test('shows actionable errors for invalid URLs and missing captions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByText('YouTube Transcript').click();

    // Not a YouTube URL.
    await page.getByTestId('yt-url-input').fill('https://example.com/watch?v=nope');
    await page.getByTestId('yt-find-captions').click();
    await expect(page.getByTestId('yt-import-error')).toContainText(/YouTube video URL/i);

    // A real YouTube video with no captions.
    await page.getByText('Try again').click();
    await page.getByTestId('yt-url-input').fill(NO_CAPTIONS_URL);
    await page.getByTestId('yt-find-captions').click();
    await expect(page.getByTestId('yt-import-error')).toContainText(/no available transcript/i);
  });
});

test.describe('YouTube transcript follows the video', () => {
  test.skip(externalServer, 'transcript-import fixtures are not shipped in the production image');

  const FAKE_IFRAME_API = `
    window.__ytTime = 0;
    window.YT = {
      Player: function (iframe, options) {
        this.getCurrentTime = () => window.__ytTime;
        setTimeout(() => {
          options.events.onReady();
          window.__ytReady = true;
        }, 0);
      },
    };
    window.onYouTubeIframeAPIReady();
  `;
  const LONG_SEGMENTS = Array.from({ length: 60 }, (_, index) => ({
    start: index * 2,
    end: index * 2 + 2,
    text: `Reël nommer ${index}`,
  }));

  const setVideoTime = (page: import('@playwright/test').Page, seconds: number) =>
    page.evaluate((value) => {
      (window as unknown as { __ytTime: number }).__ytTime = value;
    }, seconds);

  async function importLesson(page: import('@playwright/test').Page): Promise<string> {
    const res = await page.request.post(apiUrl('/api/import/youtube'), {
      data: { url: VIDEO_URL, languageCode: 'af', kind: 'standard', language: 'af' },
    });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).lessonId;
  }

  async function openWithFakePlayer(page: import('@playwright/test').Page, lessonId: string) {
    await page.route('https://www.youtube.com/iframe_api', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: FAKE_IFRAME_API }),
    );
    await page.goto(`/read/${lessonId}`);
    await expect(page.getByTestId('transcript-reader')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => (window as unknown as { __ytReady?: boolean }).__ytReady);
  }

  async function useLongTranscript(page: import('@playwright/test').Page, lessonId: string) {
    await page.route(`**/api/lessons/${lessonId}`, async (route) => {
      const response = await route.fetch();
      const lesson = await response.json();
      await route.fulfill({
        response,
        json: { ...lesson, segments: JSON.stringify(LONG_SEGMENTS) },
      });
    });
  }

  const scrollTop = (page: import('@playwright/test').Page) =>
    page.getByTestId('transcript-reader').evaluate((el) => el.parentElement?.scrollTop ?? 0);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await cleanupImports(page);
    await page.route('https://www.youtube.com/embed/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }),
    );
  });
  test.afterEach(async ({ page }) => {
    await cleanupImports(page);
  });

  test('highlights the current line and follows jumps in both directions', async ({ page }) => {
    await openWithFakePlayer(page, await importLesson(page));
    const segments = page.getByTestId('transcript-segment');

    await expect(page.locator('[data-active-segment]')).toHaveCount(0);

    await setVideoTime(page, 3.5);
    await expect(segments.nth(1)).toHaveAttribute('data-active-segment', 'true');

    await setVideoTime(page, 7.5);
    await expect(segments.nth(2)).toHaveAttribute('data-active-segment', 'true');
    await expect(segments.nth(1)).not.toHaveAttribute('data-active-segment');

    await setVideoTime(page, 0.5);
    await expect(segments.nth(0)).toHaveAttribute('data-active-segment', 'true');
    await expect(segments.nth(2)).not.toHaveAttribute('data-active-segment');
  });

  test('keeps the active line visible below the sticky video', async ({ page }) => {
    const lessonId = await importLesson(page);
    await useLongTranscript(page, lessonId);
    await openWithFakePlayer(page, lessonId);

    await setVideoTime(page, 100);
    const row = page.getByTestId('transcript-segment').nth(50);
    await expect(row).toHaveAttribute('data-active-segment', 'true');

    await expect
      .poll(async () => {
        const rowBox = await row.boundingBox();
        const playerBox = await page.getByTestId('yt-player').boundingBox();
        if (!rowBox || !playerBox) return false;
        return rowBox.y >= playerBox.y + playerBox.height && rowBox.y + rowBox.height <= 900;
      })
      .toBe(true);
  });

  test('does not move the reading position when the lesson opens', async ({ page }) => {
    const lessonId = await importLesson(page);
    await useLongTranscript(page, lessonId);
    await openWithFakePlayer(page, lessonId);

    await page.getByTestId('transcript-reader').evaluate((el) => {
      if (el.parentElement) el.parentElement.scrollTop = 500;
    });
    await page.waitForTimeout(600);

    expect(await scrollTop(page)).toBe(500);
    await expect(page.locator('[data-active-segment]')).toHaveCount(0);
  });

  test('does not scroll while the translation drawer is open', async ({ page }) => {
    const lessonId = await importLesson(page);
    await useLongTranscript(page, lessonId);
    await page.route('**/api/translate/gloss', (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: '[translated]' }),
    );
    await openWithFakePlayer(page, lessonId);

    await page.getByTestId('reader-word').filter({ hasText: 'Reël' }).first().click();
    await expect(page.getByTestId('translation-drawer')).toHaveClass(/translate-x-0/);
    const before = await scrollTop(page);

    await setVideoTime(page, 100);
    await expect(page.getByTestId('transcript-segment').nth(50)).toHaveAttribute(
      'data-active-segment',
      'true',
    );
    await page.waitForTimeout(600);

    expect(await scrollTop(page)).toBe(before);
  });

  test('timestamps still seek when the YouTube script is blocked', async ({ page }) => {
    const lessonId = await importLesson(page);
    await page.route('https://www.youtube.com/iframe_api', (route) => route.abort());

    await page.goto(`/read/${lessonId}`);
    await expect(page.getByTestId('transcript-reader')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('transcript-timestamp').nth(1).click();
    await expect(page.getByTestId('yt-player')).toHaveAttribute('data-seek-seconds', '3');
    await expect(page.getByTestId('transcript-segment').nth(1)).toHaveAttribute(
      'data-active-segment',
      'true',
    );
  });

  test('can be turned off, and remembers the choice', async ({ page }) => {
    const lessonId = await importLesson(page);
    await useLongTranscript(page, lessonId);
    await openWithFakePlayer(page, lessonId);
    const toggle = page.getByTestId('transcript-follow-toggle');
    const segments = page.getByTestId('transcript-segment');
    const active = page.locator('[data-active-segment]');
    await expect(toggle).toHaveText('Follow video: On');

    await setVideoTime(page, 100);
    await expect(segments.nth(50)).toHaveAttribute('data-active-segment', 'true');

    await toggle.click();
    await expect(toggle).toHaveText('Follow video: Off');
    await expect(active).toHaveCount(0);
    await page.waitForTimeout(600);
    const before = await scrollTop(page);

    await setVideoTime(page, 20);
    await page.waitForTimeout(600);
    await expect(active).toHaveCount(0);
    expect(await scrollTop(page)).toBe(before);

    await page.getByTestId('transcript-timestamp').nth(50).click();
    await expect(page.getByTestId('yt-player')).toHaveAttribute('data-seek-seconds', '100');
    await expect(segments.nth(50)).toHaveAttribute('data-active-segment', 'true');

    await page.reload();
    await expect(page.getByTestId('transcript-reader')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => (window as unknown as { __ytReady?: boolean }).__ytReady);
    await expect(toggle).toHaveText('Follow video: Off');

    await toggle.click();
    await expect(toggle).toHaveText('Follow video: On');
    await setVideoTime(page, 40);
    await expect(segments.nth(20)).toHaveAttribute('data-active-segment', 'true');
  });

  test('switches the player between two sizes and remembers the choice', async ({ page }) => {
    await openWithFakePlayer(page, await importLesson(page));
    const toggle = page.getByTestId('transcript-player-size-toggle');
    const player = page.getByTestId('yt-player');
    await expect(toggle).toHaveText('Video size: Normal');
    const normal = await player.boundingBox();

    await toggle.click();
    await expect(toggle).toHaveText('Video size: Large');
    await expect
      .poll(async () => (await player.boundingBox())?.width ?? 0)
      .toBeGreaterThan(normal?.width ?? Infinity);
    expect((await player.boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(900 * 0.6 + 1);

    await page.reload();
    await expect(page.getByTestId('transcript-reader')).toBeVisible({ timeout: 15000 });
    await expect(toggle).toHaveText('Video size: Large');

    await toggle.click();
    await expect(toggle).toHaveText('Video size: Normal');
  });

  test('hides the player size switch on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await openWithFakePlayer(page, await importLesson(page));

    await expect(page.getByTestId('transcript-player-size-toggle')).toBeHidden();
    await expect(page.getByTestId('transcript-follow-toggle')).toBeVisible();
  });
});
