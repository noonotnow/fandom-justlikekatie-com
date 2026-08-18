/**
 * Handler tests for the grid-exports function (lib/grid-exports.js).
 *
 * Covers:
 *  - Auth: unauthenticated requests are rejected with the auth error status
 *  - Upload: happy path stores the PNG under the account/grid/export key
 *            and appends an index entry
 *  - Size limit: over-limit uploads are rejected with 413 (both declared
 *            content-length and actual body size)
 *  - Content sniffing: non-PNG bodies are rejected
 *  - Keying: exports are scoped by accountId — another account cannot list
 *            or download them
 *  - List + download round-trip
 *  - Input validation: bad gridId / exportId
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createGridExportHandlers, MAX_EXPORT_BYTES, STORE_NAME } from "./grid-exports.js";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const EXPORT_ID = "11111111-2222-4333-8444-555555555555";
const GRID_ID = "vibe-atlas-2026-08-01-actor-1";

function pngBytes(size = 64) {
  const bytes = new Uint8Array(size);
  PNG_MAGIC.forEach((b, i) => { bytes[i] = b; });
  return bytes;
}

function makeStore({ failDeleteKeys = new Set() } = {}) {
  const db = new Map();
  return {
    db,
    async set(key, value) { db.set(key, value); },
    async setJSON(key, value) { db.set(key, JSON.stringify(value)); },
    async get(key, opts) {
      const raw = db.get(key);
      if (raw === undefined) return null;
      if (opts?.type === "json") return JSON.parse(raw);
      return raw; // arrayBuffer path returns what was stored
    },
    async delete(key) {
      if (failDeleteKeys.has(key)) throw new Error(`Simulated delete failure for ${key}`);
      db.delete(key);
    },
    async list({ prefix } = {}) {
      const blobs = [];
      for (const key of db.keys()) {
        if (!prefix || key.startsWith(prefix)) blobs.push({ key });
      }
      return { blobs };
    },
  };
}

function makeHandlers({ accountId = "usr_a", store = makeStore(), authFails = false, now } = {}) {
  const auth = {
    authenticate: async () => {
      if (authFails) {
        const error = new Error("Sign in is required.");
        error.status = 401;
        throw error;
      }
      return { user: { accountId } };
    },
  };
  const getStore = (name) => {
    assert.equal(name, STORE_NAME);
    return store;
  };
  const clock = now || (() => new Date("2026-08-17T12:00:00.000Z"));
  return { handlers: createGridExportHandlers({ auth, getStore, now: clock }), store };
}

function uploadReq({ gridId = GRID_ID, exportId = EXPORT_ID, body = pngBytes(), variant = "full", tier = "misprint", contentLength } = {}) {
  const params = new URLSearchParams({ gridId, exportId, variant, tier });
  return {
    method: "POST",
    url: `https://example.test/.netlify/functions/grid-exports?${params}`,
    headers: { get: (name) => (name === "content-length" ? String(contentLength ?? body.byteLength) : null) },
    arrayBuffer: async () => body.buffer ?? body,
  };
}

function getReq(query) {
  return {
    method: "GET",
    url: `https://example.test/.netlify/functions/grid-exports?${query}`,
    headers: { get: () => null },
  };
}

test("unauthenticated requests are rejected with 401", async () => {
  const { handlers } = makeHandlers({ authFails: true });
  const res = await handlers.handler(uploadReq(), {});
  assert.equal(res.status, 401);
});

test("upload stores the PNG keyed by account, grid, and export event", async () => {
  const { handlers, store } = makeHandlers({ accountId: "usr_a" });
  const res = await handlers.handler(uploadReq(), {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, exportId: EXPORT_ID });

  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`), "PNG stored under account/grid/export key");
  const index = JSON.parse(store.db.get(`exports/usr_a/${GRID_ID}/index.json`));
  assert.equal(index.length, 1);
  assert.equal(index[0].exportId, EXPORT_ID);
  assert.equal(index[0].variant, "full");
  assert.equal(index[0].tier, "misprint");
  assert.equal(index[0].exportedAt, "2026-08-17T12:00:00.000Z");
});

test("re-uploading the same exportId does not duplicate the index entry", async () => {
  const { handlers, store } = makeHandlers();
  await handlers.handler(uploadReq(), {});
  await handlers.handler(uploadReq(), {});
  const index = JSON.parse(store.db.get(`exports/usr_a/${GRID_ID}/index.json`));
  assert.equal(index.length, 1);
});

test("uploads over the size limit are rejected with 413 (declared length)", async () => {
  const { handlers } = makeHandlers();
  const res = await handlers.handler(uploadReq({ contentLength: MAX_EXPORT_BYTES + 1 }), {});
  assert.equal(res.status, 413);
});

test("uploads over the size limit are rejected with 413 (actual body)", async () => {
  const { handlers } = makeHandlers();
  const body = pngBytes(MAX_EXPORT_BYTES + 1);
  // Lie about content-length; the body check must still catch it.
  const res = await handlers.handler(uploadReq({ body, contentLength: 100 }), {});
  assert.equal(res.status, 413);
});

test("non-PNG uploads are rejected with 400", async () => {
  const { handlers } = makeHandlers();
  const res = await handlers.handler(uploadReq({ body: new TextEncoder().encode("not a png at all") }), {});
  assert.equal(res.status, 400);
});

test("invalid gridId and exportId are rejected", async () => {
  const { handlers } = makeHandlers();
  const badGrid = await handlers.handler(uploadReq({ gridId: "../escape" }), {});
  assert.equal(badGrid.status, 400);
  const badExport = await handlers.handler(uploadReq({ exportId: "not-a-uuid" }), {});
  assert.equal(badExport.status, 400);
});

test("list and download round-trip; other accounts cannot see the export", async () => {
  const store = makeStore();
  const { handlers: asA } = makeHandlers({ accountId: "usr_a", store });
  const { handlers: asB } = makeHandlers({ accountId: "usr_b", store });

  await asA.handler(uploadReq(), {});

  const listA = await asA.handler(getReq(`gridId=${GRID_ID}`), {});
  assert.equal(listA.status, 200);
  const { exports: entriesA } = await listA.json();
  assert.equal(entriesA.length, 1);

  const downloadA = await asA.handler(getReq(`gridId=${GRID_ID}&exportId=${EXPORT_ID}`), {});
  assert.equal(downloadA.status, 200);
  assert.equal(downloadA.headers.get("Content-Type"), "image/png");

  // usr_b's keyspace is separate: empty history, 404 download.
  const listB = await asB.handler(getReq(`gridId=${GRID_ID}`), {});
  assert.deepEqual(await listB.json(), { exports: [] });
  const downloadB = await asB.handler(getReq(`gridId=${GRID_ID}&exportId=${EXPORT_ID}`), {});
  assert.equal(downloadB.status, 404);
});

function deleteReq(gridId = GRID_ID) {
  return {
    method: "DELETE",
    url: `https://x.test/.netlify/functions/grid-exports?gridId=${encodeURIComponent(gridId)}`,
    headers: { get: () => null },
  };
}

test("DELETE removes the index and all PNG blobs for the account's grid via list", async () => {
  const store = makeStore();
  const { handlers } = makeHandlers({ accountId: "usr_a", store });

  const EXPORT_ID_2 = "22222222-3333-4444-8555-666666666666";
  await handlers.handler(uploadReq({ exportId: EXPORT_ID }), {});
  await handlers.handler(uploadReq({ exportId: EXPORT_ID_2 }), {});
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/index.json`), "index exists before delete");
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`), "first PNG exists before delete");
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID_2}.png`), "second PNG exists before delete");

  const res = await handlers.handler(deleteReq(), {});
  assert.equal(res.status, 200);
  // list enumerates index.json + 2 PNGs = 3 blobs
  assert.deepEqual(await res.json(), { ok: true, deleted: 3 });

  assert.ok(!store.db.has(`exports/usr_a/${GRID_ID}/index.json`), "index removed");
  assert.ok(!store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`), "first PNG removed");
  assert.ok(!store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID_2}.png`), "second PNG removed");
});

test("DELETE with no prior exports returns ok with deleted:0", async () => {
  const { handlers } = makeHandlers({ accountId: "usr_a" });
  const res = await handlers.handler(deleteReq(), {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, deleted: 0 });
});

test("DELETE removes PNGs evicted from the capped index (>MAX_HISTORY_ENTRIES exports)", async () => {
  // Seed the store directly: write an orphaned PNG that was evicted from the
  // index (simulating >50 exports).  The list-based DELETE must still find it.
  const store = makeStore();
  const { handlers } = makeHandlers({ accountId: "usr_a", store });

  // One normal upload so the index exists.
  await handlers.handler(uploadReq({ exportId: EXPORT_ID }), {});
  // Directly plant a PNG that is NOT in the index (simulates eviction).
  const orphanId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  store.db.set(`exports/usr_a/${GRID_ID}/${orphanId}.png`, new Uint8Array([0]));

  const res = await handlers.handler(deleteReq(), {});
  assert.equal(res.status, 200);
  // index.json + EXPORT_ID.png + orphanId.png = 3
  assert.deepEqual(await res.json(), { ok: true, deleted: 3 });
  assert.ok(!store.db.has(`exports/usr_a/${GRID_ID}/${orphanId}.png`), "orphaned PNG removed");
});

test("DELETE returns 500 (retryable) when list fails — no false success, blobs untouched", async () => {
  const store = makeStore();
  store.db.set(`exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`, new Uint8Array([0]));
  const faultyStore = { ...store, db: store.db, list: async () => { throw new Error("list unavailable"); } };
  const { handlers } = makeHandlers({ accountId: "usr_a", store: faultyStore });

  const res = await handlers.handler(deleteReq(), {});
  assert.equal(res.status, 500, "list failure must be retryable, never a false success");
  assert.ok((await res.json()).error, "error message present");
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`), "PNG untouched pending retry");
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/.deleted`), "tombstone persists to block racing uploads");
});

test("DELETE returns 500 (retryable) when the tombstone cannot be written; nothing is deleted", async () => {
  const store = makeStore();
  const { handlers } = makeHandlers({ accountId: "usr_a", store });
  await handlers.handler(uploadReq({ exportId: EXPORT_ID }), {});

  const faultyStore = {
    ...store,
    db: store.db,
    setJSON: async (key, value) => {
      if (key.endsWith("/.deleted")) throw new Error("tombstone write failed");
      store.db.set(key, JSON.stringify(value));
    },
  };
  const { handlers: faulty } = makeHandlers({ accountId: "usr_a", store: faultyStore });

  const res = await faulty.handler(deleteReq(), {});
  assert.equal(res.status, 500, "deletion must not proceed without the race barrier");
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`), "PNG untouched");
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/index.json`), "index untouched");
});

test("DELETE returns 500 when any blob delete fails", async () => {
  const EXPORT_ID_2 = "22222222-3333-4444-8555-666666666666";
  const pngKey = `exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`;
  const store = makeStore({ failDeleteKeys: new Set([pngKey]) });
  const { handlers } = makeHandlers({ accountId: "usr_a", store });

  await handlers.handler(uploadReq({ exportId: EXPORT_ID }), {});
  await handlers.handler(uploadReq({ exportId: EXPORT_ID_2 }), {});

  const res = await handlers.handler(deleteReq(), {});
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.ok(body.error, "error message present");
  assert.equal(body.failed, 1, "one failure reported");
  // The failing PNG should remain in the store.
  assert.ok(store.db.has(pngKey), "failed blob still present after partial failure");
});

test("DELETE is account-scoped: usr_b cannot delete usr_a's exports", async () => {
  const store = makeStore();
  const { handlers: asA } = makeHandlers({ accountId: "usr_a", store });
  const { handlers: asB } = makeHandlers({ accountId: "usr_b", store });

  await asA.handler(uploadReq(), {});
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`), "A's PNG exists");

  // B's DELETE targets its own keyspace (prefix = exports/usr_b/...) and leaves A's data untouched.
  const res = await asB.handler(deleteReq(), {});
  assert.equal(res.status, 200);
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`), "A's PNG still intact after B's delete");
});

test("DELETE leaves a tombstone that blocks subsequent uploads (410)", async () => {
  const store = makeStore();
  const { handlers } = makeHandlers({ accountId: "usr_a", store });

  await handlers.handler(uploadReq({ exportId: EXPORT_ID }), {});
  const res = await handlers.handler(deleteReq(), {});
  assert.equal(res.status, 200);
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/.deleted`), "tombstone persists after cleanup");

  // A late fire-and-forget upload for the deleted grid must be refused.
  const lateUpload = await handlers.handler(uploadReq({ exportId: "33333333-4444-4555-8666-777777777777" }), {});
  assert.equal(lateUpload.status, 410);
  assert.ok(!store.db.has(`exports/usr_a/${GRID_ID}/33333333-4444-4555-8666-777777777777.png`), "no PNG stored");
  assert.ok(!store.db.has(`exports/usr_a/${GRID_ID}/index.json`), "no index recreated");
});

test("an upload racing past the initial tombstone check rolls its PNG back (410)", async () => {
  // Simulate a DELETE landing between the upload's pre-check and its PNG
  // write: the store plants the tombstone as a side effect of the PNG set().
  const store = makeStore();
  const tombstoneKey = `exports/usr_a/${GRID_ID}/.deleted`;
  const originalSet = store.set.bind(store);
  store.set = async (key, value) => {
    await originalSet(key, value);
    if (key.endsWith(".png")) {
      store.db.set(tombstoneKey, JSON.stringify({ deletedAt: "2026-08-17T11:59:00.000Z" }));
    }
  };
  const { handlers } = makeHandlers({ accountId: "usr_a", store });

  const res = await handlers.handler(uploadReq({ exportId: EXPORT_ID }), {});
  assert.equal(res.status, 410);
  assert.ok(!store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`), "racing PNG rolled back");
  assert.ok(!store.db.has(`exports/usr_a/${GRID_ID}/index.json`), "no index entry committed");
});

test("uploads are allowed again once a completed tombstone has expired, and the tombstone is GC'd", async () => {
  const store = makeStore();
  // Completed cleanup well beyond TOMBSTONE_TTL_MS before the handler's fixed now().
  const tombstoneKey = `exports/usr_a/${GRID_ID}/.deleted`;
  store.db.set(
    tombstoneKey,
    JSON.stringify({ deletedAt: "2026-08-17T10:00:00.000Z", pending: [], scrubIds: [], completedAt: "2026-08-17T10:00:00.000Z" }),
  );
  const { handlers } = makeHandlers({ accountId: "usr_a", store });

  const res = await handlers.handler(uploadReq({ exportId: EXPORT_ID }), {});
  assert.equal(res.status, 200, "re-saved grid can export after the race window closes");
  assert.ok(store.db.has(`exports/usr_a/${GRID_ID}/${EXPORT_ID}.png`));
  assert.ok(!store.db.has(tombstoneKey), "spent tombstone garbage-collected by the upload");
});

test("delayed retry after a re-save deletes only the captured generation — new exports survive", async () => {
  // The reviewer scenario: failed cleanup -> window expiry -> same-ID
  // re-save/upload -> delayed retry.  The retry must only remove the blobs
  // the original DELETE captured, never the re-saved grid's new exports.
  const oldExportId = EXPORT_ID;
  const newExportId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const oldPng = `exports/usr_a/${GRID_ID}/${oldExportId}.png`;
  const newPng = `exports/usr_a/${GRID_ID}/${newExportId}.png`;
  const indexKey = `exports/usr_a/${GRID_ID}/index.json`;

  const failDeleteKeys = new Set([oldPng]);
  const store = makeStore({ failDeleteKeys });
  let clock = new Date("2026-08-17T12:00:00.000Z");
  const { handlers } = makeHandlers({ accountId: "usr_a", store, now: () => clock });

  // Original export, then a removal whose PNG delete fails (500, queued client-side).
  await handlers.handler(uploadReq({ exportId: oldExportId }), {});
  const failedDelete = await handlers.handler(deleteReq(), {});
  assert.equal(failedDelete.status, 500);
  const tombstone = JSON.parse(store.db.get(`exports/usr_a/${GRID_ID}/.deleted`));
  assert.deepEqual(tombstone.pending, [oldPng], "generation captured for retry");

  // Race window passes; the grid is re-saved (same deterministic ID) and re-exported.
  clock = new Date("2026-08-17T13:00:00.000Z");
  const reSaveUpload = await handlers.handler(uploadReq({ exportId: newExportId }), {});
  assert.equal(reSaveUpload.status, 200, "new-generation upload allowed after the window");
  assert.ok(store.db.has(newPng));

  // The delayed retry finally succeeds — it must only touch the old generation.
  failDeleteKeys.clear();
  const retry = await handlers.handler(deleteReq(), {});
  assert.equal(retry.status, 200);
  assert.ok(!store.db.has(oldPng), "old-generation PNG removed");
  assert.ok(store.db.has(newPng), "re-saved grid's export remains available");
  const index = JSON.parse(store.db.get(indexKey));
  assert.equal(index.length, 1, "index scrubbed of old generation only");
  assert.equal(index[0].exportId, newExportId);

  // And the new export still downloads.
  const download = await handlers.handler(getReq(`gridId=${GRID_ID}&exportId=${newExportId}`), {});
  assert.equal(download.status, 200);
});

test("non-GET/POST/DELETE methods are rejected with 405", async () => {
  const { handlers } = makeHandlers();
  const res = await handlers.handler({ method: "PATCH", url: `https://x.test/?gridId=${GRID_ID}`, headers: { get: () => null } }, {});
  assert.equal(res.status, 405);
});
