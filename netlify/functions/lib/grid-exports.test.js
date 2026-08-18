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

function makeStore() {
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
  };
}

function makeHandlers({ accountId = "usr_a", store = makeStore(), authFails = false } = {}) {
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
  const now = () => new Date("2026-08-17T12:00:00.000Z");
  return { handlers: createGridExportHandlers({ auth, getStore, now }), store };
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

test("non-GET/POST methods are rejected with 405", async () => {
  const { handlers } = makeHandlers();
  const res = await handlers.handler({ method: "DELETE", url: `https://x.test/?gridId=${GRID_ID}`, headers: { get: () => null } }, {});
  assert.equal(res.status, 405);
});
