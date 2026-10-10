// Explicit production smoke check: writes one raw and one qualified visit per path.
// Never submits consent, authentication, checkout, or billing forms.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

assert.ok(process.argv.includes('--production'), 'Requires --production: this check writes six anonymous production analytics events.');
const origin = 'https://fandom.justlikekatie.com';
const routes = [
  ['/c-drama-fandom/getting-started/', 'discover'],
  ['/c-drama-fandom/glossary/', 'context'],
  ['/c-drama-fandom/', 'collect'],
];
const scriptPath = '/c-drama-fandom/companion-pilot.js';
const expectedScript = await readFile(new URL('../public/c-drama-fandom/companion-pilot.js', import.meta.url), 'utf8');
const sha256 = text => createHash('sha256').update(text).digest('hex');
const startedAt = new Date().toISOString();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const results = { startedAt, origin, scriptSha256: sha256(expectedScript), marked: [], normal: [], endpoint: [] };
try {
  // Realistic UA deliberately exercises the normal-reader server branch; these
  // synthetic visits are documented and must precede the clean scorecard window.
  const userAgent = browser.version();
  const ua = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${userAgent} Safari/537.36`;
  for (const internal of [true, false]) {
    const context = await browser.newContext({ userAgent: ua });
    try {
      if (internal) {
        // Browser storage is populated before any live companion navigation.
        await context.addInitScript(() => {
          localStorage.setItem('companion-pilot-internal', '1');
          if (localStorage.getItem('companion-pilot-internal') !== '1') throw new Error('Internal marker missing');
        });
        results.markedBeforeNavigationAt = new Date().toISOString();
      }
      await context.route('https://www.googletagmanager.com/**', route => route.abort());
      const page = await context.newPage();
      const requests = [];
      const responses = [];
      const pendingResponses = [];
      page.on('request', request => {
        if (request.url().includes('/.netlify/functions/log-engagement') && request.method() === 'POST') {
          requests.push({ payload: request.postDataJSON(), at: Date.now() });
        }
        assert.ok(!/\/\.netlify\/functions\/(?:companion-interest|billing-checkout|public-login)/.test(request.url()), 'Unexpected mutating flow');
      });
      page.on('response', response => {
        if (response.url().includes('/.netlify/functions/log-engagement') && response.request().method() === 'POST') {
          pendingResponses.push((async () => {
            responses.push({ payload: response.request().postDataJSON(), status: response.status(), body: await response.json() });
          })());
        }
      });
      for (const [route, path] of routes) {
        const before = requests.length;
        const scriptResponse = page.waitForResponse(response => response.url() === origin + scriptPath);
        const html = await page.goto(origin + route, { waitUntil: 'load' });
        assert.equal(html.status(), 200);
        const script = await scriptResponse;
        assert.equal(script.status(), 200);
        assert.equal(await script.text(), expectedScript, `Live script mismatch: ${route}`);
        assert.equal(await page.locator('[data-companion-path]').getAttribute('data-companion-path'), path);
        assert.equal(await page.evaluate(() => document.visibilityState), 'visible');
        const visibleAt = Date.now();
        if (internal) {
          assert.equal(await page.evaluate(() => localStorage.getItem('companion-pilot-internal')), '1');
          await page.waitForTimeout(11500);
          assert.equal(requests.length, before, `Marked analytics escaped: ${path}`);
          await page.locator('a[data-companion-next]').click();
          await page.waitForLoadState('load');
          const attribution = await page.evaluate(() => ({
            path: sessionStorage.getItem('companion-pilot-path'),
            time: sessionStorage.getItem('companion-pilot-time'),
          }));
          assert.deepEqual(attribution, { path: null, time: null });
          assert.equal(requests.slice(before).filter(({ payload }) => payload.batchKey === 'c-drama-companion-pilot' || payload.pilotPath).length, 0);
          results.marked.push({ route, path, visibleSeconds: 11.5, pilotRequests: 0, attribution });
        } else {
          await page.waitForTimeout(8500);
          assert.equal(requests.slice(before).filter(({ payload }) => payload.event === 'companion_qualified_view').length, 0, 'Qualified too early');
          await page.waitForTimeout(3000);
          await Promise.all(pendingResponses);
          const visit = requests.slice(before).filter(({ payload }) => payload.batchKey === 'c-drama-companion-pilot');
          assert.deepEqual(visit.map(({ payload }) => payload.event), ['companion_path_view', 'companion_qualified_view']);
          assert.ok(visit[1].at - visibleAt >= 9500, 'Qualified before ten visible ticks');
          for (const request of visit) {
            assert.deepEqual(Object.keys(request.payload).sort(), ['batchKey', 'event', 'pilotPath']);
            assert.equal(request.payload.pilotPath, path);
          }
          const accepted = responses.filter(({ payload }) => payload.pilotPath === path && payload.batchKey === 'c-drama-companion-pilot');
          assert.equal(accepted.length, 2);
          for (const response of accepted) {
            assert.equal(response.status, 200);
            assert.deepEqual(response.body, { ok: true });
          }
          results.normal.push({ route, path, qualifiedAfterMs: visit[1].at - visibleAt, acceptedEvents: accepted });
        }
      }
      if (internal) {
        // Even a recent path left over from a previous unmarked visit must not
        // be attached to membership events in the marked same-tab profile.
        await page.evaluate(() => {
          sessionStorage.setItem('companion-pilot-path', 'discover');
          sessionStorage.setItem('companion-pilot-time', String(Date.now()));
        });
        const before = requests.length;
        await page.goto(origin + '/vibe-atlas?view=membership', { waitUntil: 'load' });
        await page.waitForTimeout(5000);
        await Promise.all(pendingResponses);
        const membership = requests.slice(before).filter(({ payload }) => payload.event === 'membership_view');
        assert.ok(membership.length > 0, 'Membership view did not mount');
        assert.ok(membership.every(({ payload }) => !('pilotPath' in payload)), 'Stale membership attribution escaped');
        results.markedMembership = { seededRecentPath: 'discover', events: membership.map(({ payload }) => payload), pilotAttribution: false };
      }
    } finally {
      await context.close();
    }
  }
  // These early-return probes do not write engagement rows.
  for (const [event, batchKey] of [
    ['companion_path_view', 'c-drama-companion-pilot'],
    ['companion_qualified_view', 'c-drama-companion-pilot'],
    ['membership_view', 'vibe-atlas-membership'],
    ['checkout_started', 'vibe-atlas-membership'],
  ]) {
    const response = await fetch(origin + '/.netlify/functions/log-engagement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, batchKey, pilotPath: 'discover', internalPilot: true }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, excluded: true });
    results.endpoint.push({ event, status: response.status, body });
  }
  const report = await fetch(origin + '/.netlify/functions/companion-report?from=2026-10-09&to=2026-10-10');
  assert.ok([401, 403].includes(report.status), `Unauthenticated report status ${report.status}`);
  results.unauthenticatedReportStatus = report.status;
  results.completedAt = new Date().toISOString();
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
