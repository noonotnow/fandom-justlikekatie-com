import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Locator, Page } from '@playwright/test';
import {
  BROWSER_ENGINES,
  closeBrowserAndServer,
  gotoTestPage,
  launchBrowserForServer,
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

// WebKit's local runtime currently aborts before page creation (EGL display).
// Keep these contention checks executable; Safari verification is separate.
for (const engine of BROWSER_ENGINES.filter(engine => engine.id !== 'webkit')) {
  test(`${engine.name}: two tabs serialize first enrollment and day-1/day-7 returns without identity fields`, { timeout: 120_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const browser = await launchBrowserForServer(server, engine.type);
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const second = await context.newPage();
      const pages = [page, second];
      for (const tab of pages) {
        // A minimal same-origin harness loads the real utility without app effects
        // enrolling before both tabs have reached the controlled contention point.
        await tab.route('**/vibe-atlas', route => route.fulfill({
          contentType: 'text/html', body: '<!doctype html><title>Participation concurrency fixture</title>',
        }));
        await gotoTestPage(tab, `${origin}/vibe-atlas`);
        await tab.evaluate(`(async () => {
          Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 participation fixture' });
          window.participation = await import('/src/utils/dailyParticipation.ts');
          window.participation.setDailyParticipationAuthority(false);
          window.events = [];
          window.fetch = (_url, init) => {
            window.events.push(JSON.parse(init.body));
            return Promise.resolve(new Response('{}'));
          };
        })()`);
      }

      const contend = async (operation: string, expire = false) => {
        // Hold the actual origin-wide lock, then queue work from both tabs.
        // This proves overlap deterministically instead of relying on navigation timing.
        await page.evaluate(`(() => {
          window.held = navigator.locks.request('daily-participation-cohorts-v1',
            () => new Promise(resolve => { window.releaseCohortLock = resolve; }));
        })()`);
        await page.waitForFunction('typeof window.releaseCohortLock === "function"');
        await Promise.all(pages.map(tab => tab.evaluate(`(() => {
          window.pendingParticipation = (async () => { ${operation} })();
        })()`)));
        await page.waitForFunction(`(async () => {
          const locks = await navigator.locks.query();
          return locks.pending.filter(lock => lock.name === 'daily-participation-cohorts-v1').length === 2;
        })()`);
        if (expire) await Promise.all(pages.map(tab => tab.evaluate('window.pendingParticipation')));
        await page.evaluate('window.releaseCohortLock(); delete window.releaseCohortLock');
        await Promise.all(pages.map(tab => tab.evaluate('window.pendingParticipation')));
      };
      const events = async () => (await Promise.all(pages.map(tab =>
        tab.evaluate<Record<string, unknown>[]>('window.events')))).flat();

      // Repeat real lock handoffs to expose Firefox's task-buffered storage
      // snapshots. Exact counts must hold on every fresh enrollment and return.
      for (let round = 0; round < (engine.id === 'firefox' ? 12 : 2); round++) {
        await page.evaluate("localStorage.removeItem('daily-participation-cohorts-v1')");
        await Promise.all(pages.map(tab => tab.evaluate('window.events = []')));
        // Each cohort is enrolled by simultaneous calls from separate tabs.
        for (const operation of [
          "await window.participation.trackDailyParticipationVisit(new Date('2026-10-01T12:00:00Z'));",
          ...['guide_opened', 'grid_preserved', 'report_receipt_pending'].map(stage =>
            `await window.participation.trackDailyParticipationStage('${stage}', new Date('2026-10-01T12:00:00Z'));`),
        ]) await contend(operation);
        assert.equal((await events()).filter(event => event.event === 'daily_participation_cohort_started').length, 4, `round ${round}: one enrollment per cohort`);
        assert.equal((await events()).filter(event => event.event === 'daily_participation_stage').length, 6, 'stages count actions, not unique browsers');
        assert.deepEqual(await page.evaluate(`Object.keys(JSON.parse(localStorage.getItem('daily-participation-cohorts-v1'))).sort()`),
          ['daily_view', 'guide', 'preserved', 'report_pending']);

        for (const returnDay of [1, 7]) {
          await page.evaluate(`(() => {
            const state = JSON.parse(localStorage.getItem('daily-participation-cohorts-v1'));
            for (const entry of Object.values(state)) entry.returned = false;
            localStorage.setItem('daily-participation-cohorts-v1', JSON.stringify(state));
          })()`);
          await Promise.all(pages.map(tab => tab.evaluate('window.events = []')));
          await contend(`await window.participation.trackDailyParticipationVisit(new Date('2026-10-${returnDay === 1 ? '02' : '08'}T12:00:00Z'));`);
          const returned = (await events()).filter(event => event.event === 'daily_participation_cohort_returned');
          assert.equal(returned.length, 4, `round ${round}: one day-${returnDay} return per cohort`);
          assert.equal(new Set(returned.map(event => event.cohort)).size, 4);
          assert.ok(returned.every(event => event.returnDay === returnDay));
          await contend(`await window.participation.trackDailyParticipationVisit(new Date('2026-10-${returnDay === 1 ? '02' : '08'}T12:00:00Z'));`);
          assert.equal((await events()).length, 4, 'repeated visits in both tabs cannot count a return twice');
          for (const event of await events()) {
            assert.deepEqual(Object.keys(event).sort(), ['batchKey', 'cohort', 'cohortDay', 'event', 'returnDay']);
          }
        }
      }

      // Marked staff in either tab suppresses queued work in both tabs.
      await page.evaluate("localStorage.removeItem('daily-participation-cohorts-v1'); localStorage.setItem('companion-pilot-internal', '1')");
      await Promise.all(pages.map(tab => tab.evaluate(`(async () => {
        window.events = [];
        await window.participation.trackDailyParticipationVisit(new Date('2026-10-01T12:00:00Z'));
        await window.participation.trackDailyParticipationStage('guide_opened');
      })()`)));
      assert.deepEqual(await events(), []);
      assert.equal(await page.evaluate("localStorage.getItem('daily-participation-cohorts-v1')"), null);

      await page.evaluate("localStorage.removeItem('companion-pilot-internal')");
      await contend("await window.participation.trackDailyParticipationStage('guide_opened', new Date('2026-10-01T12:00:00Z'));", true);
      assert.equal((await events()).length, 2, 'a stalled lock still allows both stage events');
      assert.ok((await events()).every(event => event.event === 'daily_participation_stage'));
      assert.equal(await page.evaluate("localStorage.getItem('daily-participation-cohorts-v1')"), null, 'expired work never writes after the held lock is released');
      await contend("await window.participation.trackDailyParticipationVisit(new Date('2026-10-01T12:00:00Z'));");
      assert.equal((await events()).filter(event => event.event === 'daily_participation_cohort_started').length, 1, 'later visits recover once the lock is available');
      await second.close();
    } finally {
      await closeBrowserAndServer(browser, server);
    }
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
  const participation: Array<Record<string, unknown>> = [];
  let authenticated = false;
  let submissionMode: 'pending_review' | 'approved' | 'failure' = 'pending_review';

  const configurePage = async (target: Page) => {
    // Exercise visitor instrumentation separately from the deliberate test-browser exclusion.
    await target.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 participation fixture' }));
    await target.route('**/.netlify/functions/log-engagement', route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (String(body.event).startsWith('daily_participation_')) participation.push(body);
      return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    });
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
    for (const stage of ['guide_opened', 'report_opened', 'report_submission_started', 'report_sign_in_required', 'report_receipt_pending', 'report_receipt_existing', 'report_submission_failed']) {
      assert.ok(participation.some(event => event.stage === stage), `missing participation stage ${stage}: ${JSON.stringify(participation)}`);
    }
    assert.equal(participation.filter(event => event.stage === 'report_receipt_pending').length, 1, 'approved retry and failed submission never count as pending confirmation');
    assert.equal(participation.filter(event => event.stage === 'grid_preserved').length, 0, 'reactions/reporting never preserve a grid');
    const measured = JSON.stringify(participation);
    for (const privateValue of [CONTEXT_NOTE, 'A different performer', 'member@example.test', 'receipt-daily-report', IMAGE_ID, MEDIA_ALIAS, 'nailed_vibe', 'wrong_actor']) {
      assert.ok(!measured.includes(privateValue), `analytics leaked ${privateValue}`);
    }
    assert.equal(await returnPage.getByLabel('Add context (optional)').inputValue(), CONTEXT_NOTE);
    assert.equal(await savedConstituentCardCount(returnPage), 0);
    await returnPage.evaluate(() => window.dispatchEvent(new StorageEvent('storage', {
      key: 'fandom-collection-notify', newValue: 'session-changed:test-other-account',
    })));
    assert.equal(await returnPage.getByText(/Your report:/).count(), 0, 'a session change clears the prior account’s report statuses');
    const cohortCount = await returnPage.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('daily-participation-cohorts-v1') || '{}');
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      for (const entry of Object.values(state) as Array<{ day: string; returned: boolean }>) {
        entry.day = yesterday;
        entry.returned = false;
      }
      localStorage.setItem('daily-participation-cohorts-v1', JSON.stringify(state));
      return Object.keys(state).length;
    });
    const returning = returnPage.waitForRequest(request => {
      if (!request.url().endsWith('/log-engagement') || request.method() !== 'POST') return false;
      return request.postDataJSON().event === 'daily_participation_cohort_returned';
    });
    await gotoTestPage(returnPage, `${origin}/vibe-atlas`);
    await returning;
    await returnPage.getByRole('group', { name: /Board edition/ }).waitFor();
    assert.equal(participation.filter(event => event.event === 'daily_participation_cohort_returned').length, cohortCount);
    assert.ok(participation.filter(event => event.event === 'daily_participation_cohort_returned').every(event => event.returnDay === 1));
    await gotoTestPage(returnPage, `${origin}/vibe-atlas`);
    await returnPage.getByRole('group', { name: /Board edition/ }).waitFor();
    assert.equal(participation.filter(event => event.event === 'daily_participation_cohort_returned').length, cohortCount, 'same-day reload never counts twice');
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
    assert.equal(await page.locator('article code').textContent(), report.receiptId);
    await page.getByRole('button', { name: 'Approve correction' }).click();
    await page.getByText(/Review decision saved/).waitFor();
    assert.equal(decisions[0].decision, 'approved');
    await page.getByLabel('Queue', { exact: true }).selectOption('active');
    await page.getByText('Check the face.').waitFor();
    assert.equal(await page.locator('article code').textContent(), report.receiptId, 'active corrections retain their receipt reference');
    assert.equal(await page.getByRole('button', { name: 'Retract correction' }).isDisabled(), true);
    await page.getByLabel(/Decision note/).fill('The source was incorrectly attributed.');
    await page.getByRole('button', { name: 'Retract correction' }).click();
    await page.getByText(/Review decision saved/).waitFor();
    assert.equal(decisions[1].action, 'retract_misprint');
    assert.equal(decisions[1].note, 'The source was incorrectly attributed.');
    await page.getByText('No reports in this queue.').waitFor();
  } finally { await closeBrowserAndServer(browser, server); }
});

