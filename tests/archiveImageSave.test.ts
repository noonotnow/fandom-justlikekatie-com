import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { act, create } from 'react-test-renderer';
import { createElement } from 'react';
import { IDBFactory } from 'fake-indexeddb';
import {
  ArchiveImageSaveError,
  authorizeArchiveImageSave,
} from '../src/utils/archiveImageSave.ts';
import { useSaveItem } from '../src/hooks/useSaveItem.ts';
import { vibeAtlasPath } from '../src/utils/fandomRoutes.ts';

const routeSource = await readFile(new URL('../src/hooks/useStarOfDay.ts', import.meta.url), 'utf8');
const itemSource = await readFile(new URL('../src/components/GridItem/GridItem.tsx', import.meta.url), 'utf8');
const inlineSource = await readFile(new URL('../src/components/InlinePreview/InlinePreview.tsx', import.meta.url), 'utf8');
const lightboxSource = await readFile(new URL('../src/components/Lightbox/Lightbox.tsx', import.meta.url), 'utf8');
const saveButtonSource = await readFile(new URL('../src/components/SaveButton/SaveButton.tsx', import.meta.url), 'utf8');
const membershipSource = await readFile(new URL('../src/components/Membership/Membership.tsx', import.meta.url), 'utf8');
const saveHookSource = await readFile(new URL('../src/hooks/useSaveItem.ts', import.meta.url), 'utf8');
const exportButtonSource = await readFile(new URL('../src/components/ExportCardButton/ExportCardButton.tsx', import.meta.url), 'utf8');
const cardRendererSource = await readFile(new URL('../src/utils/cardRenderer.ts', import.meta.url), 'utf8');

test('archive individual save authorization sends the edition and raw image identity', async () => {
  const originalFetch = globalThis.fetch;
  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    request = { url: String(url), init };
    return Response.json({
      allowed: true,
      date: '2026-05-16',
      imageId: 'archive:2026-05-16:card-2',
    });
  }) as typeof fetch;
  try {
    await authorizeArchiveImageSave('2026-05-16', 'https://images.example.test/raw-result.jpg', 2);
    assert.equal(request?.url, '/.netlify/functions/archive-image-save');
    assert.equal(request?.init?.method, 'POST');
    assert.equal(request?.init?.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      date: '2026-05-16',
      imageId: 'https://images.example.test/raw-result.jpg',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('archive individual save authorization classifies sign-in, upgrade, and retry responses', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    { response: new Response(JSON.stringify({ access: 'sign_in' }), { status: 401 }), failure: 'sign_in' },
    { response: new Response(JSON.stringify({ access: 'upgrade' }), { status: 403 }), failure: 'upgrade' },
    { response: new Response(JSON.stringify({ access: 'billing_delay' }), { status: 503 }), failure: 'retry' },
    { response: new Response(JSON.stringify({ access: 'billing_delay' }), { status: 403 }), failure: 'retry' },
    { response: new Response(JSON.stringify({ error: 'invalid origin' }), { status: 403 }), failure: 'retry' },
    { response: new Response(JSON.stringify({ error: 'not published' }), { status: 404 }), failure: 'retry' },
    { response: new Response('{malformed', { status: 200, headers: { 'Content-Type': 'application/json' } }), failure: 'retry' },
    { response: Response.json({ date: '2026-05-16', imageId: 'archive:2026-05-16:card-3' }), failure: 'retry' },
    { response: Response.json({ allowed: true, date: '2026-05-17', imageId: 'archive:2026-05-16:card-3' }), failure: 'retry' },
    { response: Response.json({ allowed: true, date: '2026-05-16', imageId: ' ' }), failure: 'retry' },
    { response: Response.json({ allowed: true, date: '2026-05-16', imageId: 'archive:2026-05-16:card-3' }), failure: 'retry' },
    { response: Response.json({ allowed: true, date: '2026-05-16', imageId: 'archive:2026-05-16:card-9' }), failure: 'retry' },
  ] as const;
  try {
    for (const item of responses) {
      globalThis.fetch = (async () => item.response) as typeof fetch;
      await assert.rejects(
        authorizeArchiveImageSave('2026-05-16', 'raw-result-id'),
        error => error instanceof ArchiveImageSaveError && error.failure === item.failure,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily card authorization accepts only the same raw identity or its exact in-board canonical identity', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({
      allowed: true,
      date: '2026-05-16',
      imageId: 'archive:2026-05-16:card-2',
    })) as typeof fetch;
    await authorizeArchiveImageSave('2026-05-16', 'https://images.example.test/card-3.jpg', 2);

    for (const position of [1, 9, -1]) {
      await assert.rejects(
        authorizeArchiveImageSave('2026-05-16', 'https://images.example.test/card-3.jpg', position),
        (error: unknown) => error instanceof ArchiveImageSaveError && error.failure === 'retry',
      );
    }

    globalThis.fetch = (async () => Response.json({
      allowed: true,
      date: '2026-05-16',
      imageId: 'https://images.example.test/card-3.jpg',
    })) as typeof fetch;
    await authorizeArchiveImageSave('2026-05-16', 'https://images.example.test/card-3.jpg');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid edition dates and missing identities fail closed without a request', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return Response.json({ allowed: true });
  }) as typeof fetch;
  try {
    await assert.rejects(authorizeArchiveImageSave('2026-02-30', 'raw-result-id'), ArchiveImageSaveError);
    await assert.rejects(authorizeArchiveImageSave('2026-05-16', '   '), ArchiveImageSaveError);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a malformed successful archive response never writes local storage', async () => {
  const originalIndexedDB = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalStorageEvent = globalThis.StorageEvent;
  const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const store = new Map<string, string>();
  class TestStorageEvent extends Event {
    key: string | null;
    newValue: string | null;
    constructor(type: string, init: StorageEventInit) {
      super(type);
      this.key = init.key ?? null;
      this.newValue = init.newValue ?? null;
    }
  }
  globalThis.window = new EventTarget() as Window & typeof globalThis;
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  } as Storage;
  globalThis.StorageEvent = TestStorageEvent as typeof StorageEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async () => {
    return new Response('{malformed', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  let toggleSave!: () => Promise<boolean | undefined>;
  let renderedFailure: string | null = null;
  function HookHarness() {
    const hook = useSaveItem('raw-result-id', '2026-05-16');
    toggleSave = hook.toggleSave;
    renderedFailure = hook.archiveSaveFailure;
    return null;
  }

  try {
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(createElement(HookHarness)); });
    let result: boolean | undefined;
    await act(async () => { result = await toggleSave(); });
    assert.equal(result, undefined);
    assert.equal(store.has('vibe-atlas-saved-items'), false);
    assert.equal(renderedFailure, 'retry');
    await act(async () => { renderer!.unmount(); });
  } finally {
    globalThis.indexedDB = originalIndexedDB;
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
    globalThis.StorageEvent = originalStorageEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});

