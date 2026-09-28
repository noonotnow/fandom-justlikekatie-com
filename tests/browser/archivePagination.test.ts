import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Route } from '@playwright/test';
import {
  BROWSER_ENGINES,
  closeBrowserAndServer,
  gotoTestPage,
  launchBrowserWithServer,
  startViteTestServer,
  type BrowserEngine,
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

async function assertFirstPageRetry(engine: BrowserEngine): Promise<void> {
  const [{ server, origin }, browser] = await launchBrowserWithServer(
    startViteTestServer(),
    engine.type,
  );
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(20_000);

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

    let archiveAttempts = 0;
    let allowArchiveSuccess = false;
    await page.route('**/.netlify/functions/star-of-day?*', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('archive') !== '1') {
        void route.abort();
        return;
      }
      archiveAttempts += 1;
      if (!allowArchiveSuccess) {
        void route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporarily unavailable' }),
        });
        return;
      }
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          editions: [
            edition('2026-09-20', 'First Actor'),
            edition('2026-09-19', 'Second Actor'),
          ],
          page: { nextCursor: null, hasMore: false, total: 2 },
        }),
      });
    });

    await gotoTestPage(page, `${origin}/vibe-atlas/archive`, { waitUntil: 'domcontentloaded' });

    await page.getByRole('alert').getByText('Couldn’t load the archive. Try again.').waitFor();
    assert.equal(
      archiveAttempts,
      1,
      'development Strict Mode should share the in-flight first-page request',
    );

    allowArchiveSuccess = true;
    await page.getByRole('button', { name: 'Retry loading the archive' }).click();
    await page.locator('.archive-card time[datetime="2026-09-19"]').waitFor();

    assert.equal(
      archiveAttempts,
      2,
      'retry should make exactly one new first-page request after the failure settles',
    );
    assert.deepEqual(
      await page.locator('.archive-card time').evaluateAll(
        times => times.map(time => time.getAttribute('datetime')),
      ),
      ['2026-09-20', '2026-09-19'],
      'a successful retry should render the first page of editions',
    );
  } finally {
    await closeBrowserAndServer(browser, server);
  }
}

for (const engine of BROWSER_ENGINES) {
  test(
    `archive retries its first page after an empty-state failure in ${engine.name}`,
    { timeout: 60_000 },
    () => assertFirstPageRetry(engine),
  );
}

async function assertArchivePagination(engine: BrowserEngine): Promise<void> {
  const [{ server, origin }, browser] = await launchBrowserWithServer(
    startViteTestServer(),
    engine.type,
  );
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
    let secondPageAttempts = 0;
    let retryRoute: Route | undefined;
    await page.route('**/.netlify/functions/star-of-day?*', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('archive') !== '1') {
        void route.abort();
        return;
      }
      if (url.searchParams.get('cursor') === 'page-2') {
        secondPageAttempts += 1;
        if (secondPageAttempts === 1) {
          void route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Temporarily unavailable' }),
          });
        } else {
          retryRoute = route;
        }
      } else {
        firstPageRoute = route;
      }
    });

    await gotoTestPage(page, `${origin}/vibe-atlas/archive`, { waitUntil: 'domcontentloaded' });
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
    await page.getByRole('alert').getByText('Couldn’t load more editions. Try again.').waitFor();
    assert.deepEqual(
      await page.locator('.archive-card time').evaluateAll(
        times => times.map(time => time.getAttribute('datetime')),
      ),
      ['2026-09-20', '2026-09-19'],
      'a failed next page must leave the loaded editions visible',
    );
    assert.equal(secondPageAttempts, 1, 'loading more should request the next cursor once');

    await page.getByRole('button', { name: 'Retry loading editions' }).evaluate(button => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    const loadingButton = page.getByRole('button', { name: 'Loading editions…' });
    await loadingButton.waitFor();
    assert.equal(await loadingButton.isDisabled(), true, 'load more should be disabled while the retry loads');
    assert.equal(
      secondPageAttempts,
      2,
      'concurrent retries for the same cursor should share one network request',
    );
    assert.ok(retryRoute, 'retrying should expose the next page response');

    await retryRoute.fulfill({
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
}

async function assertOverlappingArchiveLoads(engine: BrowserEngine): Promise<void> {
  const [{ server, origin }, browser] = await launchBrowserWithServer(
    startViteTestServer(),
    engine.type,
  );
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(10_000);

    let firstPageAttempts = 0;
    let secondPageRoute: Route | undefined;
    await page.route('**/.netlify/functions/star-of-day?*', route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('archive') !== '1') {
        void route.abort();
        return;
      }
      if (url.searchParams.get('cursor') === 'page-2') {
        secondPageRoute = route;
        return;
      }

      firstPageAttempts += 1;
      if (firstPageAttempts === 1) {
        void route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            editions: [edition('2026-09-20', 'First Actor')],
            page: { nextCursor: 'page-2', hasMore: true, total: 2 },
          }),
        });
        return;
      }
      void route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporarily unavailable' }),
      });
    });

    await gotoTestPage(page, origin, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({
      type: 'module',
      content: `
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDomClient from '/node_modules/.vite/deps/react-dom_client.js';
        import { useStarOfDay } from '/src/hooks/useStarOfDay.ts';

        const rootElement = document.createElement('div');
        rootElement.id = 'archive-hook-harness';
        document.body.replaceChildren(rootElement);

        const Harness = () => {
          const archive = useStarOfDay(undefined);
          return React.createElement(
            React.Fragment,
            null,
            React.createElement('output', { id: 'archive-loading' }, String(archive.archiveLoading)),
            React.createElement('output', { id: 'archive-error' }, archive.archiveError ?? ''),
            React.createElement('button', { id: 'load-first', onClick: archive.loadArchive }, 'Load first'),
            React.createElement('button', { id: 'load-more', onClick: archive.loadMoreArchive }, 'Load more'),
          );
        };

        ReactDomClient.createRoot(rootElement).render(React.createElement(Harness));
      `,
    });

    await page.locator('#load-first').click();
    await page.locator('#load-more').click();
    await page.waitForFunction(() => Boolean(
      document.querySelector('#archive-loading')?.textContent === 'true',
    ));
    assert.ok(secondPageRoute, 'loading more should leave the next cursor request pending');

    await page.locator('#load-first').click();
    await page.waitForFunction(() => Boolean(
      document.querySelector('#archive-error')?.textContent?.includes('503'),
    ));
    assert.equal(
      await page.locator('#archive-loading').textContent(),
      'true',
      'a failed first-page request must not clear loading for a pending cursor request',
    );

    await secondPageRoute.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        editions: [edition('2026-09-19', 'Second Actor')],
        page: { nextCursor: null, hasMore: false, total: 2 },
      }),
    });
    await page.waitForFunction(() => document.querySelector('#archive-loading')?.textContent === 'false');
  } finally {
    await closeBrowserAndServer(browser, server);
  }
}

for (const engine of BROWSER_ENGINES) {
  test(
    `archive pagination appends unique editions and preserves the global count in ${engine.name}`,
    { timeout: 45_000 },
    () => assertArchivePagination(engine),
  );
  test(
    `archive loading remains active while a different cursor request is still pending in ${engine.name}`,
    { timeout: 45_000 },
    () => assertOverlappingArchiveLoads(engine),
  );
}