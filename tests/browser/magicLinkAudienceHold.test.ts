import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BROWSER_ENGINES,
  closeBrowserAndServer,
  gotoTestPage,
  launchBrowserWithServer,
  simulateProductionAudience,
  startViteTestServer,
} from './browserEngines.ts';

const OPERATOR_USER = {
  accountId: 'audience-hold-operator',
  email: 'operator@example.test',
  isAdmin: true,
};

for (const locale of [
  { name: 'English', path: '/auth/verify' },
  { name: 'Simplified Chinese', path: '/zh-cn/auth/verify' },
]) {
  test(`magic-link audience hold discards a stale session read in ${locale.name}`, {
    timeout: 45_000,
  }, async () => {
    const [{ server, origin }, browser] = await launchBrowserWithServer(
      startViteTestServer(),
      BROWSER_ENGINES[0].type,
    );
    let releaseStaleSession!: () => void;
    let markStaleStarted!: () => void;
    let releaseVerification!: () => void;
    let markVerificationStarted!: () => void;
    const staleSession = new Promise<void>(resolve => { releaseStaleSession = resolve; });
    const staleStarted = new Promise<void>(resolve => { markStaleStarted = resolve; });
    const verificationResponse = new Promise<void>(resolve => { releaseVerification = resolve; });
    const verificationStarted = new Promise<void>(resolve => { markVerificationStarted = resolve; });
    let verified = false;
    try {
      const page = await browser.newPage();
      await simulateProductionAudience(page);
      await page.route('**/api/auth/session', async route => {
        if (!verified) {
          markStaleStarted();
          await staleSession;
          await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ user: null }),
          });
          return;
        }
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ user: OPERATOR_USER }),
        });
      });
      await page.route('**/api/auth/verify', async route => {
        markVerificationStarted();
        await verificationResponse;
        verified = true;
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      });

      await gotoTestPage(page, `${origin}${locale.path}#token=callback-token&next=admin`);
      await staleStarted;
      await verificationStarted;
      await page.waitForFunction(() => (window as any).__audienceGate?.verificationInProgress() === true);
      assert.equal(await page.evaluate(() => (window as any).__audienceGate.state()), 'unknown');
      assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(), 0);

      releaseVerification();
      await page.waitForFunction(() => (
        (window as any).__audienceGate?.verificationInProgress() === false
        && (window as any).__audienceGate?.state() === 'operator'
      ));
      assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(), 0);
      releaseStaleSession();
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => (window as any).__audienceGate.state()), 'operator');
      assert.equal(await page.locator('script[src*="googletagmanager.com"]').count(), 0);
    } finally {
      releaseVerification();
      releaseStaleSession();
      await closeBrowserAndServer(browser, server);
    }
  });
}
