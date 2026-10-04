import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStore } from "@netlify/blobs";
import { BlobsServer } from "@netlify/blobs/server";
import {
  PUBLIC_ARCHIVE_DIRECTORY_KEY,
  PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS,
  readVerifiedActorDirectory,
} from "./public-archive-directory.js";

const timestamp = Date.parse("2026-10-03T00:00:00Z");
const dates = count => Array.from({ length: count }, (_, index) =>
  new Date(Date.UTC(1990, 0, count - index)).toISOString().slice(0, 10));

function memoryStore() {
  let value = null;
  let version = 0;
  const reads = [];
  return {
    reads,
    get value() { return structuredClone(value); },
    async get(key, options) {
      assert.equal(key, PUBLIC_ARCHIVE_DIRECTORY_KEY);
      assert.equal(options.consistency, "strong");
      reads.push(key);
      return structuredClone(value);
    },
    async getWithMetadata(key, options) {
      const data = await this.get(key, options);
      return data ? { data, etag: String(version) } : null;
    },
    async setJSON(key, data, options) {
      assert.equal(key, PUBLIC_ARCHIVE_DIRECTORY_KEY);
      if ((options.onlyIfNew && value) || (options.onlyIfMatch && options.onlyIfMatch !== String(version))) {
        return { modified: false };
      }
      version += 1;
      value = structuredClone(data);
      return { modified: true };
    },
  };
}

function directory(store, candidateDates, overrides = {}) {
  return readVerifiedActorDirectory({
    store, dates: candidateDates, timestamp, cursor: null, maxScan: 100,
    readManifest: async (_store, date) => ({
      status: "available",
      edition: { actorId: `actor-${Number(date.slice(-2)) % 5}`, actorShortNameEn: `Star ${Number(date.slice(-2)) % 5}` },
    }),
    ...overrides,
  });
}

test("10,000 candidates cost a bounded shared pass, then two reads per warm discovery", async () => {
  const store = memoryStore();
  const candidates = dates(10_000);
  let manifestReads = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const readManifest = async (_store, date) => {
    manifestReads += 1;
    maxInFlight = Math.max(maxInFlight, ++inFlight);
    await new Promise(resolve => setImmediate(resolve));
    inFlight -= 1;
    return { status: "available", edition: { actorId: date.slice(0, 4), actorShortNameEn: date.slice(0, 4) } };
  };
  let requests = 0;
  let cursor = null;
  let body;
  do {
    body = await directory(store, candidates, { cursor, readManifest });
    requests += 1;
    assert.ok(body.page.scanned <= 100);
    assert.equal(body.actorInventory.verifiedCandidates, requests * 100);
    cursor = body.page.nextCursor;
  } while (body.page.hasMore);
  assert.equal(requests, 100);
  assert.equal(manifestReads, 10_000);
  assert.equal(maxInFlight, 10);
  assert.equal(body.actorInventory.complete, true);
  assert.equal(store.reads.length, 200, "two snapshot reads per cold request, plus the handler's one catalogue read");
  const oldReads = store.reads.length;
  const warm = await directory(store, candidates, { readManifest });
  assert.equal(store.reads.length - oldReads, 1, "warm path needs one snapshot plus one handler catalogue read");
  assert.equal(manifestReads, 10_000, "no history verification on warm discovery");
  assert.equal(warm.actorInventory.source, "snapshot");
  assert.equal(warm.actorInventory.freshness, "verified");
  assert.equal(warm.page.scanned, 0);
  assert.deepEqual(warm.actors, body.actors);
  assert.deepEqual(Object.keys(store.value).sort(), [
    "actors", "fingerprint", "generation", "kind", "scanned", "startedAt", "unavailableCount",
  ]);
  assert.ok(store.value.actors.every(actor => Object.keys(actor).sort().join() === "id,name"));
});

test("catalogue additions, removals and newly eligible dates invalidate a warm snapshot", async () => {
  const store = memoryStore();
  const candidates = dates(2);
  const first = await directory(store, candidates);
  const removed = await directory(store, candidates.slice(1));
  assert.notEqual(removed.actorInventory.generation, first.actorInventory.generation);
  assert.equal(removed.actorInventory.source, "verification");
  assert.deepEqual(removed.actors, [{ id: "actor-1", name: "Star 1" }]);
  const added = await directory(store, candidates);
  assert.notEqual(added.actorInventory.generation, removed.actorInventory.generation);
  const rollover = await directory(store, dates(3));
  assert.equal(rollover.actorInventory.totalCandidates, 3);
  assert.notEqual(rollover.actorInventory.generation, added.actorInventory.generation);
});

