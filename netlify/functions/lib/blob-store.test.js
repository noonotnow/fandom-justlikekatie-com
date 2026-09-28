import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStore } from "@netlify/blobs";
import { BlobsServer } from "@netlify/blobs/server";
import { getBlobStore, getWithResolvedEtag } from "./blob-store.js";

test("uses the store name with the V2 function context", () => {
  let input;
  const expected = {};
  const actual = getBlobStore("test-blob-store", {
    blobs: {
      getStore(value) {
        input = value;
        return expected;
      },
    },
  }, { consistency: "strong" });
  assert.equal(actual, expected);
  assert.equal(input, "test-blob-store");
});

test("resolves an omitted strong-read etag from the exact Netlify Blob listing", async t => {
  const directory = await mkdtemp(join(tmpdir(), "resolved-blob-etag-"));
  const server = new BlobsServer({ directory });
  const { address } = await server.start();
  t.after(async () => {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const store = getStore({
    edgeURL: address,
    uncachedEdgeURL: address,
    name: "resolved-etag-contract",
    siteID: "test-site",
    token: "test-token",
  });
  await store.setJSON("locks/today", { token: "first" });
  await store.setJSON("locks/today-shadow", { token: "other" });
  const originalRead = store.getWithMetadata.bind(store);
  const reads = [];
  store.getWithMetadata = async (key, options) => {
    reads.push({ key, options });
    const entry = await originalRead(key, options);
    if (!entry) return entry;
    const { etag: _etag, ...withoutEtag } = entry;
    return withoutEtag;
  };

  const entry = await getWithResolvedEtag(store, "locks/today", { type: "json" });

  assert.deepEqual(entry.data, { token: "first" });
  assert.ok(entry.etag);
  assert.deepEqual(reads, [
    {
      key: "locks/today",
      options: { type: "json", consistency: "strong" },
    },
    {
      key: "locks/today",
      options: { type: "json", consistency: "strong" },
    },
  ]);
  const write = await store.setJSON("locks/today", { token: "second" }, {
    onlyIfMatch: entry.etag,
  });
  assert.notEqual(write?.modified, false);
  assert.deepEqual(await store.get("locks/today", { type: "json", consistency: "strong" }), {
    token: "second",
  });
});
