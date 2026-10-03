import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Locator, Page } from '@playwright/test';
import {
  BROWSER_ENGINES,
  closeBrowserAndServer,
  gotoTestPage,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const DATE = '2026-09-25';
const IMAGE_ID = 'published-image-0';
const MEDIA_ALIAS = 'https://images.report-test/0.jpg';
const CONTEXT_NOTE = 'The credit names a different performer.';
const REPORT_IMAGE = 'Report image 0';
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');

const dailyData = {
  actorId: 'daily-report-actor',
  actorName: 'Daily Report Actor',
  actorShortNameEn: 'Daily Report Actor',
  actorAccentColor: '#b89155',
  vibeIdx: 4,
  vibeEmoji: '',
  vibeLabel: '氛围碎裂',
  vibeLabelEn: 'Shattered Beauty',
  vibeSubtitle: 'A fixture board for image reporting.',
  vibeSubtitleEn: 'A fixture board for image reporting.',
  date: DATE,
  generatedAt: `${DATE}T12:00:00.000Z`,
  rankedBatches: [{
    query: 'daily report fixture',
    provider: 'primary',
    count: 9,
    distinctSources: 4,
    results: Array.from({ length: 9 }, (_, index) => ({
      imageId: `published-image-${index}`,
      title: index === 0
        ? `${REPORT_IMAGE} · ${'A long public source title with credits and tags '.repeat(8)}`
        : `Report image ${index}`,
      thumbnail: `https://images.report-test/${index}.jpg`,
      link: `https://source.report-test/${index}`,
      source: `Publisher ${index % 4}`,
    })),
  }],
};

async function savedConstituentCardCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const opening = indexedDB.open('vibe-atlas-collection', 3);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    const transaction = db.transaction('cards', 'readonly');
    const request = transaction.objectStore('cards').count();
    return new Promise<number>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

async function assertReadableReportControl(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  const dimensions = await control.evaluate(element => {
    const box = element.getBoundingClientRect();
    let top = Math.max(0, box.top);
    let bottom = Math.min(window.innerHeight, box.bottom);
    let left = Math.max(0, box.left);
    let right = Math.min(window.innerWidth, box.right);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY)) {
        top = Math.max(top, bounds.top + parent.clientTop);
        bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight);
      }
      if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) {
        left = Math.max(left, bounds.left + parent.clientLeft);
        right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth);
      }
    }
    return {
      height: box.height,
      width: box.width,
      visibleHeight: bottom - top,
      visibleWidth: right - left,
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    };
  });
  assert.ok(dimensions.height >= 42, 'report controls must not flex-shrink into a narrow strip');
  assert.ok(dimensions.fontSize >= 14, 'report controls must use readable text');
  assert.ok(dimensions.visibleHeight >= dimensions.height - 2, 'the entire control must be reachable, not clipped by a parent');
  assert.ok(dimensions.visibleWidth >= dimensions.width - 2, 'report controls must fit without horizontal clipping');
}