test('daily and historical save controls retain the server-issued date and raw image identity', () => {
  assert.match(routeSource, /archiveDate: data\.date/);
  assert.match(routeSource, /archiveImageId: result\.imageId \|\| result\.thumbnail/);
  assert.match(itemSource, /<SaveButton[\s\S]*?itemId=\{id\}[\s\S]*?archiveDate=\{archiveDate\}[\s\S]*?archiveImageId=\{archiveImageId\}[\s\S]*?item=\{item\}/);
  assert.match(inlineSource, /<SaveButton[\s\S]*?itemId=\{item\.id\}[\s\S]*?archiveDate=\{item\.archiveDate\}[\s\S]*?archiveImageId=\{item\.archiveImageId\}[\s\S]*?item=\{item\}/);
  assert.match(lightboxSource, /useSaveItem\([\s\S]*?planData\?\.date,[\s\S]*?current\?\.archiveImageId \|\| current\?\.id,[\s\S]*?gridPosition: current\.gridPosition \?\? currentIndex/);
  assert.doesNotMatch(lightboxSource, /dbSaveCard|dbRemoveCard|authorizeArchiveImageSave/, 'lightbox must use the same mutation coordinator as cards and previews');
  assert.match(saveHookSource, /else \{\s*await dbRemoveCard/);
  assert.match(saveButtonSource, /archiveSaveFailure === 'sign_in'/);
  assert.match(saveButtonSource, /archiveSaveFailure === 'upgrade'/);
  assert.match(saveButtonSource, /archiveSaveFailure === 'retry'/);
  assert.match(saveButtonSource, /href=\{path\(vibeAtlasPath\(\{ view: 'membership' \}\)\)\}/);
  assert.match(lightboxSource, /href=\{path\(vibeAtlasPath\(\{ view: 'membership' \}\)\)\}/);
  assert.equal(vibeAtlasPath({ view: 'membership' }), '/vibe-atlas?view=membership');
  assert.match(saveHookSource, /if \(newSavedState\) \{[\s\S]*?authorizeArchiveImageSave\([\s\S]*?archiveImageId \|\| itemId,[\s\S]*?item\?\.gridPosition[\s\S]*?dbSaveCard\(card\)[\s\S]*?storage\.removeItem\(itemId\)/);
  assert.doesNotMatch(saveHookSource, /storage\.saveItem\(itemId\)/, 'new Collection saves must not be duplicated as legacy bookmarks');
  assert.match(saveHookSource, /startingVersion !== saveItemStateVersion\(imageKey\)/);
});

test('membership copy keeps complete public boards free and puts only older individual-card saves in Collector', () => {
  assert.match(membershipSource, /editions no more than three days old/);
  assert.match(membershipSource, /Browse every published historical edition board/);
  assert.match(membershipSource, /Build and export grids from the public Archive/);
  assert.match(membershipSource, /Verified individual-card saves from older published editions/);
  assert.match(membershipSource, /Every published historical board stays free to browse, build from, and export/);
  assert.doesNotMatch(membershipSource, /complete historical edition boards|complete historical boards/i);
});

test('official individual-card exports render the card thumbnail without persisting a save or fetching its delivery original', () => {
  assert.match(exportButtonSource, /imageUrl: image\.thumbnail/);
  assert.match(cardRendererSource, /loadImage\(metadata\.imageUrl\)/);
  assert.doesNotMatch(exportButtonSource, /deliveryUrl|dbSaveCard|storage\.saveItem|archive-image-save/);
});