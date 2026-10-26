import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeBrowserAndServer,
  gotoTestPage,
  launchBrowserWithServer,
  simulateProductionAudience,
  startViteTestServer,
} from './browserEngines.ts';

test('LG01 drops suppressed events at emission and does not replay them after a public transition', {
  timeout: 30_000,
}, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  let stage = 'browser setup';
  try {
    const page = await browser.newPage();
    let sessionUser: unknown = { isAdmin: true };
    stage = 'production simulation';
    await simulateProductionAudience(page, sessionUser as { isAdmin?: boolean });
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: sessionUser }),
    }));
    stage = 'page load';
    await gotoTestPage(page, `${origin}/c-drama-fandom/fandom-games/`, { waitUntil: 'domcontentloaded' });
    stage = 'operator classification';
    await page.waitForFunction(() => (window as any).__audienceGate?.state() === 'operator');

    stage = 'operator event';
    await page.locator('[data-fate="moonlit-strategist"]').click();
    sessionUser = { isAdmin: 'true' };
    stage = 'unknown classification';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => (window as any).__audienceGate?.state() === 'unknown');
    stage = 'unknown event';
    await page.locator('[data-fate="exiled-immortal"]').click();

    sessionUser = { isAdmin: false };
    stage = 'public classification';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => (window as any).__audienceGate?.state() === 'public');
    stage = 'public event';
    await page.locator('[data-fate="chaos-prince"]').click();

    stage = 'event assertion';
    const gameEvents = await page.evaluate(() => (
      ((window as any).dataLayer ?? [])
        .filter((event: any) => event?.event?.startsWith('fandom_game_'))
    ));
    assert.deepEqual(gameEvents, [{
      event: 'fandom_game_reveal',
      fandom_content_id: 'lg01-v1',
      fandom_outcome_id: 'chaos-prince',
      fandom_source: 'direct',
    }]);
  } catch (error) {
    throw new Error(`${stage}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});
