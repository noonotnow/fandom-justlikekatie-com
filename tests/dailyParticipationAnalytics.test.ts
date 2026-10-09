import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { trackDailyParticipationStage, trackDailyParticipationVisit, setDailyParticipationAuthority } from '../src/utils/dailyParticipation.ts';
import { recordDailyParticipationEvent } from '../src/utils/analytics.ts';

const KEY = 'daily-participation-cohorts-v1';
function browser() {
  const values = new Map<string, string>();
  const requests: Record<string, unknown>[] = [];
  const trackers: unknown[] = [];
  let tail = Promise.resolve();
  const locks = {
    request: (_name: string, options: { signal: AbortSignal }, callback: () => void | Promise<void>) => {
      const pending = tail.then(() => {
        options.signal.throwIfAborted();
        return callback();
      });
      tail = pending.catch(() => undefined);
      return pending;
    },
  };
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const location = { pathname: '/vibe-atlas', search: '?imageUrl=private-capability', hash: '#private', origin: 'https://example.test' };
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: storage },
    navigator: { configurable: true, value: { userAgent: 'Mozilla/5.0', locks } },
    window: { configurable: true, value: {
      localStorage: storage, location,
      fetch: (_url: string, init: RequestInit) => {
        requests.push(JSON.parse(String(init.body)));
        return Promise.resolve({});
      },
      umami: { track: (...args: unknown[]) => trackers.push(args) },
      gtag: (...args: unknown[]) => trackers.push(args),
      dataLayer: trackers,
    } },
  });
  return { values, requests, trackers, storage, location };
}
const day = (number: number) => new Date(`2026-10-${String(number).padStart(2, '0')}T12:00:00Z`);

test('participation fails closed before the first existing session authority check', () => {
  const b = browser();
  trackDailyParticipationVisit(day(1));
  trackDailyParticipationStage('guide_opened', day(1));
  assert.deepEqual(b.requests, []);
});

test('cohort locks remain held until task-buffered storage writes checkpoint', async () => {
  const b = browser();
  setDailyParticipationAuthority(false);
  const checkpointsAtRelease: boolean[] = [];
  let checkpointed = true;
  let tail = Promise.resolve();
  const setItem = b.storage.setItem;
  b.storage.setItem = (key, value) => {
    setItem(key, value);
    checkpointed = false;
    // Model Firefox's stable-state checkpoint at the end of the writing task.
    setTimeout(() => { checkpointed = true; }, 0);
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    userAgent: 'Mozilla/5.0',
    locks: { request: (_name: string, options: { signal: AbortSignal }, callback: () => void | Promise<void>) => {
      const pending = tail.then(async () => {
        options.signal.throwIfAborted();
        await callback();
        checkpointsAtRelease.push(checkpointed);
      });
      tail = pending.catch(() => undefined);
      return pending;
    } },
  } });
  await Promise.all([trackDailyParticipationVisit(day(1)), trackDailyParticipationVisit(day(1))]);
  await Promise.all([trackDailyParticipationVisit(day(2)), trackDailyParticipationVisit(day(2))]);
  assert.deepEqual(checkpointsAtRelease, [true, true, true, true],
    'release must follow the browser task checkpoint, not just synchronous setItem or a microtask');
  assert.equal(b.requests.filter(event => event.event === 'daily_participation_cohort_started').length, 1);
  assert.equal(b.requests.filter(event => event.event === 'daily_participation_cohort_returned').length, 1);
});

test('same-browser cohorts are bounded, idempotent, return only days 1–7, and never use external tracker context', async () => {
  const b = browser();
  setDailyParticipationAuthority(false);
  await Promise.all([
    trackDailyParticipationVisit(day(1)),
    trackDailyParticipationVisit(day(1)),
    trackDailyParticipationStage('guide_opened', day(1)),
    trackDailyParticipationStage('guide_opened', day(1)),
    trackDailyParticipationStage('grid_preserved', day(1)),
    trackDailyParticipationStage('report_receipt_pending', day(1)),
    trackDailyParticipationVisit(day(1)),
  ]);
  assert.equal(b.requests.filter(r => r.event === 'daily_participation_cohort_started').length, 4);
  assert.equal(b.requests.filter(r => r.event === 'daily_participation_cohort_returned').length, 0);
  await Promise.all([
    trackDailyParticipationVisit(day(2)),
    trackDailyParticipationVisit(day(2)),
    trackDailyParticipationVisit(day(8)),
  ]);
  assert.equal(b.requests.filter(r => r.event === 'daily_participation_cohort_returned').length, 4);
  assert.ok(b.requests.filter(r => r.event === 'daily_participation_cohort_returned').every(r => r.returnDay === 1));
  assert.equal(b.trackers.length, 0);
  const serialized = JSON.stringify({ requests: b.requests, state: b.values.get(KEY) });
  for (const forbidden of ['private-capability', 'imageUrl', 'receiptId', 'email', 'actualIdentity', 'actor', 'reason', 'note', 'reporterId']) {
    assert.ok(!serialized.includes(forbidden), forbidden);
  }
});