test("expiry rechecks the original evidence, never returns the previous actors as freshly verified", async () => {
  const store = memoryStore();
  const candidates = dates(1);
  const first = await directory(store, candidates);
  const beforeExpiry = await directory(store, candidates, {
    timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS - 1,
    readManifest: async () => { throw new Error("warm read must not verify"); },
  });
  assert.equal(beforeExpiry.actorInventory.source, "snapshot");
  const expired = await directory(store, candidates, {
    timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS,
    readManifest: async () => ({ status: "not_public" }),
  });
  assert.deepEqual(expired.actors, []);
  assert.notEqual(expired.actorInventory.generation, first.actorInventory.generation);
  assert.equal(expired.actorInventory.freshness, "partial");
  assert.equal(expired.actorInventory.complete, false);
  // A repaired manifest must not remain hidden behind an exhausted partial cache.
  const repaired = await directory(store, candidates, { timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS });
  assert.equal(repaired.actorInventory.complete, true);
  assert.equal(repaired.actors.length, 1);
});

test("a refresh mid-pagination advertises restart and a new verification generation", async () => {
  const store = memoryStore();
  const candidates = dates(201);
  const first = await directory(store, candidates);
  const next = await directory(store, candidates, {
    cursor: first.page.nextCursor,
    timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS,
  });
  assert.equal(next.actorInventory.restart, true);
  assert.notEqual(next.actorInventory.generation, first.actorInventory.generation);
  assert.equal(next.page.nextCursor, first.page.nextCursor, "browser must reset its cursor guard for the new pass");
  assert.equal(next.actorInventory.verifiedCandidates, 100);
});

test("storage failures are retryable and do not become persisted verification omissions", async () => {
  const store = memoryStore();
  const candidates = dates(101);
  const first = await directory(store, candidates);
  const stored = store.value;
  const failed = await directory(store, candidates, {
    cursor: first.page.nextCursor,
    readManifest: async () => ({ status: "unavailable" }),
  });
  assert.deepEqual(failed.actors, first.actors);
  assert.equal(failed.page.unavailable, true);
  assert.equal(failed.page.nextCursor, first.page.nextCursor);
  assert.deepEqual(store.value, stored);
  const retry = await directory(store, candidates, { cursor: failed.page.nextCursor });
  assert.equal(retry.actorInventory.complete, true);
});

test("cache read/write failures preserve verified choices without certifying an unretained prefix", async () => {
  const store = memoryStore();
  store.get = async () => { throw new Error("snapshot outage"); };
  const candidates = dates(101);
  const first = await directory(store, candidates);
  assert.equal(first.actors.length, 5);
  assert.equal(first.actorInventory.cacheAvailable, false);
  const last = await directory(store, candidates, { cursor: first.page.nextCursor });
  assert.equal(last.page.hasMore, false);
  assert.equal(last.actorInventory.complete, false);
  assert.equal(last.actorInventory.freshness, "partial");

  const writeFailure = memoryStore();
  writeFailure.setJSON = async () => { throw new Error("write outage"); };
  const verified = await directory(writeFailure, dates(1));
  assert.equal(verified.actorInventory.complete, true, "a full direct verification is still valid");
  assert.equal(verified.actorInventory.cacheAvailable, false);
  assert.equal(writeFailure.value, null);
});

test("an overlapping slower write cannot erase newer verified progress", async () => {
  const store = memoryStore();
  const originalSet = store.setJSON.bind(store);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let paused;
  const waiting = new Promise(resolve => { paused = resolve; });
  let hold = true;
  store.setJSON = async (...args) => {
    if (hold) {
      hold = false;
      paused();
      await gate;
    }
    return originalSet(...args);
  };
  const candidates = dates(201);
  const slow = directory(store, candidates);
  await waiting;
  const faster = await directory(store, candidates);
  const ahead = await directory(store, candidates, { cursor: faster.page.nextCursor });
  assert.equal(ahead.actorInventory.verifiedCandidates, 200);
  release();
  const old = await slow;
  assert.equal(store.value.scanned, 200);
  const completed = await directory(store, candidates, { cursor: old.page.nextCursor });
  assert.equal(completed.actorInventory.complete, true);
  assert.equal(completed.actorInventory.verifiedCandidates, 201);
});

test("the installed Netlify Blobs SDK retains progressive snapshots and resolves missing etags", async t => {
  const folder = await mkdtemp(join(tmpdir(), "actor-directory-"));
  const server = new BlobsServer({ directory: folder });
  const { address } = await server.start();
  t.after(async () => {
    await server.stop();
    await rm(folder, { recursive: true, force: true });
  });
  const store = getStore({
    edgeURL: address, uncachedEdgeURL: address, name: "public-archive-directory",
    siteID: "test-site", token: "test-token",
  });
  const candidates = dates(101);
  const first = await directory(store, candidates);
  const last = await directory(store, candidates, { cursor: first.page.nextCursor });
  assert.equal(last.actorInventory.complete, true);
  const warm = await directory(store, candidates);
  assert.equal(warm.actorInventory.source, "snapshot");
  assert.deepEqual(warm.actors, last.actors);
});