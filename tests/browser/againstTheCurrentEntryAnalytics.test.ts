import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeBrowserAndServer,
  gotoTestPage,
  launchBrowserWithServer,
  startViteTestServer,
  simulateProductionAudience,
} from './browserEngines.ts';

type RecordedEvent = { name: string; data?: Record<string, string> };

test('GA4 distinguishes the new spotlight from the continuing Field Journal', { timeout: 90_000 }, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(8_000);
    await simulateProductionAudience(page);
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
    await page.getByRole('link', { name: /Meet the new focus \(English\)/ }).click();
    await page.waitForURL(`${origin}/c-drama-fandom/vibing-now/`);
    assert.deepEqual(await clicks(), [], 'the new focus is not misattributed to the retired journal');

    await gotoTestPage(page, origin);
    await captureClicks();
    await page.getByRole('link', { name: /Open the Field Journal \(English\)/ }).click();
    await page.waitForURL(`${origin}/cdrama-fandom/vibing-now/field-journals/against-the-current/`);
    assert.deepEqual((await clicks()).at(-1), {
      name: 'against_the_current_entry_clicked', data: { placement: 'homepage_feature' },
    });

    await gotoTestPage(page, `${origin}/c-drama-fandom/`);
    await captureClicks();
    await page.getByRole('link', { name: /Against the Current continues in its Field Journal/ }).click();
    await page.waitForURL(`${origin}/cdrama-fandom/vibing-now/field-journals/against-the-current/`);
    assert.deepEqual((await clicks()).at(-1), {
      name: 'against_the_current_entry_clicked', data: { placement: 'guide_feature' },
    });

    const beforeDirectJournalVisit = (await clicks()).length;
    await gotoTestPage(page, `${origin}/cdrama-fandom/vibing-now/field-journals/against-the-current/`);
    await captureClicks();
    assert.equal((await clicks()).length, beforeDirectJournalVisit, 'direct journal visits are not click events');

    for (const [label, slug, installment] of [
      ['Safe through Episode 21', 'against-the-current-episode-21', 'episode_21'],
      ['Safe through Episodes 22–25', 'against-the-current-episodes-22-25', 'episodes_22_25'],
      ['Safe through Episodes 26–29', 'against-the-current-episodes-26-29', 'episodes_26_29'],
      ['Safe through Episodes 30–31', 'against-the-current-episodes-30-31', 'episodes_30_31'],
      ['Safe through Episodes 32–33', 'against-the-current-episodes-32-33', 'episodes_32_33'],
      ['Safe through Episodes 34–38: Read the installment', 'against-the-current-episodes-34-38', 'episodes_34_38'],
    ]) {
      await gotoTestPage(page, `${origin}/cdrama-fandom/vibing-now/field-journals/against-the-current/`);
      await captureClicks();
      await page.getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(`${origin}/c-drama-fandom/vibing-now/${slug}/`);
      assert.deepEqual((await clicks()).at(-1), {
        name: 'against_the_current_installment_selected', data: { installment },
      });
    }
    assert.equal((await clicks()).length, 8, 'direct visits must not be recorded as feature clicks');
    assert.deepEqual(Object.keys((await clicks())[0].data ?? {}), ['placement']);

  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('current-focus and Field Journal links navigate even when GA4 is unavailable or throws', { timeout: 60_000 }, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    for (const broken of [false, true]) {
      const page = await browser.newPage();
      await simulateProductionAudience(page);
      const disableOrBreakAnalytics = async () => {
        if (broken) await page.evaluate(() => {
          (window as Window & { gtag?: () => void }).gtag = () => { throw new Error('unavailable'); };
        });
        else await page.evaluate(() => {
          const analytics = window as Window & { gtag?: () => void; dataLayer?: unknown[] };
          analytics.gtag = undefined;
          analytics.dataLayer = undefined;
        });
      };

      await gotoTestPage(page, `${origin}/c-drama-fandom/`);
      await disableOrBreakAnalytics();
      await page.getByRole('link', { name: /Where the Mask Ends: Vibing Now/ }).click();
      await page.waitForURL(`${origin}/c-drama-fandom/vibing-now/`);

      await gotoTestPage(page, `${origin}/c-drama-fandom/`);
      await disableOrBreakAnalytics();
      await page.getByRole('link', { name: /Against the Current continues in its Field Journal/ }).click();
      await page.waitForURL(`${origin}/cdrama-fandom/vibing-now/field-journals/against-the-current/`);
      await page.close();
    }

  } finally {
    await closeBrowserAndServer(browser, server);
  }
});