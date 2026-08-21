/**
 * Tests for durable cleanup of persisted export blobs when a grid is removed.
 *
 * Coverage:
 *   - deleteGridExports issues a DELETE keyed by gridId and resolves true on 200
 *   - a failed DELETE (500 or network error) queues the (gridId, accountId)
 *     pair durably
 *   - retryPendingExportCleanups retries queued entries for the CURRENT
 *     account only — another account's session must not dequeue foreign work
 *   - the queue never evicts pending entries (no size cap)
 *   - failures stay queued across retry attempts until one succeeds
 *   - Collection and GridBuilder both invoke cleanup on their removal paths
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_KEY = 'fandom-export-cleanup-queue';

// Minimal localStorage stub for the Node test environment.
function installLocalStorage() {
  const map = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
  return map;
}

function queue(): Array<{ gridId: string; accountId: string }> {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
}

test('deleteGridExports resolves true on 200 and does not queue', async () => {
  installLocalStorage();
  const { deleteGridExports } = await import('../src/utils/gridExportLog');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method?: string }> = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method });
      return new Response(JSON.stringify({ ok: true, deleted: 2 }), { status: 200 });
    }) as typeof fetch;

    const ok = await deleteGridExports('grid-ok', 'acct-1');
    assert.equal(ok, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /grid-exports\?gridId=grid-ok/);
    assert.equal(calls[0].method, 'DELETE');
    assert.deepEqual(queue(), [], 'no queue entry on success');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a 500 DELETE queues the (gridId, accountId) pair; retry with 200 drains it', async () => {
  installLocalStorage();
  const { deleteGridExports, retryPendingExportCleanups } = await import('../src/utils/gridExportLog');
  const originalFetch = globalThis.fetch;
  try {
    // First attempt: server reports a partial blob-delete failure (500).
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'partial failure', failed: 1 }), { status: 500 })
    ) as typeof fetch;
    const first = await deleteGridExports('grid-flaky', 'acct-1');
    assert.equal(first, false, 'failed DELETE resolves false, never throws');
    assert.deepEqual(queue(), [{ gridId: 'grid-flaky', accountId: 'acct-1' }]);

    // Retry attempt under the same account: storage recovered, DELETE succeeds.
    const retryCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      retryCalls.push(String(input));
      return new Response(JSON.stringify({ ok: true, deleted: 3 }), { status: 200 });
    }) as typeof fetch;
    await retryPendingExportCleanups('acct-1');
    assert.equal(retryCalls.length, 1, 'queued id retried exactly once');
    assert.match(retryCalls[0], /gridId=grid-flaky/);
    assert.deepEqual(queue(), [], 'queue drained after successful retry');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("another account's session must not retry or dequeue foreign entries", async () => {
  installLocalStorage();
  const { deleteGridExports, retryPendingExportCleanups } = await import('../src/utils/gridExportLog');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('{}', { status: 500 })) as typeof fetch;
    await deleteGridExports('grid-a', 'acct-A');

    // Account B signs in; the server would return 200 for B's empty namespace,
    // which must NOT dequeue A's pending cleanup.
    const bCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      bCalls.push(String(input));
      return new Response('{"ok":true,"deleted":0}', { status: 200 });
    }) as typeof fetch;
    await retryPendingExportCleanups('acct-B');
    assert.equal(bCalls.length, 0, "B's session must not issue A's cleanup requests");
    assert.deepEqual(queue(), [{ gridId: 'grid-a', accountId: 'acct-A' }], "A's entry survives B's session");

    // A signs back in: entry is retried and drained.
    await retryPendingExportCleanups('acct-A');
    assert.deepEqual(queue(), [], "A's entry drained under A's session");

    // A signed-out retry pass is a no-op.
    await retryPendingExportCleanups(undefined);
    assert.deepEqual(queue(), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the queue never evicts pending entries (no size cap)', async () => {
  installLocalStorage();
  const { deleteGridExports } = await import('../src/utils/gridExportLog');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => { throw new TypeError('network down'); }) as typeof fetch;
    for (let i = 0; i < 75; i++) await deleteGridExports(`grid-${i}`, 'acct-1');
    assert.equal(queue().length, 75, 'all 75 failed cleanups remain queued');
    assert.equal(queue()[0].gridId, 'grid-0', 'oldest entry retained');
    assert.equal(queue()[74].gridId, 'grid-74', 'newest entry retained');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('failures stay queued across retry attempts until one succeeds', async () => {
  installLocalStorage();
  const { deleteGridExports, retryPendingExportCleanups } = await import('../src/utils/gridExportLog');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => { throw new TypeError('network down'); }) as typeof fetch;
    await deleteGridExports('grid-a', 'acct-1');
    await deleteGridExports('grid-b', 'acct-1');
    await retryPendingExportCleanups('acct-1');
    assert.equal(queue().length, 2, 'failed retries keep entries queued');

    // One id recovers.
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('grid-a')) return new Response('{"ok":true}', { status: 200 });
      throw new TypeError('still down');
    }) as typeof fetch;
    await retryPendingExportCleanups('acct-1');
    assert.deepEqual(queue(), [{ gridId: 'grid-b', accountId: 'acct-1' }], 'only the recovered id leaves the queue');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// Removal flows invoke cleanup (source-level, matching gridExportPersist.test.ts)
// ---------------------------------------------------------------------------

const collectionSource = readFileSync(
  path.join(__dirname, '../src/components/Collection/Collection.tsx'),
  'utf8',
);
// persistRemoval was extracted to a standalone utility so it can be imported
// and tested behaviourally in collectionRemovalEndToEnd.test.ts without CSS deps.
const collectionRemovalSource = readFileSync(
  path.join(__dirname, '../src/utils/collectionRemoval.ts'),
  'utf8',
);
const builderSource = readFileSync(
  path.join(__dirname, '../src/components/GridBuilder/GridBuilder.tsx'),
  'utf8',
);

test('collectionRemoval persistRemoval awaits account-scoped export cleanup for grid removals', () => {
  const idx = collectionRemovalSource.indexOf('async function persistRemoval');
  assert.notEqual(idx, -1, 'persistRemoval must exist in collectionRemoval.ts');
  const body = collectionRemovalSource.slice(idx, idx + 800);
  assert.match(body, /await dbRemoveGrid\(pending\.record\.id\)/);
  assert.match(
    body,
    /await deleteGridExports\(pending\.record\.id,\s*accountId\)/,
    'grid removal must await export cleanup with the owning account id',
  );
});

test('Collection retries pending cleanups after session resolution with the session account', () => {
  assert.match(
    collectionSource,
    /retryPendingExportCleanups\(session\?\.accountId\)/,
    'retry must run with the resolved session account, not unconditionally',
  );
});

test('Collection routes both removal paths through shared persistRemoval', () => {
  assert.match(
    collectionSource,
    /import\s+\{\s*persistRemoval\b[^}]*\}\s+from\s+['"]\.\.\/\.\.\/utils\/collectionRemoval['"]/,
    'Collection must import persistRemoval from the shared removal utility',
  );

  const finalizeStart = collectionSource.indexOf('async function finalizeRemoval');
  const queueRemovalStart = collectionSource.indexOf('function queueRemoval', finalizeStart);
  assert.notEqual(finalizeStart, -1, 'finalizeRemoval must exist');
  assert.notEqual(queueRemovalStart, -1, 'queueRemoval must follow finalizeRemoval');
  assert.match(
    collectionSource.slice(finalizeStart, queueRemovalStart),
    /await persistRemoval\(pending,\s*accountIdRef\.current\)/,
    'undo-window expiry must persist the removal through the shared utility',
  );

  const unmountStart = collectionSource.indexOf('useEffect(() => () =>');
  const unmountEnd = collectionSource.indexOf('}, []);', unmountStart);
  assert.notEqual(unmountStart, -1, 'unmount cleanup effect must exist');
  assert.notEqual(unmountEnd, -1, 'unmount cleanup effect must have an empty dependency list');
  assert.match(
    collectionSource.slice(unmountStart, unmountEnd),
    /persistRemoval\(pending,\s*accountIdRef\.current\)/,
    'unmount cleanup must persist the pending removal through the shared utility',
  );
});

test('GridBuilder invokes account-scoped export cleanup on every dbRemoveGrid path', () => {
  const removals = builderSource.match(/await dbRemoveGrid\(/g) ?? [];
  const cleanups = builderSource.match(/await deleteGridExports\([A-Za-z]+,\s*accountId\)/g) ?? [];
  assert.ok(removals.length >= 3, 'expected the three known dbRemoveGrid call sites');
  assert.equal(
    cleanups.length,
    removals.length,
    'every grid removal in GridBuilder must be paired with account-scoped export cleanup',
  );
});
