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
import { IDBFactory } from 'fake-indexeddb';
import { dbGetAllCards, dbGetAllGrids } from '../src/utils/collectionDB.ts';

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
  const originalIndexedDB = globalThis.indexedDB;
  const originalLocalStorage = globalThis.localStorage;
  const originalNavigator = globalThis.navigator;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const storage = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();

  globalThis.fetch = fetchImpl;
  globalThis.indexedDB = new IDBFactory();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'https://example.com', assign() {} },
      addEventListener(type: string, listener: () => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: () => void) { listeners.get(type)?.delete(listener); },
      dispatchEvent(event: Event) {
        for (const listener of listeners.get(event.type) || []) listener();
        return true;
      },
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
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: window.localStorage });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  return () => {
    globalThis.fetch = originalFetch;
    globalThis.indexedDB = originalIndexedDB;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
  };
}

test('signed-out visitors browse public pack previews without requesting Collector depth', async () => {
  const requests: string[] = [];
  const cleanup = installReleasedLibraryEnvironment((async input => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('/.netlify/functions/released-pack-directory')) {
      return Response.json({
        kind: 'vibe-atlas-public-pack-directory',
        packs: [{
          actor: { id: 'liu-xueyi', nameEn: 'Liu Xueyi' },
          vibeIdx: 2,
          vibe: { labelEn: 'Polished Danger' },
          canonical: 'https://example.com/vibe-atlas/packs/liu-xueyi/polished-danger-2/',
          preview: { copy: 'A public editorial preview.', cards: [{ title: 'Card one', thumbnailUrl: 'https://example.com/card.jpg' }] },
        }],
      });
    }
    return Response.json({ error: 'Unexpected request' }, { status: 404 });
  }) as typeof fetch);
  try {
    let library: ReturnType<typeof create>;
    await act(async () => {
      library = create(createElement(ReleasedPackLibrary, {
        status: null,
        membershipResolved: true,
        source: 'library_navigation',
      }));
    });
    await flushReleasedLibrary();
    const markup = JSON.stringify(library!.toJSON());
    assert.match(markup, /Liu Xueyi.*Polished Danger/);
    assert.match(markup, /vibe-atlas\/packs\/liu-xueyi\/polished-danger-2/);
    assert.deepEqual(requests, ['/api/auth/session', '/.netlify/functions/released-pack-directory']);
    await act(async () => { library!.unmount(); });
  } finally {
    cleanup();
  }
});

test('a signed-in free account sees an upgrade, not another sign-in form or Collector depth', async () => {
  const requests: string[] = [];
  const cleanup = installReleasedLibraryEnvironment((async input => {
    const url = String(input);
    requests.push(url);
    if (url === '/api/auth/session') {
      return Response.json({ user: { accountId: 'usr_free', email: 'free@example.com' } });
    }
    if (url === '/.netlify/functions/released-pack-directory') {
      return Response.json({ packs: [] });
    }
    return Response.json({ error: 'Unexpected request' }, { status: 404 });
  }) as typeof fetch);
  try {
    let library: ReturnType<typeof create>;
    await act(async () => {
      library = create(createElement(ReleasedPackLibrary, {
        status: { state: 'inactive', isMember: false, capabilities: [] },
        membershipResolved: true,
        source: 'library_navigation',
      }));
    });
    await flushReleasedLibrary();
    const markup = JSON.stringify(library!.toJSON());
    assert.match(markup, /You’re signed in/);
    assert.match(markup, /Become a Fandom Collector/);
    assert.doesNotMatch(markup, /Already have an account\\?/);
    assert.equal(requests.some(url => url.includes('actor-pack-depth') || url.includes('collector-grid')), false);
    await act(async () => library!.unmount());
  } finally {
    cleanup();
  }
});

