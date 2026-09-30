import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BROWSER_ENGINES,
  closeBrowserAndServer,
  gotoTestPage,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

test('private Archive review separates dates and makes nine-image results explicit', { timeout: 60_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server, BROWSER_ENGINES[0].type);
  const checkedDates: string[] = [];
  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: { accountId: 'archive-editor', email: 'editor@example.test', isAdmin: true } }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
    }));
    await page.route('**/.netlify/functions/star-of-day**', route => {
      const params = new URL(route.request().url()).searchParams;
      if (params.get('archivePublicationAudit') === '1') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ records: [{ date: '2026-09-30', status: 'not_indexable' }], nextCursor: null }),
        });
      }
      if (params.get('archivePublicationReview') === '1') {
        const date = params.get('date');
        if (params.get('checkMedia') === '1') checkedDates.push(date || '');
        const mediaChecks = date === '2026-09-03'
          ? Array.from({ length: 9 }, (_, position) => ({ position, status: 'verified' }))
          : Array.from({ length: 9 }, (_, position) => ({
            position, status: position === 3 ? 'checksum_mismatch' : 'verified',
          }));
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ review: {
            date, status: 'not_indexable', indexable: false,
            actor: { nameEn: 'Test Actor' }, vibe: { labelEn: 'Test Vibe', subtitleEn: 'Approved line' },
            cards: Array.from({ length: 9 }, (_, position) => ({ position, title: `Card ${position + 1}` })),
            ...(params.get('checkMedia') === '1' ? { mediaChecks } : {}),
          } }),
        });
      }
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    });

    await gotoTestPage(page, `${origin}/vibe-atlas/?admin=true&adminView=archive-review`);
    await page.getByRole('heading', { name: 'Publication review' }).waitFor();
    await page.getByLabel('Review a specific date').fill('2026-09-03');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByText('Media not checked for 2026-09-03').waitFor();
    await page.getByRole('button', { name: 'Run media check' }).click();
    await page.getByText('9 of 9 full-size images verified for 2026-09-03 — all passed').waitFor();
    assert.deepEqual(checkedDates, ['2026-09-03']);

    await page.getByLabel('Review a specific date').fill('2026-09-30');
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByText('Media not checked for 2026-09-30').waitFor();
    assert.equal(await page.getByText('9 of 9 full-size images verified for 2026-09-03 — all passed').count(), 0);
    await page.getByRole('button', { name: 'Run media check' }).click();
    await page.getByText('8 of 9 full-size images verified for 2026-09-30 — not cleared for release').waitFor();
    await page.getByText('Positions needing attention: 4: checksum_mismatch.').waitFor();
    assert.deepEqual(checkedDates, ['2026-09-03', '2026-09-30']);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});