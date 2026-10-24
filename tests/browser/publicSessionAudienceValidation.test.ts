import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeBrowserAndServer,
  gotoTestPage,
  launchBrowserWithServer,
  simulateProductionAudience,
  startViteTestServer,
} from './browserEngines.ts';

const malformedResponses = [
  { name: 'missing user', body: '{}' },
  { name: 'invalid JSON', body: '{' },
  { name: 'missing role', body: JSON.stringify({ user: {} }) },
  { name: 'array user', body: JSON.stringify({ user: [] }) },
  { name: 'string role', body: JSON.stringify({ user: { isAdmin: 'true' } }) },
];

for (const malformed of malformedResponses) {
  test(`invalid public session response reports unknown (${malformed.name})`, {
    timeout: 30_000,
  }, async () => {
    const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
    let releaseGateResponse!: () => void;
    let markGateRequest!: () => void;
    const gateResponse = new Promise<void>(resolve => { releaseGateResponse = resolve; });
    const gateRequestStarted = new Promise<void>(resolve => { markGateRequest = resolve; });
    let sessionRequests = 0;
    try {
      const page = await browser.newPage();
      await simulateProductionAudience(page);
      await page.route('**/api/auth/session', async route => {
        sessionRequests += 1;
        if (sessionRequests === 1) {
          markGateRequest();
          await gateResponse;
          await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ user: null }),
          });
          return;
        }
        await route.fulfill({
          contentType: 'application/json',
          body: malformed.body,
        });
      });

      await gotoTestPage(page, `${origin}/vibe-atlas`);
      await gateRequestStarted;
      await page.waitForFunction(() => (
        (window as any).__audienceGate?.state() === 'unknown'
      ));
      assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(), 0);
      assert.equal(await page.evaluate(() => (window as any)['ga-disable-G-FHZJ1T74TG']), true);
      await page.evaluate(() => (window as any).gtag('event', 'invalid_session_guard', {}));
      assert.equal(await page.evaluate(() => (
        ((window as any).dataLayer ?? []).some((entry: any) => entry?.[1] === 'invalid_session_guard')
      )), false);

      releaseGateResponse();
      await page.waitForTimeout(25);
      assert.equal(await page.evaluate(() => (window as any).__audienceGate.state()), 'unknown');
    } finally {
      releaseGateResponse();
      await closeBrowserAndServer(browser, server);
    }
  });
}
