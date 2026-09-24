import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
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
import { ReleasedPackLibrary } from '../src/components/ReleasedPackLibrary/ReleasedPackLibrary.tsx';

function makeGridRun(id: string) {
  return {
    id,
    actorId: 'zhang-linghe',
    vibeIdx: 2,
    generatedAt: '2026-09-24T12:00:00.000Z',
    source: 'search',
    images: Array.from({ length: 9 }, (_, index) => ({
      thumbnail: `https://example.com/${id}-${index + 1}.jpg`,
      title: `Card ${index + 1}`,
      link: `https://example.com/source-${index + 1}`,
      source: 'Example Source',
    })),
  };
}

async function flushReleasedLibrary(times = 6) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function installReleasedLibraryEnvironment(fetchImpl: typeof fetch) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const storage = new Map<string, string>();

  globalThis.fetch = fetchImpl;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'https://example.com', assign() {} },
      __initialAnalyticsLocation: 'https://example.com/',
      dataLayer: [],
      fetch: async () => Response.json({ ok: true }),
      localStorage: {
        getItem(key: string) { return storage.get(key) ?? null; },
        setItem(key: string, value: string) { storage.set(key, value); },
        removeItem(key: string) { storage.delete(key); },
      },
    },
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  return () => {
    globalThis.fetch = originalFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  };
}

test('entitled Released Pack Library keeps English primary while rendering Chinese labels and subtitles', async () => {
  const cleanup = installReleasedLibraryEnvironment((async (input, init) => {
    const url = String(input);
    if (url.endsWith('/.netlify/functions/actor-pack-depth')) {
      return Response.json({
        packs: [{
          id: 'zhang-linghe',
          name: '张凌赫',
          shortName_en: 'Zhang Linghe',
          title_en: 'Zhang Linghe Vibe Atlas',
          vibes: [{
            vibeIdx: 2,
            emoji: '🪷',
            label: '玉色祸水',
            label_en: 'Jade-Faced Calamity',
            subtitle: '美得像玉，危险得像天灾。',
            subtitle_en: 'Beauty like polished jade. Consequences like a natural disaster.',
          }],
        }],
      });
    }
    if (url.includes('/.netlify/functions/collector-grid?actorId=zhang-linghe&vibeIdx=2')) {
      return Response.json({ runs: [makeGridRun('saved-run')] });
    }
    if (url.endsWith('/.netlify/functions/collector-grid') && init?.method === 'POST') {
      return Response.json({ run: makeGridRun('fresh-run') });
    }
    return Response.json({ error: `Unexpected request: ${url}` }, { status: 404 });
  }) as typeof fetch);

  try {
    let library: ReturnType<typeof create>;
    await act(async () => {
      library = create(createElement(ReleasedPackLibrary, {
        status: { state: 'active', isMember: true, capabilities: ['fandom_collector'] },
        membershipResolved: true,
        actorId: 'zhang-linghe',
        vibeIndex: 2,
        source: 'library_navigation',
      }));
    });
    await flushReleasedLibrary();

    const optionText = library!.root.findAllByType('option').map(option => String(option.props.children));
    assert.ok(optionText.includes('Jade-Faced Calamity · 玉色祸水'));

    const openedMarkup = JSON.stringify(library!.toJSON());
    assert.match(openedMarkup, /Jade-Faced Calamity/);
    assert.match(openedMarkup, /玉色祸水/);
    assert.match(openedMarkup, /Beauty like polished jade\. Consequences like a natural disaster\./);
    assert.match(openedMarkup, /美得像玉，危险得像天灾。/);

    const vibeSelect = library!.root.findAllByType('select')[1];
    await act(async () => {
      vibeSelect.props.onChange({ target: { value: '' } });
    });
    await flushReleasedLibrary(2);

    const cardMarkup = JSON.stringify(library!.toJSON());
    assert.match(cardMarkup, /Open grid/);
    assert.match(cardMarkup, /Jade-Faced Calamity/);
    assert.match(cardMarkup, /玉色祸水/);
    assert.match(cardMarkup, /Beauty like polished jade\. Consequences like a natural disaster\./);
    assert.match(cardMarkup, /美得像玉，危险得像天灾。/);

    await act(async () => {
      library!.unmount();
    });
  } finally {
    cleanup();
  }
});

test('signed-out Released Pack teaser keeps its existing bilingual copy without duplicating Chinese', async () => {
  const cleanup = installReleasedLibraryEnvironment((async input => {
    const url = String(input);
    if (url.includes('/.netlify/functions/released-pack-preview?actorId=zhang-linghe&vibeIdx=2')) {
      return Response.json({
        pack: {
          actor: { id: 'zhang-linghe', name: '张凌赫', nameEn: 'Zhang Linghe' },
          vibeIdx: 2,
          vibe: {
            emoji: '🪷',
            label: '玉色祸水',
            labelEn: 'Jade-Faced Calamity',
            subtitle: '美得像玉，危险得像天灾。',
            subtitleEn: 'Beauty like polished jade. Consequences like a natural disaster.',
          },
          preview: {
            copy: 'Preview copy',
            cards: [],
          },
        },
      });
    }
    return Response.json({ error: `Unexpected request: ${url}` }, { status: 404 });
  }) as typeof fetch);

  try {
    let library: ReturnType<typeof create>;
    await act(async () => {
      library = create(createElement(ReleasedPackLibrary, {
        status: null,
        membershipResolved: true,
        actorId: 'zhang-linghe',
        vibeIndex: 2,
        currentRelease: { actorId: 'zhang-linghe', vibeIdx: 2 },
        source: 'daily_star',
      }));
    });
    await flushReleasedLibrary();

    const markup = JSON.stringify(library!.toJSON());
    assert.equal(markup.split('玉色祸水').length - 1, 1);
    assert.equal(markup.split('美得像玉，危险得像天灾。').length - 1, 1);
    assert.match(markup, /Beauty like polished jade\. Consequences like a natural disaster\..*美得像玉，危险得像天灾。/);

    await act(async () => {
      library!.unmount();
    });
  } finally {
    cleanup();
  }
});

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