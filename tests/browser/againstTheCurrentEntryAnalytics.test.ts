import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeBrowserAndServer,
  gotoTestPage,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';

type RecordedEvent = { name: string; data?: Record<string, string> };

test('GA4 distinguishes feature entries and installment choices from direct shelf visits', { timeout: 90_000 }, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(8_000);
    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    // Each page replaces gtag at startup. Capture only clicks made after the page has loaded.
    const captureClicks = async () => {
      await page.evaluate(() => {
        const analytics = window as Window & {
          gtag?: (command: string, name: string, data?: Record<string, string>) => void;
        };
        const original = analytics.gtag;
        analytics.gtag = (command, name, data) => {
          if (command === 'event' && name.startsWith('against_the_current_')) {
            const events = JSON.parse(sessionStorage.getItem('__seriesClicks') ?? '[]');
            sessionStorage.setItem('__seriesClicks', JSON.stringify([...events, { name, data }]));
          }
          original?.(command, name, data);
        };
      });
    };
    const clicks = async (): Promise<RecordedEvent[]> =>
      page.evaluate(() => JSON.parse(sessionStorage.getItem('__seriesClicks') ?? '[]'));

    // The next link assertion waits for the actual UI. Font/other external
    // resource load completion is not part of this click-tracking contract.
    await gotoTestPage(page, origin, { waitUntil: 'domcontentloaded' });
    await captureClicks();
    await page.getByRole('link', { name: /Explore the Against the Current series/ }).click();
    await page.waitForURL(`${origin}/c-drama-fandom/vibing-now/`);
    assert.deepEqual(await clicks(), [
      { name: 'against_the_current_entry_clicked', data: { placement: 'homepage_feature' } },
    ]);

    await gotoTestPage(page, `${origin}/c-drama-fandom/`);
    await captureClicks();
    await page.getByRole('link', { name: 'Against the Current: Vibing Now' }).click();
    await page.waitForURL(`${origin}/c-drama-fandom/vibing-now/`);
    assert.deepEqual((await clicks()).at(-1), {
      name: 'against_the_current_entry_clicked', data: { placement: 'guide_feature' },
    });

    await gotoTestPage(page, `${origin}/c-drama-fandom/`);
    await captureClicks();
    await page.getByRole('link', { name: /Choose your Against the Current reading/ }).click();
    await page.waitForURL(`${origin}/c-drama-fandom/vibing-now/`);
    assert.deepEqual((await clicks()).at(-1), {
      name: 'against_the_current_entry_clicked', data: { placement: 'guide_feature' },
    });

    for (const [label, slug, installment] of [
      ['Read the Episode 21 vibe check', 'against-the-current-episode-21', 'episode_21'],
      ['Safe through Episodes 22–25: Read the installment', 'against-the-current-episodes-22-25', 'episodes_22_25'],
      ['Safe through Episodes 26–29: Read the installment', 'against-the-current-episodes-26-29', 'episodes_26_29'],
      ['Safe through Episodes 30–31: Read the installment', 'against-the-current-episodes-30-31', 'episodes_30_31'],
      ['Safe through Episodes 32–33: Read the installment', 'against-the-current-episodes-32-33', 'episodes_32_33'],
      ['Safe through Episodes 34–38: Read the installment', 'against-the-current-episodes-34-38', 'episodes_34_38'],
    ]) {
      await gotoTestPage(page, `${origin}/c-drama-fandom/vibing-now/`);
      await captureClicks();
      await page.getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(`${origin}/c-drama-fandom/vibing-now/${slug}/`);
      assert.deepEqual((await clicks()).at(-1), {
        name: 'against_the_current_installment_selected', data: { installment },
      });
    }
    assert.equal((await clicks()).length, 9, 'direct visits must not be recorded as feature clicks');
    assert.deepEqual(Object.keys((await clicks())[0].data ?? {}), ['placement']);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('series links navigate even when GA4 is unavailable or throws', { timeout: 60_000 }, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    for (const broken of [false, true]) {
      const page = await browser.newPage();
      await page.route('https://www.googletagmanager.com/**', route => route.abort());
      await gotoTestPage(page, `${origin}/c-drama-fandom/`);
      if (broken) await page.evaluate(() => {
        (window as Window & { gtag?: () => void }).gtag = () => { throw new Error('unavailable'); };
      });
      else await page.evaluate(() => {
        const analytics = window as Window & { gtag?: () => void; dataLayer?: unknown[] };
        analytics.gtag = undefined;
        analytics.dataLayer = undefined;
      });
      await page.getByRole('link', { name: /Choose your Against the Current reading/ }).click();
      await page.waitForURL(`${origin}/c-drama-fandom/vibing-now/`);
      await page.close();
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});