test('an unsaved Daily Drop image can be reported on mobile, keeps keyboard editing, and recovers exact draft after magic-link auth', { timeout: 90_000 }, async () => {
  const chromium = BROWSER_ENGINES.find(engine => engine.id === 'chromium')!;
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server, chromium.type);
  const reportRequests: Array<{ method: string; body?: Record<string, unknown> }> = [];
  let authenticated = false;
  let submissionMode: 'pending_review' | 'approved' | 'failure' = 'pending_review';

  const configurePage = async (target: Page) => {
    await target.setViewportSize({ width: 390, height: 844 });
    await target.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
    }));
    await target.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: authenticated
          ? { accountId: 'daily-report-member', email: 'member@example.test', isAdmin: false }
          : null,
      }),
    }));
    await target.route('**/api/auth/magic-link', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Check your email for a sign-in link.' }),
    }));
    await target.route('**/api/auth/verify', route => {
      authenticated = true;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await target.route('**/.netlify/functions/star-of-day**', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(authenticated ? dailyData : {
        ...dailyData, rankedBatches: dailyData.rankedBatches.map(batch => ({
          ...batch, results: batch.results.map(({ imageId: _privateId, ...result }) => result),
        })),
      }),
    }));
    await target.route('**/.netlify/functions/public-archive-inventory**', route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ fallback: 'legacy_unverified_edition' }),
    }));
    await target.route('**/.netlify/functions/public-released-pack-preview**', route => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'No public preview fixture.' }),
    }));
    await target.route('**/.netlify/functions/image-proxy**', route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: PIXEL,
    }));
    await target.route('**/.netlify/functions/actor-audits**', async route => {
      const request = route.request();
      if (request.method() === 'GET') {
        if (!authenticated) {
          return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Sign in required.' }) });
        }
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            reports: [
              { receiptId: 'older-approved', status: 'approved', reason: 'wrong_actor', date: DATE, imageId: IMAGE_ID },
              { receiptId: 'older-rejected', status: 'rejected', reason: 'wrong_vibe', date: DATE, imageId: IMAGE_ID },
            ],
          }),
        });
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      reportRequests.push({ method: request.method(), body });
      if (!authenticated) {
        return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Sign in required.' }) });
      }
      if (submissionMode === 'failure') return route.fulfill({
        status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Please retry; report not confirmed.' }),
      });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          report: {
            receiptId: 'receipt-daily-report',
            status: submissionMode,
            reason: body.reason,
            note: body.note,
            actualIdentity: body.actualIdentity,
            date: body.date,
            imageId: body.imageId,
          },
        }),
      });
    });
  };

  try {
    await configurePage(page);
    await gotoTestPage(page, `${origin}/vibe-atlas`);
    const reactions = page.getByRole('group', { name: /Board edition/ });
    await reactions.locator('summary').focus();
    await reactions.locator('summary').press('Enter');
    assert.equal(await reactions.locator('details').evaluate(element => (element as HTMLDetailsElement).open), true);
    await reactions.getByRole('button', { name: '★ Legendary', exact: true }).click();
    await reactions.getByRole('combobox').selectOption('nailed_vibe');
    assert.equal(await reactions.getByRole('combobox').inputValue(), 'nailed_vibe');
    assert.equal(await savedConstituentCardCount(page), 0, 'manual reactions never auto-save constituent cards');
    await reactions.getByRole('button', { name: '◇ Misprint', exact: true }).click();
    assert.equal(await reactions.getByRole('combobox').count(), 0);
    await reactions.getByRole('button', { name: '◇ Misprint', exact: true }).click();
    assert.equal(await reactions.getByRole('button', { name: '◇ Misprint', exact: true }).getAttribute('aria-pressed'), 'false');
    await reactions.locator('summary').press('Enter');
    await page.getByRole('button', { name: new RegExp(`View ${REPORT_IMAGE}`) }).click();
    const preview = page.getByRole('region', { name: new RegExp(`Preview of ${REPORT_IMAGE}`) });
    const inlineReport = preview.locator('details').filter({ has: page.getByText('Report an image issue') });
    await inlineReport.locator('summary').click();
    for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await assertReadableReportControl(inlineReport.getByLabel('What went wrong?'));
      await assertReadableReportControl(inlineReport.getByLabel('Add context (optional)'));
      await assertReadableReportControl(inlineReport.getByRole('button', { name: 'Send report', exact: true }));
      await assertReadableReportControl(inlineReport.getByLabel('Email for a sign-in link'));
      if (process.env.REPORT_LAYOUT_SCREENSHOTS === '1') {
        await inlineReport.screenshot({ path: `screenshots/daily-report-inline-${viewport.width}x${viewport.height}.png` });
      }
    }
    await inlineReport.getByLabel('What went wrong?').selectOption('other');
    await inlineReport.getByLabel('Add context (optional)').fill('Diagnostic preview draft only.');
    await inlineReport.locator('summary').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'View Full Screen' }).click();
    const close = page.getByRole('button', { name: 'Close lightbox' });
    const closeBox = await close.boundingBox();
    assert.ok(closeBox && closeBox.y >= 0 && closeBox.y < 844, 'close control stays visibly inside the scrollable mobile viewer');
    const dialog = page.getByRole('dialog');
    const reportDetails = dialog.locator('details').filter({ has: page.getByText('Report an image issue') });
    await reportDetails.locator('summary').click();
    assert.equal(await reportDetails.getByLabel('What went wrong?').inputValue(), 'other', 'the inline draft is retained when switching to the full-screen viewer');
    assert.equal(await reportDetails.getByLabel('Add context (optional)').inputValue(), 'Diagnostic preview draft only.');
    for (const viewport of [{ width: 1024, height: 768 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await assertReadableReportControl(reportDetails.getByLabel('What went wrong?'));
      await assertReadableReportControl(reportDetails.getByLabel('Add context (optional)'));
      await assertReadableReportControl(reportDetails.getByRole('button', { name: 'Send report', exact: true }));
      await assertReadableReportControl(reportDetails.getByLabel('Email for a sign-in link'));
      if (process.env.REPORT_LAYOUT_SCREENSHOTS === '1') {
        await reportDetails.screenshot({ path: `screenshots/daily-report-lightbox-${viewport.width}x${viewport.height}.png` });
      }
    }
    await reportDetails.getByLabel('Actual identity, if known (optional)').fill('A different performer');
    await reportDetails.getByLabel('Add context (optional)').fill(CONTEXT_NOTE);
    await reportDetails.getByLabel('What went wrong?').selectOption('wrong_actor');

    const initialCounter = await page.locator('text=1 / 9').count();
    await reportDetails.getByLabel('Add context (optional)').press('ArrowRight');
    assert.equal(await page.locator('text=1 / 9').count(), initialCounter, 'ArrowRight while editing must not navigate the lightbox');

    await page.getByRole('button', { name: 'Send report' }).click();
    assert.equal(await savedConstituentCardCount(page), 0, 'opening and reporting must never save the constituent image');
    await reportDetails.getByLabel('Email for a sign-in link').fill('member@example.test');
    await page.getByRole('button', { name: 'Send sign-in link' }).click();
    const recovery = await page.evaluate(() => ({
      target: JSON.parse(localStorage.getItem('fandom_daily_report_return') || 'null'),
      draft: Object.entries(localStorage)
        .filter(([key]) => key.startsWith('fandom_daily_report_draft:'))
        .map(([, value]) => JSON.parse(value)),
    }));
    assert.equal(recovery.target.date, DATE);
    assert.equal(recovery.target.imageId, MEDIA_ALIAS);
    assert.equal(typeof recovery.target.expiresAt, 'number', 'cross-tab target has a bounded expiry');
    assert.equal(recovery.draft[0].note, CONTEXT_NOTE);
    assert.equal(reportRequests.length, 1, 'the only report attempt so far was rejected for missing sign-in');
    assert.equal(reportRequests[0].body?.imageId, MEDIA_ALIAS);

    // A fresh tab shares localStorage while sessionStorage would not.
    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(() => window.open('about:blank', '_blank'));
    const returnPage = await popupPromise;
    await configurePage(returnPage);
    await gotoTestPage(returnPage, `${origin}/auth/verify#token=valid-test-token&next=archive%3A${DATE}`);
    await returnPage.getByRole('dialog').waitFor();
    const recoveredDetails = returnPage.locator('details').filter({ has: returnPage.getByText('Report an image issue') });
    await recoveredDetails.waitFor();
    assert.equal(await recoveredDetails.evaluate(element => (element as HTMLDetailsElement).open), true, 'the exact report form reopens after auth');
    assert.equal(await returnPage.getByLabel('Actual identity, if known (optional)').inputValue(), 'A different performer');
    assert.equal(await returnPage.getByLabel('Add context (optional)').inputValue(), CONTEXT_NOTE);
    await returnPage.getByText(/Approved review decision/).waitFor();
    await returnPage.getByText(/Not approved/).waitFor();
    assert.equal(reportRequests.length, 1, 'sign-in recovery must not submit the report automatically');

    await returnPage.getByRole('button', { name: 'Send report' }).click();
    await returnPage.getByText(/pending operator review/i).waitFor();
    assert.equal(reportRequests.length, 2);
    assert.deepEqual(
      { action: reportRequests[1].body?.action, date: reportRequests[1].body?.date, imageId: reportRequests[1].body?.imageId, reason: reportRequests[1].body?.reason },
      { action: 'report_daily_image', date: DATE, imageId: IMAGE_ID, reason: 'wrong_actor' },
    );
    assert.equal(reportRequests[1].body?.note, CONTEXT_NOTE);
    assert.equal(reportRequests[1].body?.actualIdentity, 'A different performer');
    assert.equal(reportRequests[1].body?.url, undefined, 'the client never sends a trusted image URL');
    assert.equal(await returnPage.evaluate(() => localStorage.getItem('fandom_daily_report_return')), null, 'auth recovery is one-time');
    submissionMode = 'approved';
    await returnPage.getByRole('button', { name: 'Send report' }).click();
    await returnPage.getByText(/This report is already approved/).waitFor();
    assert.equal(await returnPage.getByText(/Report received.*pending operator review/i).count(), 0);
    submissionMode = 'failure';
    await returnPage.getByRole('button', { name: 'Send report' }).click();
    await returnPage.getByText(/Please retry; report not confirmed/).waitFor();
    assert.equal(await returnPage.getByLabel('Add context (optional)').inputValue(), CONTEXT_NOTE);
    assert.equal(await savedConstituentCardCount(returnPage), 0);
    await returnPage.evaluate(() => window.dispatchEvent(new StorageEvent('storage', {
      key: 'fandom-collection-notify', newValue: 'session-changed:test-other-account',
    })));
    assert.equal(await returnPage.getByText(/Your report:/).count(), 0, 'a session change clears the prior account’s report statuses');
    await returnPage.close();
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('private operator queue handles legacy evidence, empty pagination, decisions, and reasoned retraction', { timeout: 90_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server, BROWSER_ENGINES[0].type);
  const decisions: Record<string, unknown>[] = [];
  let active = false;
  let retracted = false;
  const report = {
    actorId: 'daily-report-actor', vibeKey: 'daily-report-actor:4',
    actorName: 'Daily Report Actor', vibeLabel: 'Shattered Beauty',
    receiptId: 'legacy-collection-receipt', reason: 'wrong_actor',
    sourceCollectionId: 'saved-card', note: 'Check the face.',
    candidate: { thumbnail: 'https://images.report-test/0.jpg', link: 'https://source.report-test/0', query: 'original query' },
  };
  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: { accountId: 'operator', isAdmin: true } }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ capabilities: [] }),
    }));
    await page.route('**/.netlify/functions/star-of-day**', route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify(dailyData),
    }));
    await page.route('https://images.report-test/**', route => route.fulfill({ contentType: 'image/png', body: PIXEL }));
    await page.route('**/.netlify/functions/actor-audits**', route => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'POST') {
        const body = req.postDataJSON();
        decisions.push(body);
        if (body.action === 'retract_misprint') retracted = true;
        else active = body.decision === 'approved';
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ misprint: { status: active ? 'active' : 'rejected' } }) });
      }
      const reports = url.searchParams.get('status') === 'active'
        ? active && !retracted ? [{ ...report, status: 'active' }] : []
        : !active && url.searchParams.get('cursor') ? [{ ...report, status: 'pending_review' }] : [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        reports, nextCursor: !active && !url.searchParams.get('cursor') ? 'misprints/actor/page-one' : null,
      }) });
    });
    await gotoTestPage(page, `${origin}/vibe-atlas?admin=true&adminView=daily-image-reports`);
    await page.getByText('No reports on this scan page.').waitFor();
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.getByText('Check the face.').waitFor();
    assert.equal(await page.getByText('Collection evidence').count(), 1);
    await page.getByRole('button', { name: 'Approve correction' }).click();
    await page.getByText(/Review decision saved/).waitFor();
    assert.equal(decisions[0].decision, 'approved');
    await page.getByLabel('Queue', { exact: true }).selectOption('active');
    await page.getByText('Check the face.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Retract correction' }).isDisabled(), true);
    await page.getByLabel(/Decision note/).fill('The source was incorrectly attributed.');
    await page.getByRole('button', { name: 'Retract correction' }).click();
    await page.getByText(/Review decision saved/).waitFor();
    assert.equal(decisions[1].action, 'retract_misprint');
    assert.equal(decisions[1].note, 'The source was incorrectly attributed.');
    await page.getByText('No reports in this queue.').waitFor();
  } finally { await closeBrowserAndServer(browser, server); }
});