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

test('released pack library keeps source-depth protected while showing signed-out preview access', async () => {
  const source = await readFile(new URL('../src/components/ReleasedPackLibrary/ReleasedPackLibrary.tsx', import.meta.url), 'utf8');
  assert.match(source, /hasCollectorCapability\(status\)/);
  assert.ok(source.includes("fetch('/.netlify/functions/actor-pack-depth'"));
  assert.ok(source.includes("fetch(`/.netlify/functions/released-pack-preview?actorId="));
  assert.match(source, /if \(!entitled\)/);
  assert.match(source, /Public teaser · 公开预览/);
  assert.match(source, /This Vibe Pack \/ 氛围包 is the reusable editorial sourceboard/);
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
  assert.match(app, /vibeAtlasPath\(\{/);
  assert.match(app, /view: 'released'/);
  assert.match(app, /source: 'daily_star'/);
  assert.match(app, /vibeIdx: rawData\.vibeIdx/);
  assert.match(app, /value !== null && value !== ''/);
  assert.match(app, /<ReleasedPackLibrary/);
  assert.match(app, /currentRelease=\{rawData\?\.actorId/);
  assert.match(routes, /export function vibeAtlasPath/);
  assert.match(routes, /if \(view === 'released'\) return 'released'/);
});

test('released pack library uses bilingual collector copy and fallback source labeling', async () => {
  const source = await readFile(new URL('../src/components/ReleasedPackLibrary/ReleasedPackLibrary.tsx', import.meta.url), 'utf8');
  assert.match(source, /Fandom Collector · 已发布 Vibe Packs/);
  assert.match(source, /Explore released actor × vibe packs—and generate a fresh 图集 from each one/);
  assert.match(source, /Actor \/ 演员/);
  assert.match(source, /Vibe Pack \/ 氛围包/);
  assert.match(source, /Generated from this released Vibe Pack · 来自已发布氛围包/);
  assert.match(source, /Refresh grid · 换一组/);
  assert.match(source, /Image source: backup search · 备用搜索源/);
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