for (const engine of BROWSER_ENGINES) {
test(`same-image operator reports have copyable distinct receipts and independent review actions (${engine.name})`, { timeout: 90_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server, engine.type);
  const receiptIds = ['aaaaaaaaaaaaaaaaaaaaaaa1', 'aaaaaaaaaaaaaaaaaaaaaaa2'];
  const decisions: Record<string, unknown>[] = [];
  const reviewed = new Set<string>();
  const queueRequests: URL[] = [];

  let operator = false;
  const reports = receiptIds.map(receiptId => ({
    receiptId, status: 'pending_review',
    actorId: dailyData.actorId, vibeKey: `${dailyData.actorId}:4`,
    actorName: dailyData.actorName, vibeLabel: dailyData.vibeLabelEn,
    date: DATE, imageId: IMAGE_ID, reason: 'other', note: 'Same diagnostic note.',
    publication: { date: DATE, imageId: IMAGE_ID, boardHash: 'same-frozen-board', position: 0 },
    candidate: { thumbnail: MEDIA_ALIAS, link: 'https://source.report-test/0', query: 'same query' },
    // Defensive fixture: unexpected private fields must never be rendered or copied.
    markedBy: `private-account-${receiptId}`, email: `private-${receiptId}@example.test`,
  }));
  try {
    await page.addInitScript(`
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async function (value) {
          if (sessionStorage.getItem('clipboard-failure')) throw new Error('Fixture clipboard denied');
          sessionStorage.setItem('copied-receipt', value);
        },
      } });
    `);
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({
        user: { accountId: operator ? 'operator' : 'ordinary-member', isAdmin: operator },
      }),
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
      if (req.method() === 'POST') {
        const body = req.postDataJSON();
        decisions.push(body);
        reviewed.add(body.receiptId);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ misprint: { status: body.decision } }) });
      }
      queueRequests.push(new URL(req.url()));
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ reports: reports.filter(report => !reviewed.has(report.receiptId)), nextCursor: null }),
      });
    });
    await gotoTestPage(page, `${origin}/vibe-atlas?admin=true&adminView=daily-image-reports`);
    const queue = page.getByRole('region', { name: 'Daily image report review' });
    await page.getByRole('heading', { name: 'Admin sign-in required' }).waitFor();
    assert.equal(await queue.count(), 0, 'an admin URL must not expose the queue to an ordinary member');
    assert.equal(queueRequests.length, 0, 'ordinary members must not request the operator queue');
    operator = true;
    await gotoTestPage(page, `${origin}/vibe-atlas?admin=true&adminView=daily-image-reports`);
    const rows = queue.locator('article');
    await rows.nth(1).waitFor();
    assert.deepEqual(await rows.locator('code').allTextContents(), receiptIds, 'full references must not be shortened into indistinguishable prefixes');
    assert.equal(await rows.getByText('Same diagnostic note.', { exact: true }).count(), 2);
    for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const receiptId of receiptIds) {
        const row = rows.filter({ has: page.getByText(receiptId, { exact: true }) });
        const reference = row.locator('code');
        await reference.scrollIntoViewIfNeeded();
        const fits = await reference.evaluate(element => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const range = document.createRange();
          range.selectNodeContents(element);
          const textBoxes = [...range.getClientRects()];
          return box.left >= 0 && box.right <= window.innerWidth
            && box.top >= 0 && box.bottom <= window.innerHeight
            && style.userSelect === 'all' && style.textOverflow !== 'ellipsis'
            && textBoxes.length > 0
            && textBoxes.every(text => text.left >= box.left - 1 && text.right <= box.right + 1
              && text.top >= box.top - 1 && text.bottom <= box.bottom + 1);
        });
        assert.ok(fits, 'full reference must fit and remain manually selectable');
        const copy = row.getByRole('button', { name: `Copy receipt reference ${receiptId}`, exact: true });
        // Reset the capture so a stale success cannot satisfy the next copy.
        await page.evaluate(() => sessionStorage.removeItem('copied-receipt'));
        await copy.focus();
        assert.equal(await copy.evaluate(element => element === document.activeElement), true);
        await copy.press(receiptId === receiptIds[0] ? 'Enter' : 'Space');
        await page.waitForFunction(expected => sessionStorage.getItem('copied-receipt') === expected, receiptId);
        await queue.getByRole('status').filter({ hasText: 'Receipt reference copied.' }).waitFor();
        assert.equal(await page.evaluate(() => sessionStorage.getItem('copied-receipt')), receiptId);
      }
    }
    assert.equal(decisions.length, 0, 'copying must never review a report');
    const rendered = await queue.textContent();
    for (const report of reports) {
      assert.ok(!rendered?.includes(report.markedBy));
      assert.ok(!rendered?.includes(report.email));
    }
    await page.evaluate(() => sessionStorage.setItem('clipboard-failure', '1'));
    await rows.first().getByRole('button', { name: `Copy receipt reference ${receiptIds[0]}`, exact: true }).click();
    await queue.getByRole('alert').filter({ hasText: 'copy it manually' }).waitFor();
    assert.equal(await queue.getByRole('status').filter({ hasText: 'Receipt reference copied.' }).count(), 0,
      'clipboard rejection must not retain a copied confirmation');
    await page.evaluate(() => {
      sessionStorage.removeItem('copied-receipt');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    const unavailableCopy = rows.last().getByRole('button', { name: `Copy receipt reference ${receiptIds[1]}`, exact: true });
    await unavailableCopy.focus();
    await unavailableCopy.press('Enter');
    await queue.getByRole('alert').filter({
      hasText: 'Could not copy the receipt reference. Select the reference and copy it manually.',
    }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('copied-receipt')), null);
    assert.equal(await queue.getByRole('status').filter({ hasText: 'Receipt reference copied.' }).count(), 0);
    assert.equal(decisions.length, 0, 'failed copying must never review a report');
    assert.deepEqual(await rows.locator('code').allTextContents(), receiptIds);
    const first = rows.filter({ has: page.getByText(receiptIds[0], { exact: true }) });
    const second = rows.filter({ has: page.getByText(receiptIds[1], { exact: true }) });
    await first.getByLabel(/Decision note/).fill('First receipt only.');
    await second.getByLabel(/Decision note/).fill('Keep this pending.');
    await first.getByRole('button', { name: 'Reject report', exact: true }).click();
    await queue.getByRole('status').filter({ hasText: 'Review decision saved.' }).waitFor();
    await second.waitFor();
    assert.deepEqual(decisions, [{
      action: 'review_collection_misprint', actorId: dailyData.actorId, vibeKey: `${dailyData.actorId}:4`,
      receiptId: receiptIds[0], decision: 'rejected', note: 'First receipt only.',
    }]);
    assert.deepEqual(await rows.locator('code').allTextContents(), [receiptIds[1]]);
    assert.equal(await rows.getByLabel(/Decision note/).inputValue(), 'Keep this pending.');
    assert.equal(await rows.getByRole('button', { name: 'Approve correction' }).isEnabled(), true);
    assert.ok(queueRequests.length >= 2);
    assert.ok(queueRequests.every(url => url.searchParams.get('reports') === 'queue'
      && url.searchParams.get('status') === 'pending_review' && url.searchParams.get('limit') === '20'));
  } finally { await closeBrowserAndServer(browser, server); }
});
}
