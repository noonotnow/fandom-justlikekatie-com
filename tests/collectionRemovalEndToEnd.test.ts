/**
 * End-to-end test for the Collection grid-removal flow.
 *
 * Coverage:
 *   - persistRemoval issues a DELETE to /.netlify/functions/grid-exports
 *     with the correct gridId when a grid pending-removal is committed
 *   - the DELETE is NOT issued for card removals (cards have no server exports)
 *   - the DELETE carries the gridId as a query-string parameter
 *
 * The test exercises the real persistRemoval function from Collection.tsx,
 * stubs the network layer (fetch), and confirms that removing
 * deleteGridExports (or breaking its import) would cause the assertion to fail.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// IndexedDB polyfill — dbRemoveGrid and dbSetActiveAccount need it.
// ---------------------------------------------------------------------------
import {
  IDBFactory,
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from 'fake-indexeddb';

Object.assign(globalThis, {
  indexedDB: new IDBFactory(),
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
});

// ---------------------------------------------------------------------------
// Browser globals that schedulePublicCollectionSync (called at the end of
// persistRemoval) needs. They are set up before any module is imported so the
// ESM live-binding is satisfied.
//
//   • localStorage / sessionStorage — read/written by the cleanup queue and
//     the session notification helpers.
//   • window — notifyCollection checks `'BroadcastChannel' in window`; we
//     point it at globalThis (no BroadcastChannel defined here) so the branch
//     resolves false without throwing.
//   • navigator.onLine = true — keeps schedulePublicCollectionSync on the
//     happy path when getPublicSession returns null (no signed-in session).
// ---------------------------------------------------------------------------
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

(globalThis as Record<string, unknown>).localStorage = makeStorage();
(globalThis as Record<string, unknown>).sessionStorage = makeStorage();
(globalThis as Record<string, unknown>).window = globalThis;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { onLine: true },
});

// ---------------------------------------------------------------------------
// Imports — after globals are in place so transitive imports (publicAccount,
// collectionDB) can resolve browser APIs at module initialisation time.
// ---------------------------------------------------------------------------
import { persistRemoval } from '../src/utils/collectionRemoval.ts';
import { dbSaveGrid, type GridRecord } from '../src/utils/collectionDB.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGridRecord(overrides: Partial<GridRecord> = {}): GridRecord {
  return {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: 'e2e-removal-grid-001',
    actorId: 'actor-e2e',
    actor: 'E2E Actor',
    actorEn: 'E2E Actor',
    actorAccentColor: '#aabbcc',
    vibe: '端到端测试',
    vibeEn: 'E2E Vibe',
    vibeEmoji: '🧪',
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    searchSpell: 'e2e test spell',
    edition: { provider: null, misprint: false, legendary: false },
    capturedDate: '2026-08-18',
    generatedAt: '2026-08-18T10:00:00Z',
    savedAt: '2026-08-18T10:00:00Z',
    sourceRoute: '/test',
    images: [
      {
        resultId: 'https://images.example/e2e-img.jpg',
        imageUrl: 'https://images.example/e2e-img.jpg',
        sourceUrl: 'https://publisher.example/e2e-story',
        title: 'E2E Image',
        gridPosition: 0,
      },
    ],
    ...overrides,
  };
}

/** A fetch stub that records calls and returns canned responses. */
function makeFetchStub() {
  const calls: Array<{ url: string; method: string }> = [];
  const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });

    // Session probe from schedulePublicCollectionSync → getPublicSession.
    // Returning {user: null} with status 200 causes getPublicSession to return
    // null early, so the sync branch is skipped without further network calls.
    if (url.includes('/api/auth/session')) {
      return new Response(JSON.stringify({ user: null }), { status: 200 });
    }

    // grid-exports DELETE — the call under test.
    if (url.includes('grid-exports') && method === 'DELETE') {
      return new Response(JSON.stringify({ ok: true, deleted: 1 }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  return { stub: stub as typeof fetch, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('persistRemoval issues DELETE to grid-exports with the correct gridId for a grid removal', async () => {
  const GRID_ID = 'e2e-persist-removal-grid-001';
  const ACCOUNT_ID = 'acct-e2e-1';

  const grid = makeGridRecord({ id: GRID_ID });
  await dbSaveGrid(grid);

  const { stub, calls } = makeFetchStub();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stub;

  try {
    const pending = {
      token: 'tok-e2e-1',
      kind: 'grid' as const,
      record: grid,
      timeoutId: 0,
    };

    await persistRemoval(pending, ACCOUNT_ID);

    const deleteCalls = calls.filter(c => c.method === 'DELETE' && c.url.includes('grid-exports'));
    assert.equal(
      deleteCalls.length,
      1,
      'persistRemoval must issue exactly one DELETE to the grid-exports endpoint',
    );
    assert.match(
      deleteCalls[0].url,
      new RegExp(`gridId=${encodeURIComponent(GRID_ID)}`),
      'DELETE URL must include the correct gridId as a query parameter',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('persistRemoval does NOT call grid-exports DELETE for a card removal', async () => {
  const { stub, calls } = makeFetchStub();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stub;

  try {
    const pending = {
      token: 'tok-e2e-card',
      kind: 'card' as const,
      record: {
        kind: 'card' as const,
        schemaVersion: 1,
        imageUrl: 'https://images.example/card.jpg',
        thumbnailUrl: 'https://images.example/card-thumb.jpg',
        actor: 'E2E Actor',
        actorEn: 'E2E Actor',
        actorId: 'actor-e2e',
        actorAccentColor: '#aabbcc',
        vibe: '测试',
        vibeEn: 'Test',
        vibeEmoji: '🧪',
        capturedDate: '2026-08-18',
        savedAt: '2026-08-18T10:00:00Z',
        sourceRoute: '/test',
      },
      timeoutId: 0,
    };

    await persistRemoval(pending, 'acct-e2e-1');

    const deleteCalls = calls.filter(c => c.method === 'DELETE' && c.url.includes('grid-exports'));
    assert.equal(
      deleteCalls.length,
      0,
      'card removal must not call the grid-exports DELETE endpoint — cards have no server exports',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('persistRemoval calls grid-exports DELETE even without a signed-in accountId', async () => {
  // When no accountId is known, deleteGridExports still fires the DELETE
  // (the server returns an appropriate response); it just skips the durable
  // retry queue since there is no account namespace to scope the retry.
  const GRID_ID = 'e2e-no-account-grid-001';
  const grid = makeGridRecord({ id: GRID_ID });
  await dbSaveGrid(grid);

  const { stub, calls } = makeFetchStub();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stub;

  try {
    const pending = {
      token: 'tok-e2e-noauth',
      kind: 'grid' as const,
      record: grid,
      timeoutId: 0,
    };

    await persistRemoval(pending, undefined);

    const deleteCalls = calls.filter(c => c.method === 'DELETE' && c.url.includes('grid-exports'));
    assert.equal(
      deleteCalls.length,
      1,
      'DELETE must still be issued without an accountId (best-effort cleanup even when signed out)',
    );
    assert.match(
      deleteCalls[0].url,
      new RegExp(`gridId=${encodeURIComponent(GRID_ID)}`),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
