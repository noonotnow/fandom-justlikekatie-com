import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  consumeReleasedLibrarySignInReturn,
  trackReleasedLibraryCheckoutStarted,
  trackReleasedLibraryCollectorActivated,
  trackReleasedLibraryFilterUsed,
  trackReleasedLibraryOpened,
  trackReleasedLibraryPageView,
  trackReleasedLibrarySignInStarted,
  trackReleasedPackOpened,
} from '../src/utils/analytics.ts';

test('released pack library has a protected entitlement boundary and locked visitor path', async () => {
  const source = await readFile(new URL('../src/components/ReleasedPackLibrary/ReleasedPackLibrary.tsx', import.meta.url), 'utf8');
  assert.match(source, /hasCollectorCapability\(status\)/);
  assert.ok(source.includes("fetch('/.netlify/functions/actor-pack-depth'"));
  assert.match(source, /if \(!entitled\)/);
  assert.match(source, /Email sign-in link/);
  assert.match(source, /Become a Fandom Collector/);
  assert.match(source, /trackReleasedLibraryOpened/);
  assert.match(source, /trackReleasedLibrarySignInStarted/);
  assert.match(source, /trackReleasedLibraryCheckoutStarted/);
  assert.match(source, /trackReleasedLibraryFilterUsed\('actor'/);
  assert.match(source, /trackReleasedLibraryFilterUsed\('vibe'/);
  assert.match(source, /trackReleasedPackOpened/);
  assert.match(source, /if \(!membershipResolved \|\| status === null\) return/);
});

test('released pack navigation preserves actor and vibe selection from daily drop', async () => {
  const [app, routes] = await Promise.all([
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/utils/fandomRoutes.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /view=released&source=daily_star&actorId=/);
  assert.match(app, /vibeIdx=/);
  assert.match(app, /value !== null && value !== ''/);
  assert.match(app, /<ReleasedPackLibrary/);
  assert.match(routes, /if \(view === 'released'\) return 'released'/);
});

test('released pack analytics is bounded and checkout attribution is consumed once', () => {
  const events: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'https://example.com' },
      __initialAnalyticsLocation: 'https://example.com/vibe-atlas?view=released',
      gtag(_command: string, name: string, data?: Record<string, string | number | boolean>) { events.push({ name, data }); },
      fetch: () => Promise.resolve(),
      localStorage: {
        getItem(key: string) { return storage.get(key) ?? null; },
        setItem(key: string, value: string) { storage.set(key, value); },
        removeItem(key: string) { storage.delete(key); },
      },
    },
  });
  try {
    trackReleasedLibraryPageView('daily_star', 'liu-xueyi', 3);
    trackReleasedLibraryOpened('daily_star', false, 'liu-xueyi', 3);
    trackReleasedLibraryFilterUsed('actor', 'daily_star', 'INVALID ACCOUNT DATA', 300);
    trackReleasedPackOpened('public_record', 'liu-xueyi', 3);
    trackReleasedLibrarySignInStarted('daily_star', 'liu-xueyi', 3);
    assert.deepEqual(consumeReleasedLibrarySignInReturn(), { source: 'daily_star', actorId: 'liu-xueyi', vibeIndex: 3 });
    trackReleasedLibraryCheckoutStarted('daily_star', 'liu-xueyi', 3);
    trackReleasedLibraryCollectorActivated();
    trackReleasedLibraryCollectorActivated();
    assert.equal(events.filter(event => event.name === 'released_library_collector_activated').length, 1);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('released library pageview uses canonical location without duplicating direct arrival', () => {
  const events: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'https://example.com' },
      __initialAnalyticsLocation: 'https://example.com/vibe-atlas?view=released',
      gtag(_command: string, name: string, data?: Record<string, string | number | boolean>) { events.push({ name, data }); },
      fetch: () => Promise.resolve(),
    },
  });
  try {
    trackReleasedLibraryPageView('daily_star', 'liu-xueyi', 3);
    assert.deepEqual(events, []);
    window.__initialAnalyticsLocation = 'https://example.com/';
    trackReleasedLibraryPageView('daily_star');
    assert.deepEqual(events, [{
      name: 'page_view',
      data: { page_location: 'https://example.com/vibe-atlas?view=released' },
    }]);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('only today’s homepage exposes the current released Vibe Pack for free', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /id="todays-released-pack"/);
  assert.match(app, /Free today · Star of the Day released Vibe Pack/);
  assert.match(app, /rawData && !selectedEditionDate/);
  assert.match(app, /href="#todays-released-pack"/);
  assert.match(app, /The full released-pack library stays available to Fandom Collectors/);
});