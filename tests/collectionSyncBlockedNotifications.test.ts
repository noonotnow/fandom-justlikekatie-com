import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  dbGetAllCards,
  dbGetAllGrids,
  dbGetSyncState,
  dbSaveCard,
  dbSaveGrid,
  dbSetMergeDecision,
  type CardRecord,
  type GridRecord,
} from '../src/utils/collectionDB.ts';
import {
  schedulePublicCollectionSync,
  syncPublicCollection,
  syncPublicGrid,
} from '../src/utils/publicAccount.ts';

test('Collection sync persists server changes and succeeds when cross-tab notifications are blocked', async () => {
  const keys = ['indexedDB', 'window', 'navigator', 'localStorage', 'sessionStorage', 'fetch'] as const;
  const originals = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const accountId = 'blocked-notification-account';
  const user = { accountId, email: 'member@example.test' };
  const card: CardRecord = {
    localId: 'blocked-notification-card',
    imageUrl: 'https://images.example/card.jpg',
    thumbnailUrl: 'https://images.example/card-thumb.jpg',
    resultId: 'result-card',
    actor: 'Local Actor',
    actorEn: 'Local Actor',
    vibe: 'Local Vibe',
    vibeEn: 'Local Vibe',
    vibeEmoji: '✨',
    capturedDate: '2026-09-24',
    savedAt: '2026-09-24T00:00:00Z',
  };
  const notices = new Map<string, string>();
  const notifications: string[] = [];
  const syncRequests: Array<{ operations: Array<{ mutationId: string; localId: string }> }> = [];
  let onlineListeners = 0;
  let resolveScheduledSync!: () => void;
  const scheduledSync = new Promise<void>(resolve => { resolveScheduledSync = resolve; });

  try {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
    // Deliberately omit BroadcastChannel from window, regardless of Node's globals.
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener: (event: string) => { if (event === 'online') onlineListeners += 1; } },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: true },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        setItem: (key: string, value: string) => {
          assert.equal(key, 'fandom-collection-notify');
          notifications.push(value.split(':')[0]);
          if (notifications.filter(type => type === 'synced').length === 2) resolveScheduledSync();
          throw new Error('Storage writes are blocked');
        },
      },
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: { setItem: (key: string, value: string) => { notices.set(key, value); } },
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string, init?: RequestInit) => {
        if (url === '/.netlify/functions/log-engagement') return new Response('{}');
        if (url === '/api/auth/session') {
          return Response.json({ user }, { headers: { 'content-type': 'application/json' } });
        }
        assert.equal(url, '/api/collection/sync');
        assert.equal(init?.method, 'POST');
        const payload = JSON.parse(String(init?.body)) as { operations: Array<{ mutationId: string; localId: string }> };
        syncRequests.push(payload);
        const first = syncRequests.length === 1;
        return Response.json({
          cursor: syncRequests.length,
          items: first ? [{
            ...card,
            kind: 'card',
            id: 'server-card',
            actor: 'Server Actor',
            revision: 1,
          }] : [],
          tombstones: [],
          mappings: first ? { [card.localId!]: 'server-card' } : {},
          acknowledgedMutationIds: payload.operations.map(operation => operation.mutationId),
        });
      },
    });

    await dbSaveCard(card);
    await dbSetMergeDecision(accountId, true);
    await assert.doesNotReject(syncPublicCollection(user));

    const saved = (await dbGetAllCards()).find(item => item.localId === card.localId);
    assert.equal(saved?.actor, 'Server Actor');
    assert.equal(saved?.serverId, 'server-card');
    assert.equal((await dbGetSyncState()).cursors[accountId], 2);
    assert.equal(syncRequests.length, 2);
    assert.equal(syncRequests[0].operations.length, 1);
    assert.deepEqual(syncRequests[1].operations, []);

    schedulePublicCollectionSync();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        scheduledSync,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Scheduled sync did not finish')), 2000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    assert.deepEqual(notifications, ['synced', 'local-change', 'synced']);
    assert.equal(syncRequests.length, 3, 'notification failure must not resubmit acknowledged changes');
    assert.deepEqual(syncRequests[2].operations, []);
    assert.equal(notices.has('fandom_auth_notice'), false);
    assert.equal(onlineListeners, 0);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('Selected grid sync persists the server response when cross-tab notifications are blocked', async () => {
  const keys = ['indexedDB', 'window', 'navigator', 'localStorage', 'fetch'] as const;
  const originals = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const accountId = 'blocked-grid-notification-account';
  const user = { accountId, email: 'member@example.test' };
  const grid: GridRecord = {
    localId: 'selected-grid-local-id',
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: 'selected-grid',
    actorId: 'actor-1',
    actor: 'Local Actor',
    actorEn: 'Local Actor',
    actorAccentColor: '#c9a96e',
    vibe: 'Local Vibe',
    vibeEn: 'Local Vibe',
    vibeEmoji: '✨',
    vibeSubtitle: 'Local subtitle',
    vibeSubtitleEn: 'Local subtitle',
    searchSpell: 'search',
    edition: { provider: null, misprint: false, legendary: false },
    capturedDate: '2026-09-24',
    generatedAt: '2026-09-24T00:00:00Z',
    savedAt: '2026-09-24T00:00:00Z',
    sourceRoute: '/',
    images: [],
  };
  const notifications: string[] = [];
  const requests: Array<{ operations: Array<{
    type: string;
    localId: string;
    mutationId: string;
    item: { kind: string; id: string };
  }> }> = [];

  try {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
    // Node can provide BroadcastChannel globally; it must be absent from the browser window.
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        setItem: (key: string, value: string) => {
          assert.equal(key, 'fandom-collection-notify');
          notifications.push(value.split(':')[0]);
          throw new Error('Storage writes are blocked');
        },
      },
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/session') {
          return Response.json({ user }, { headers: { 'content-type': 'application/json' } });
        }
        assert.equal(url, '/api/collection/sync');
        assert.equal(init?.method, 'POST');
        const payload = JSON.parse(String(init?.body)) as typeof requests[number];
        requests.push(payload);
        return Response.json({
          cursor: 7,
          items: [{
            ...grid,
            id: 'server-grid',
            artifactId: grid.id,
            actor: 'Server Actor',
            revision: 1,
          }],
          tombstones: [],
          mappings: { [grid.localId!]: 'server-grid' },
          acknowledgedMutationIds: payload.operations.map(operation => operation.mutationId),
        });
      },
    });

    await dbSaveGrid(grid);
    await dbSetMergeDecision(accountId, false);
    await assert.doesNotReject(syncPublicGrid(user, grid.id));

    assert.equal(requests.length, 1);
    assert.equal(requests[0].operations.length, 1);
    assert.equal(requests[0].operations[0].type, 'upsert');
    assert.equal(requests[0].operations[0].item.kind, 'grid');
    assert.equal(requests[0].operations[0].item.id, grid.id);
    assert.equal(requests[0].operations[0].localId, grid.localId);
    const saved = (await dbGetAllGrids()).find(item => item.id === grid.id);
    assert.equal(saved?.actor, 'Server Actor');
    assert.equal(saved?.serverId, 'server-grid');
    assert.equal((await dbGetSyncState()).cursors[accountId], 7);
    assert.deepEqual(notifications, ['synced']);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});