test('late returns, clock reversal, malformed state, and blocked storage do not create false return events', async () => {
  const b = browser();
  setDailyParticipationAuthority(false);
  await trackDailyParticipationVisit(day(2));
  await trackDailyParticipationVisit(day(1));
  await trackDailyParticipationVisit(day(10));
  assert.equal(b.requests.filter(r => r.event === 'daily_participation_cohort_returned').length, 0);
  await trackDailyParticipationVisit(day(9)); // Inclusive day 7.
  assert.equal(b.requests.filter(r => r.returnDay === 7).length, 1);
  const before = b.requests.length;
  b.values.set(KEY, '{broken');
  await assert.doesNotReject(() => trackDailyParticipationVisit(day(10)));
  assert.equal(b.requests.length, before);
  b.storage.setItem = () => { throw new Error('blocked'); };
  b.values.delete(KEY);
  await trackDailyParticipationVisit(day(10));
  assert.equal(b.requests.length, before);
});

test('missing, rejected, or stalled locks omit cohorts without suppressing stages or rejecting actions', async () => {
  const b = browser();
  setDailyParticipationAuthority(false);
  for (const locks of [
    undefined,
    { request: () => Promise.reject(new Error('blocked')) },
    { request: (_name: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    }) },
  ]) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0', locks } });
    await assert.doesNotReject(() => trackDailyParticipationVisit(day(1)));
    await assert.doesNotReject(() => trackDailyParticipationStage('guide_opened', day(1)));
  }
  assert.equal(b.values.get(KEY), undefined);
  assert.equal(b.requests.length, 3);
  assert.ok(b.requests.every(event => event.event === 'daily_participation_stage'));
});

test('queued cohorts recheck authority and persistent internal exclusion before writing', async () => {
  for (const exclude of [
    () => setDailyParticipationAuthority(true),
    () => localStorage.setItem('daily-participation-internal', '1'),
    () => localStorage.setItem('companion-pilot-internal', '1'),
  ]) {
    const b = browser();
    setDailyParticipationAuthority(false);
    const pending = trackDailyParticipationVisit(day(1));
    exclude();
    await pending;
    assert.equal(b.values.get(KEY), undefined);
    assert.deepEqual(b.requests, []);
  }
});

test('known operators, marked staff, bot browsers, and operator routes are excluded', () => {
  const b = browser();
  setDailyParticipationAuthority(true);
  trackDailyParticipationStage('report_opened');
  setDailyParticipationAuthority(false);
  trackDailyParticipationVisit(day(1)); // Persistent operator marker remains.
  b.values.delete('daily-participation-internal');
  b.values.set('companion-pilot-internal', '1');
  trackDailyParticipationStage('guide_opened');
  b.values.delete('companion-pilot-internal');
  b.location.search = '?admin=true';
  trackDailyParticipationStage('guide_opened');
  b.location.search = '';
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'HeadlessChrome' } });
  trackDailyParticipationVisit(day(1));
  assert.deepEqual(b.requests, []);
});

test('runtime wrapper rejects forged categories and all private fields and remains optional', () => {
  const b = browser();
  const payload = { event: 'daily_participation_stage', batchKey: 'daily-participation-v1', stage: 'report_opened' };
  recordDailyParticipationEvent({ ...payload, note: 'private explanation' });
  recordDailyParticipationEvent({ ...payload, stage: 'wrong_actor' });
  recordDailyParticipationEvent({ ...payload, imageUrl: 'https://private.test/?token=secret' });
  assert.equal(b.requests.length, 0);
  (window as unknown as { fetch: unknown }).fetch = () => { throw new Error('offline'); };
  assert.doesNotThrow(() => recordDailyParticipationEvent(payload));
  Reflect.deleteProperty(globalThis, 'window');
  assert.doesNotThrow(() => recordDailyParticipationEvent(payload));
});

test('UI stages follow validated receipts and successful writes, never reaction choices', async () => {
  const report = await readFile(new URL('../src/components/Lightbox/DailyImageReport.tsx', import.meta.url), 'utf8');
  const exporting = await readFile(new URL('../src/hooks/useExportCard.ts', import.meta.url), 'utf8');
  const controls = await readFile(new URL('../src/components/WholeCardTierControls/WholeCardTierControls.tsx', import.meta.url), 'utf8');
  assert.ok(report.indexOf("trackDailyParticipationStage(report.status") > report.indexOf('if (!report || !report.receiptId'));
  assert.match(report, /response\.status === 401\) \{\s*trackDailyParticipationStage\('report_sign_in_required'\)/);
  assert.match(report, /if \(version !== sessionVersion\.current\) return;\s*trackDailyParticipationStage\('report_submission_failed'\)/);
  assert.equal((exporting.match(/await dbSaveGrid\(grid\);\s*trackDailyParticipationStage\('grid_preserved'\)/g) ?? []).length, 2);
  assert.equal((controls.match(/trackDailyParticipationStage\(/g) ?? []).length, 1);
  assert.match(controls, /currentTarget\.open\) trackDailyParticipationStage\('guide_opened'\)/);
});