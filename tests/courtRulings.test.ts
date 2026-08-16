/**
 * Tests for the shared (server-backed) custom court rulings client and the
 * AdminAccess popup merge.
 *
 * Custom rulings now live in a shared server store behind
 * /.netlify/functions/court-rulings. `getAllRulings(custom)` is the exact
 * function `AdminAccess` calls at render time to populate its `allRulings`
 * array (the lore popup content), and `fetchCustomRulings()` is what feeds it.
 *
 * Cases covered:
 *   1. No custom rulings → popup falls back to built-ins only
 *   2. A ruling added via addCustomRuling() appears in getAllRulings()
 *   3. Multiple rulings accumulate and all appear
 *   4. Removing a ruling by index keeps the rest intact
 *   5. Server errors surface as CourtRulingsError with the server message
 *   6. Fetch failure on the popup path → built-ins still show (fetch rejects,
 *      caller falls back), and malformed payloads yield an empty custom list
 *   7. Legacy localStorage rulings migrate to the server once, then clear
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal fetch stub emulating the court-rulings function's contract
// ---------------------------------------------------------------------------
function makeServerStub(initial: string[] = []) {
  let rulings = [...initial];
  const stub = async (_url: unknown, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return jsonResponse(200, { rulings });
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { ruling?: string; index?: number };
    if (method === 'POST') {
      const ruling = (body.ruling ?? '').trim();
      if (!ruling) return jsonResponse(400, { error: 'A ruling is required.' });
      if (!rulings.includes(ruling)) rulings = [...rulings, ruling];
      return jsonResponse(200, { rulings });
    }
    if (method === 'DELETE') {
      const index = body.index;
      if (typeof index !== 'number' || index < 0 || index >= rulings.length) {
        return jsonResponse(409, { error: 'That ruling no longer exists. Refresh and try again.' });
      }
      if (typeof body.ruling === 'string' && rulings[index] !== body.ruling) {
        return jsonResponse(409, { error: 'The court record changed. Refresh and try again.' });
      }
      rulings = rulings.filter((_, i) => i !== index);
      return jsonResponse(200, { rulings });
    }
    return jsonResponse(405, { error: 'Method not allowed.' });
  };
  return { stub, current: () => rulings };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    getItem:    (key: string) => store.get(key) ?? null,
    setItem:    (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear:      () => store.clear(),
    key:        (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  } as Storage;
}

async function withStubs(
  server: { stub: typeof fetch } | { stub: (url: unknown, init?: RequestInit) => Promise<Response> },
  fn: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeLocalStorageStub(),
    writable: true,
    configurable: true,
  });
  globalThis.fetch = server.stub as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

import {
  fetchCustomRulings,
  addCustomRuling,
  removeCustomRuling,
  migrateLegacyRulings,
  getAllRulings,           // ← the function AdminAccess calls at render time
  CourtRulingsError,
} from '../src/utils/courtRulings.ts';

import { RACCOON_COURT_RECORD } from '../src/data/raccoonCourtRecord.ts';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('empty custom list — getAllRulings returns only built-ins, popup still works', async () => {
  await withStubs(makeServerStub(), async () => {
    const custom = await fetchCustomRulings();
    assert.deepEqual(custom, []);

    const all = getAllRulings(custom);    // same call as AdminAccess makes
    assert.ok(all.length > 0, 'popup list must not be empty');
    assert.deepEqual(all, RACCOON_COURT_RECORD);
  });
});

test('added ruling appears in getAllRulings — popup shows it after being saved', async () => {
  await withStubs(makeServerStub(), async () => {
    const ruling = 'Case #999: Test ruling added by the court. — Associate Justice 🦝';
    await addCustomRuling(ruling);

    const all = getAllRulings(await fetchCustomRulings());
    assert.ok(all.includes(ruling), 'custom ruling must be present in the popup list');
    assert.equal(all.length, RACCOON_COURT_RECORD.length + 1);

    // Custom rulings come after built-ins — verify ordering
    assert.deepEqual(all.slice(RACCOON_COURT_RECORD.length), [ruling]);
  });
});

test('multiple rulings accumulate — all appear in getAllRulings popup list', async () => {
  await withStubs(makeServerStub(), async () => {
    const r1 = 'Case #100: First ruling. — Chief Justice 🦝';
    const r2 = 'Case #200: Second ruling. — Bailiff 🦝';
    const r3 = 'Case #300: Third ruling. — Clerk 🦝';

    await addCustomRuling(r1);
    await addCustomRuling(r2);
    const latest = await addCustomRuling(r3);

    const all = getAllRulings(latest);
    assert.ok(all.includes(r1));
    assert.ok(all.includes(r2));
    assert.ok(all.includes(r3));
    assert.equal(all.length, RACCOON_COURT_RECORD.length + 3);
  });
});

test('removing a ruling by index — removed entry absent from getAllRulings, rest intact', async () => {
  await withStubs(makeServerStub(['Keep ruling A', 'Remove ruling B', 'Keep ruling C']), async () => {
    const latest = await removeCustomRuling(1, 'Remove ruling B');

    const all = getAllRulings(latest);
    assert.ok(!all.includes('Remove ruling B'), 'removed ruling must not appear in popup');
    assert.ok(all.includes('Keep ruling A'));
    assert.ok(all.includes('Keep ruling C'));
    assert.equal(all.length, RACCOON_COURT_RECORD.length + 2);
  });
});

test('server rejection surfaces as CourtRulingsError with the server message', async () => {
  await withStubs(makeServerStub(['Only ruling']), async () => {
    await assert.rejects(
      removeCustomRuling(0, 'Stale text that no longer matches'),
      (error: unknown) => error instanceof CourtRulingsError && error.status === 409,
    );
  });
});

test('malformed server payload yields an empty custom list — built-ins still show', async () => {
  await withStubs({ stub: async () => jsonResponse(200, { unexpected: true }) }, async () => {
    const custom = await fetchCustomRulings();
    assert.deepEqual(custom, []);
    assert.deepEqual(getAllRulings(custom), RACCOON_COURT_RECORD);
  });
});

test('legacy localStorage rulings migrate to the shared store once, then clear', async () => {
  const server = makeServerStub(['Already shared']);
  await withStubs(server, async () => {
    localStorage.setItem('raccoon-court-custom-rulings', JSON.stringify(['Local only', 'Already shared']));

    const merged = await migrateLegacyRulings(await fetchCustomRulings());
    assert.deepEqual(merged, ['Already shared', 'Local only']);
    assert.equal(localStorage.getItem('raccoon-court-custom-rulings'), null, 'legacy key must be cleared');

    // Second call is a no-op.
    assert.deepEqual(await migrateLegacyRulings(merged), merged);
    assert.deepEqual(server.current(), ['Already shared', 'Local only']);
  });
});

test('corrupt legacy localStorage — migration leaves the shared list untouched', async () => {
  await withStubs(makeServerStub(), async () => {
    localStorage.setItem('raccoon-court-custom-rulings', 'not-valid-json{{{');
    const merged = await migrateLegacyRulings([]);
    assert.deepEqual(merged, []);
    assert.deepEqual(getAllRulings(merged), RACCOON_COURT_RECORD);
  });
});
