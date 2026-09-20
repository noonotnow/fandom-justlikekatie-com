import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Route } from '@playwright/test';
import {
  closeBrowserAndServer,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';

function edition(date: string, actorName: string) {
  return {
    date,
    actorName,
    actorShortNameEn: actorName,
    vibeEmoji: '✨',
    vibeLabel: `${actorName} Vibe`,
    vibeLabelEn: `${actorName} Vibe`,
    vibeSubtitleEn: '',
    access: 'free',
  };
}

test('archive pagination appends unique editions and preserves the global count', { timeout: 30_000 }, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(10_000);

    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Sign in is required.' }),
    }));
    await page.route('**/.netlify/functions/image-proxy**', route => route.abort());

    let firstPageRoute: Route | undefined;
    let secondPageRoute: Route | undefined;
    await page.route('**/.netlify/functions/star-of-day?*', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('archive') !== '1') {
        void route.abort();
        return;
      }
      if (url.searchParams.get('cursor') === 'page-2') {
        secondPageRoute = route;
      } else {
        firstPageRoute = route;
      }
    });

    await page.goto(`${origin}/vibe-atlas/archive`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Loading published editions…', { exact: true }).waitFor();
    await assert.doesNotReject(async () => {
      await page.waitForFunction(() => Boolean(document.querySelector('.atlas-archive-page')));
    });
    assert.ok(firstPageRoute, 'opening the archive should request its first page');

    await firstPageRoute.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        editions: [
          edition('2026-09-20', 'First Actor'),
          edition('2026-09-19', 'Second Actor'),
        ],
        page: { nextCursor: 'page-2', hasMore: true, total: 4 },
      }),
    });

    await page.getByRole('button', { name: 'Load more editions' }).waitFor();
    assert.equal(
      await page.getByLabel('Archive summary').getByText('4', { exact: true }).count(),
      1,
      'the archive summary should show the global edition count',
    );

    await page.getByRole('button', { name: 'Load more editions' }).click();
    const loadingButton = page.getByRole('button', { name: 'Loading editions…' });
    await loadingButton.waitFor();
    assert.equal(await loadingButton.isDisabled(), true, 'load more should be disabled while the next page loads');
    assert.ok(secondPageRoute, 'loading more should request the next cursor');

    await secondPageRoute.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        editions: [
          edition('2026-09-19', 'Second Actor'),
          edition('2026-09-18', 'Third Actor'),
          edition('2026-09-17', 'Fourth Actor'),
        ],
        page: { nextCursor: null, hasMore: false, total: 4 },
      }),
    });

    await page.locator('.archive-card time[datetime="2026-09-17"]').waitFor();
    assert.deepEqual(
      await page.locator('.archive-card time').evaluateAll(
        times => times.map(time => time.getAttribute('datetime')),
      ),
      ['2026-09-20', '2026-09-19', '2026-09-18', '2026-09-17'],
      'existing editions should remain first and unique older editions should append in order',
    );
    assert.equal(
      await page.locator('.archive-card time[datetime="2026-09-19"]').count(),
      1,
      'a date repeated by the next page must not render twice',
    );
    assert.equal(
      await page.getByLabel('Archive summary').getByText('4', { exact: true }).count(),
      1,
      'loading another page must preserve the global edition count',
    );
    assert.equal(
      await page.getByRole('button', { name: /Load more editions|Loading editions/ }).count(),
      0,
      'the load-more control should disappear at the end of the archive',
    );
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});