test('entitled Released Pack Library keeps English primary while rendering Chinese labels and subtitles', async () => {
  const syncedOperations: Array<{ type: string; item?: { kind?: string } }> = [];
  const failedKinds = new Set<string>();
  const cleanup = installReleasedLibraryEnvironment((async (input, init) => {
    const url = String(input);
    if (url === '/api/auth/session') {
      return Response.json({ user: { accountId: 'usr_collector', email: 'collector@example.com' } });
    }
    if (url === '/api/collection/sync') {
      const payload = JSON.parse(String(init?.body)) as {
        operations: Array<{ type: string; localId: string; mutationId: string; item?: { kind?: string } }>;
      };
      const kind = payload.operations[0]?.item?.kind || '';
      if (!failedKinds.has(kind)) {
        failedKinds.add(kind);
        return Response.json({ error: 'Connection interrupted' }, { status: 503 });
      }
      syncedOperations.push(...payload.operations);
      return Response.json({
        cursor: syncedOperations.length,
        items: [],
        tombstones: [],
        mappings: Object.fromEntries(payload.operations.map(operation => [operation.localId, `server-${operation.localId}`])),
        acknowledgedMutationIds: payload.operations.map(operation => operation.mutationId),
      });
    }
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

    const saveButton = (text: string) => library!.root.findAllByType('button')
      .find(button => JSON.stringify(button.props.children).includes(text));
    assert.ok(saveButton('Save image'));
    assert.ok(saveButton('Save grid to My Collection'));
    await act(async () => { saveButton('Save image')!.props.onClick(); });
    await flushReleasedLibrary();
    assert.equal((await dbGetAllCards()).length, 1);
    assert.equal((await dbGetAllCards())[0].resultId, 'fresh-run:card-1');
    for (let attempt = 0; attempt < 30 && !failedKinds.has('card'); attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await flushReleasedLibrary();
    assert.ok(saveButton('Retry image sync'), 'a failed explicit image save remains retryable');
    await act(async () => { saveButton('Retry image sync')!.props.onClick(); });
    for (let attempt = 0; attempt < 30 && syncedOperations.length < 1; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await flushReleasedLibrary();
    await act(async () => { saveButton('Save grid to My Collection')!.props.onClick(); });
    await flushReleasedLibrary();
    assert.equal((await dbGetAllGrids()).length, 1);
    assert.equal((await dbGetAllGrids())[0].images.length, 9);
    for (let attempt = 0; attempt < 30 && !failedKinds.has('grid'); attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await flushReleasedLibrary();
    assert.ok(saveButton('Retry grid sync'), 'a failed explicit grid save remains retryable');
    await act(async () => { window.dispatchEvent(new Event('online')); });
    for (let attempt = 0; attempt < 30 && syncedOperations.length < 2; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await flushReleasedLibrary();
    assert.deepEqual(syncedOperations.map(operation => operation.item?.kind), ['card', 'grid']);
    assert.match(JSON.stringify(library!.toJSON()), /Grid synced to My Collection/);

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
        source: 'public_record',
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

test('signed-out Released Pack page shows graceful fallback when public teaser images are unavailable', async () => {
  const cleanup = installReleasedLibraryEnvironment((async input => {
    const url = String(input);
    if (url.includes('/.netlify/functions/released-pack-preview?actorId=liu-xueyi&vibeIdx=2')) {
      return Response.json({
        pack: {
          actor: { id: 'liu-xueyi', name: '刘学义', nameEn: 'Liu Xueyi' },
          vibeIdx: 2,
          vibe: {
            emoji: '🤓',
            label: '斯文败类',
            labelEn: 'Polished Danger',
            subtitle: '眼镜一戴，危险变得很有礼貌',
            subtitleEn: 'Put the glasses on. The danger got extremely polite.',
          },
          preview: {
            copy: 'This released Vibe Pack is available to Collectors now. Public teaser images are being prepared.',
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
        actorId: 'liu-xueyi',
        vibeIndex: 2,
        source: 'public_record',
      }));
    });
    await flushReleasedLibrary();

    const markup = JSON.stringify(library!.toJSON());
    assert.doesNotMatch(markup, /Released pack preview not found/i);
    assert.match(markup, /Public teaser images are unavailable right now/);
    assert.match(markup, /available to Collectors now/);
    assert.match(markup, /Become a Fandom Collector/);

    await act(async () => {
      library!.unmount();
    });
  } finally {
    cleanup();
  }
});

test('daily-star navigation shows only the other verified packs for that actor', async () => {
  const requests: string[] = [];
  const cleanup = installReleasedLibraryEnvironment((async input => {
    const url = String(input);
    requests.push(url);
    if (url === '/.netlify/functions/released-pack-directory') {
      const pack = (actorId: string, name: string, vibeIdx: number, label: string) => ({
        actor: { id: actorId, nameEn: name },
        vibeIdx,
        vibe: { labelEn: label },
        canonical: `https://example.com/vibe-atlas/packs/${actorId}/${vibeIdx}/`,
        preview: { copy: `${label} preview`, cards: [{ title: label, thumbnailUrl: 'https://example.com/card.jpg' }] },
      });
      return Response.json({
        kind: 'vibe-atlas-public-pack-directory',
        packs: [
          pack('liu-xueyi', 'Liu Xueyi', 2, 'Polished Danger'),
          pack('dylan-wang', 'Dylan Wang', 0, 'Today’s free vibe'),
          pack('dylan-wang', 'Dylan Wang', 1, 'Courtly Chaos'),
          pack('dylan-wang', 'Dylan Wang', 2, 'Moonlit Defiance'),
        ],
      });
    }
    return Response.json({ error: 'Unexpected request' }, { status: 404 });
  }) as typeof fetch);

  try {
    let library: ReturnType<typeof create>;
    await act(async () => {
      library = create(createElement(ReleasedPackLibrary, {
        status: null,
        membershipResolved: true,
        actorId: 'dylan-wang',
        actorName: 'Dylan Wang',
        vibeIndex: 0,
        currentRelease: { actorId: 'dylan-wang', vibeIdx: 0 },
        source: 'daily_star',
      }));
    });
    await flushReleasedLibrary();
    const markup = JSON.stringify(library!.toJSON());
    assert.match(markup, /Dylan Wang’s other Vibe Packs/);
    assert.match(markup, /Courtly Chaos/);
    assert.match(markup, /Moonlit Defiance/);
    assert.doesNotMatch(markup, /Liu Xueyi|Polished Danger|Today’s free vibe|no published public teaser yet/);
    assert.deepEqual(requests.filter(url => url.startsWith('/.netlify/functions/')), [
      '/.netlify/functions/released-pack-directory',
    ]);
    await act(async () => { library!.unmount(); });
  } finally {
    cleanup();
  }
});

test('daily-star navigation never fills an empty Dylan view with another actor’s teaser', async () => {
  const cleanup = installReleasedLibraryEnvironment((async input => {
    if (String(input) === '/.netlify/functions/released-pack-directory') {
      return Response.json({
        kind: 'vibe-atlas-public-pack-directory',
        packs: [{
          actor: { id: 'liu-xueyi', nameEn: 'Liu Xueyi' },
          vibeIdx: 3,
          vibe: { labelEn: 'Professionally Devastated' },
          canonical: 'https://example.com/vibe-atlas/packs/liu-xueyi/devastated-3/',
          preview: { copy: 'Liu preview', cards: [] },
        }],
      });
    }
    return Response.json({ user: null });
  }) as typeof fetch);
  try {
    let library: ReturnType<typeof create>;
    await act(async () => {
      library = create(createElement(ReleasedPackLibrary, {
        status: null,
        membershipResolved: true,
        actorId: 'dylan-wang',
        actorName: 'Dylan Wang',
        vibeIndex: 0,
        currentRelease: { actorId: 'dylan-wang', vibeIdx: 0 },
        source: 'daily_star',
      }));
    });
    await flushReleasedLibrary();
    const markup = JSON.stringify(library!.toJSON());
    assert.match(markup, /Dylan Wang’s other packs do not have verified public previews ready yet/);
    assert.doesNotMatch(markup, /Liu Xueyi|Professionally Devastated|no published public teaser yet/);
    await act(async () => { library!.unmount(); });
  } finally {
    cleanup();
  }
});

test('article-linked Liu Xueyi teaser opens its exact pack, not the public actor directory', async () => {
  const requests: string[] = [];
  const cleanup = installReleasedLibraryEnvironment((async input => {
    const url = String(input);
    requests.push(url);
    if (url.includes('/.netlify/functions/released-pack-preview?actorId=liu-xueyi&vibeIdx=2')) {
      return Response.json({
        pack: {
          actor: { id: 'liu-xueyi', nameEn: 'Liu Xueyi' },
          vibeIdx: 2,
          vibe: { labelEn: 'Polished Danger' },
          preview: { copy: 'Article-linked preview', cards: [
            { title: 'Preview 1', thumbnailUrl: 'https://example.com/one.jpg' },
          ] },
        },
      });
    }
    return Response.json({ error: 'Unexpected request' }, { status: 404 });
  }) as typeof fetch);
  try {
    let library: ReturnType<typeof create>;
    await act(async () => {
      library = create(createElement(ReleasedPackLibrary, {
        status: null,
        membershipResolved: true,
        actorId: 'liu-xueyi',
        vibeIndex: 2,
        source: 'article',
      }));
    });
    await flushReleasedLibrary();
    const markup = JSON.stringify(library!.toJSON());
    assert.match(markup, /Polished Danger/);
    assert.match(markup, /Article-linked preview/);
    assert.doesNotMatch(markup, /Browse public pack previews|Dylan Wang/);
    assert.deepEqual(requests.filter(url => url.startsWith('/.netlify/functions/')), [
      '/.netlify/functions/released-pack-preview?actorId=liu-xueyi&vibeIdx=2',
    ]);
    await act(async () => { library!.unmount(); });
  } finally {
    cleanup();
  }
});

test('Against the Current links only its two named packs, not the actor directory', async () => {
  const article = await readFile(new URL('../public/c-drama-fandom/vibing-now/against-the-current-episode-21/index.html', import.meta.url), 'utf8');
  for (const vibeIdx of [1, 2]) {
    assert.match(article, new RegExp(`source=article&amp;actorId=liu-xueyi&amp;vibeIdx=${vibeIdx}`));
  }
  assert.doesNotMatch(article, /source=library_navigation&amp;actorId=liu-xueyi/);
  assert.match(article, /Silk-Robed Damage Control.*Pack candidate · unreleased/);
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
  assert.match(app, /source: 'daily_star',\s*\.\.\.\(hasCollectorCapability\(membershipStatus\) \? \{/);
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