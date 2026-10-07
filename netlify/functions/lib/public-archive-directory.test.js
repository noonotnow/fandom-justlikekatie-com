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
  PUBLIC_ARCHIVE_DIRECTORY_COALESCE_MS,
  PUBLIC_ARCHIVE_DIRECTORY_PARTIAL_REUSE_MS,
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
    clock: () => overrides.timestamp ?? timestamp,
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
    "actors", "fingerprint", "generation", "kind", "nonPublicCount", "retryableOmissionCount", "scanned", "startedAt", "unavailableCount",
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
  // Independent server scopes still rely on the deterministic CAS contract.
  const faster = await directory(store, candidates, { refreshScope: {} });
  const ahead = await directory(store, candidates, { cursor: faster.page.nextCursor });
  assert.equal(ahead.actorInventory.verifiedCandidates, 200);
  release();
  const old = await slow;
  assert.equal(store.value.scanned, 200);
  const completed = await directory(store, candidates, { cursor: old.page.nextCursor });
  assert.equal(completed.actorInventory.complete, true);
  assert.equal(completed.actorInventory.verifiedCandidates, 201);
});

function gate() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const nonIndexable = async () => ({ status: "not_public", directoryOmission: "valid_non_indexable" });

test("qualifying partial reuse saves 279 manifest reads across ten sequential 31-date requests", async () => {
  const store = memoryStore();
  const candidates = dates(31);
  let reads = 0;
  const readManifest = async (_store, date) => {
    reads++;
    return candidates.indexOf(date) < 2
      ? { status: "available", edition: { actorId: "public", actorName: "Public" } }
      : nonIndexable();
  };
  const first = await directory(store, candidates, { readManifest });
  const saved = store.value;
  assert.equal(first.actorInventory.retryAt, new Date(timestamp + 60_000).toISOString());
  for (let attempt = 1; attempt < 10; attempt++) {
    const warm = await directory(store, candidates, { timestamp: timestamp + attempt * 1000, readManifest });
    assert.equal(warm.page.scanned, 0);
    assert.equal(warm.page.partial, true);
    assert.equal(warm.page.hasMore, false);
    assert.equal(warm.page.nextCursor, null);
    assert.equal(warm.page.unavailableCount, 29);
    assert.equal(warm.actorInventory.source, "snapshot");
    assert.equal(warm.actorInventory.complete, false);
    assert.equal(warm.actorInventory.freshness, "partial");
    assert.equal(warm.actorInventory.generation, first.actorInventory.generation);
    assert.equal(warm.actorInventory.retryAt, first.actorInventory.retryAt);
    assert.deepEqual(warm.actors, first.actors);
    assert.deepEqual(store.value, saved, "hits never rewrite or extend evidence");
  }
  assert.equal(reads, 31);
  assert.equal(store.reads.length, 11, "plus ten catalogue reads: 52 total reads including the 31 manifests");
  assert.equal(saved.nonPublicCount, 29);
  assert.equal(saved.retryableOmissionCount, 0);
  assert.deepEqual(Object.keys(saved).sort(), [
    "actors", "fingerprint", "finishedAt", "generation", "kind", "nonPublicCount",
    "retryAt", "retryableOmissionCount", "scanned", "startedAt", "unavailableCount",
  ]);
});

test("repair and revoked names are discovered at equality, never hidden past the original minute", async () => {
  const store = memoryStore();
  const candidates = dates(2);
  let repaired = false;
  const readManifest = async (_store, date) => date === candidates[0]
    ? repaired ? { status: "not_public", directoryOmission: "retryable" }
      : { status: "available", edition: { actorId: "revoked", actorName: "Old name" } }
    : repaired ? { status: "available", edition: { actorId: "repaired", actorName: "New name" } }
      : nonIndexable();
  const first = await directory(store, candidates, { readManifest });
  repaired = true;
  const warm = await directory(store, candidates, { timestamp: timestamp + 59_999, readManifest });
  assert.deepEqual(warm.actors, first.actors);
  const retry = await directory(store, candidates, { timestamp: timestamp + 60_000, readManifest });
  assert.deepEqual(retry.actors, [{ id: "repaired", name: "New name" }]);
  assert.notEqual(retry.actorInventory.generation, first.actorInventory.generation);
  assert.equal(retry.actorInventory.retryAt, undefined, "one uncertain omission prevents reuse");
});

test("partial catalogue changes invalidate before retry, including rollover eligibility", async () => {
  const store = memoryStore();
  const first = await directory(store, dates(2), { readManifest: nonIndexable });
  for (const candidates of [dates(1), dates(2), dates(3)]) {
    const next = await directory(store, candidates, { timestamp: timestamp + 1, readManifest: nonIndexable });
    assert.equal(next.actorInventory.source, "verification");
    assert.notEqual(next.actorInventory.generation, first.actorInventory.generation);
  }
});

test("late partial finish gets only the remaining hard lifetime, and expired finish retains no window", async () => {
  for (const elapsed of [PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS - 10, PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS]) {
    const store = memoryStore();
    const first = await directory(store, dates(1), {
      readManifest: nonIndexable, clock: () => timestamp + elapsed,
    });
    assert.equal(first.actorInventory.retryAt, elapsed < PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS
      ? new Date(timestamp + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS).toISOString() : undefined);
    const retry = await directory(store, dates(1), {
      timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS, readManifest: nonIndexable,
    });
    assert.notEqual(retry.actorInventory.generation, first.actorInventory.generation);
  }
});

test("old schema, inconsistent aggregates, invalid timestamps and actor bounds fail closed", async () => {
  for (const mutate of [
    value => { value.kind = "verified-public-archive-actors"; },
    value => { value.nonPublicCount = -1; },
    value => { value.retryableOmissionCount = 0.5; },
    value => { value.unavailableCount = 0; },
    value => { value.scanned = 2; },
    value => { value.finishedAt = timestamp - 1; },
    value => { value.finishedAt = timestamp + 2; },
    value => { value.retryAt += 1; },
    value => { value.startedAt = NaN; },
    value => { value.actors = [{ id: "a", name: "A" }, { id: "b", name: "B" }]; },
  ]) {
    const store = memoryStore();
    const first = await directory(store, dates(1), { readManifest: nonIndexable });
    const malformed = store.value;
    mutate(malformed);
    await store.setJSON(PUBLIC_ARCHIVE_DIRECTORY_KEY, malformed, {});
    const retry = await directory(store, dates(1), { timestamp: timestamp + 1, readManifest: nonIndexable });
    assert.equal(retry.actorInventory.source, "verification");
    assert.notEqual(retry.actorInventory.generation, first.actorInventory.generation);
  }
});

test("mixed missing, invalid, unexplained and temporary outcomes never create a retained wait", async () => {
  for (const status of ["missing", "invalid", "invalid_date", "unknown", "not_public", "unavailable"]) {
    const store = memoryStore();
    let reads = 0;
    const readManifest = async (_store, date) => {
      reads++;
      return date === dates(2)[0] ? nonIndexable() : { status };
    };
    const first = await directory(store, dates(2), { readManifest });
    const retry = await directory(store, dates(2), { timestamp: timestamp + 1, readManifest });
    assert.equal(first.actorInventory.retryAt, undefined);
    assert.equal(retry.actorInventory.retryAt, undefined);
    assert.equal(reads, 4);
    if (status === "unavailable") {
      assert.equal(store.value, null);
      assert.equal(first.page.unavailable, true);
    }
  }
});

test("qualifying partials honor chunk bounds and restarted cursors", async () => {
  const store = memoryStore();
  const candidates = dates(201);
  const first = await directory(store, candidates, { readManifest: nonIndexable });
  assert.equal(first.actorInventory.retryAt, undefined);
  assert.equal(first.page.scanned, 100);
  const second = await directory(store, candidates, { cursor: first.page.nextCursor, readManifest: nonIndexable });
  assert.equal(second.actorInventory.retryAt, undefined);
  const last = await directory(store, candidates, { cursor: second.page.nextCursor, readManifest: nonIndexable });
  assert.equal(last.page.scanned, 1);
  assert.ok(last.actorInventory.retryAt);
  const restart = await directory(store, candidates, {
    cursor: second.page.nextCursor, timestamp: timestamp + 60_000, readManifest: nonIndexable,
  });
  assert.equal(restart.actorInventory.restart, true);
  assert.equal(restart.actorInventory.verifiedCandidates, 100);
  assert.notEqual(restart.actorInventory.generation, last.actorInventory.generation);
});

test("snapshot outages, read-only storage and lost writes cannot certify a partial cooldown", async () => {
  for (const mode of ["read", "write", "readonly", "cas"]) {
    const store = memoryStore();
    if (mode === "read") store.get = async () => { throw new Error("read outage"); };
    if (mode === "write") store.setJSON = async () => { throw new Error("write outage"); };
    if (mode === "readonly") store.setJSON = undefined;
    if (mode === "cas") store.setJSON = async () => ({ modified: false });
    let reads = 0;
    const readManifest = async () => { reads++; return nonIndexable(); };
    const first = await directory(store, dates(1), { readManifest });
    const retry = await directory(store, dates(1), { timestamp: timestamp + 1, readManifest });
    assert.equal(first.actorInventory.retryAt, undefined, mode);
    assert.equal(retry.actorInventory.retryAt, undefined, mode);
    assert.equal(reads, 2, mode);
  }
});

test("a slower qualifying partial CAS loser never advertises its own deadline", async () => {
  const store = memoryStore();
  const entered = gate();
  const release = gate();
  const originalSet = store.setJSON.bind(store);
  let hold = true;
  store.setJSON = async (...args) => {
    if (hold) { hold = false; entered.resolve(); await release.promise; }
    return originalSet(...args);
  };
  const slow = directory(store, dates(1), { readManifest: nonIndexable });
  await entered.promise;
  const winner = await directory(store, dates(1), { refreshScope: {}, timestamp: timestamp + 1 });
  release.resolve();
  const loser = await slow;
  assert.equal(loser.actorInventory.retryAt, undefined);
  assert.equal(loser.actorInventory.cacheAvailable, false);
  assert.equal(store.value.generation, winner.actorInventory.generation);
});

test("joined partial readers crossing retryAt or hard expiry revalidate the winner", async () => {
  for (const boundary of [PUBLIC_ARCHIVE_DIRECTORY_PARTIAL_REUSE_MS, PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS]) {
    const store = memoryStore();
    await directory(store, dates(1), { readManifest: nonIndexable });
    const originalGet = store.get.bind(store);
    const entered = gate();
    const release = gate();
    let hold = true;
    store.get = async (...args) => {
      const value = await originalGet(...args);
      if (hold) { hold = false; entered.resolve(); await release.promise; }
      return value;
    };
    const ownerTime = timestamp + (boundary === PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS ? 59_999 : boundary - 1);
    const owner = directory(store, dates(1), { timestamp: ownerTime });
    await entered.promise;
    // For hard expiry use a clock crossing while a within-coalescing reader joins.
    const follower = directory(store, dates(1), {
      timestamp: ownerTime + 1, clock: () => timestamp + boundary,
    });
    release.resolve();
    assert.equal((await owner).actorInventory.source, "snapshot");
    assert.equal((await follower).actorInventory.source, "verification");
    assert.equal((await directory(store, dates(1), { timestamp: timestamp + boundary })).actorInventory.complete, true);
  }
});

test("simultaneous cold, progressive and expired readers share one bounded authoritative scan", async () => {
  const store = memoryStore();
  const candidates = dates(201);
  for (const [clock, expected] of [
    [timestamp, 100], [timestamp + 1, 200],
    [timestamp + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS, 100],
  ]) {
    const entered = gate();
    const release = gate();
    let reads = 0;
    let active = 0;
    let peak = 0;
    const readManifest = async (_store, date) => {
      reads++;
      peak = Math.max(peak, ++active);
      entered.resolve();
      await release.promise;
      active--;
      return { status: "available", edition: { actorId: date, actorName: date } };
    };
    const owner = directory(store, candidates, { timestamp: clock, readManifest });
    await entered.promise;
    const followers = Array.from({ length: 20 }, () =>
      directory(store, candidates, { timestamp: clock + 1, readManifest }));
    release.resolve();
    const results = await Promise.all([owner, ...followers]);
    assert.equal(reads, 100, "21 readers cost one chunk, not 2,100 manifest/MEDIA verifications");
    assert.equal(peak, 10);
    for (const result of results) {
      assert.deepEqual(result, results[0]);
      assert.equal(result.actorInventory.verifiedCandidates, expected);
    }
    results[1].actors.pop();
    assert.equal(results[0].actors.length, expected, "responses are not shared mutable objects");
  }
});

test("request sharing works across per-request store wrappers but never crosses storage scopes", async () => {
  const backing = memoryStore();
  const scope = {};
  const entered = gate();
  const release = gate();
  let reads = 0;
  const readManifest = async () => {
    reads++;
    entered.resolve();
    await release.promise;
    return { status: "available", edition: { actorId: "public", actorName: "Public" } };
  };
  const owner = directory({ ...backing }, dates(1), { refreshScope: scope, readManifest });
  await entered.promise;
  const follower = directory({ ...backing }, dates(1), { refreshScope: scope, readManifest });
  const separate = await directory(memoryStore(), dates(1));
  assert.notEqual(separate.actors[0].id, "public");
  release.resolve();
  assert.deepEqual(await follower, await owner);
  assert.equal(reads, 1);
});

test("an owner rejection releases request sharing and leaves already verified choices retryable", async () => {
  const store = memoryStore();
  const candidates = dates(101);
  const first = await directory(store, candidates);
  const entered = gate();
  const release = gate();
  const owner = directory(store, candidates, {
    readManifest: async () => {
      entered.resolve();
      await release.promise;
      throw new Error("owner failed");
    },
  });
  await entered.promise;
  const follower = directory(store, candidates);
  const results = Promise.allSettled([owner, follower]);
  release.resolve();
  assert.ok((await results).every(result => result.status === "rejected"));
  assert.deepEqual(store.value.actors, first.actors);
  const retry = await directory(store, candidates);
  assert.equal(retry.actorInventory.complete, true);
});

test("abandoned work expires and its late write/cleanup cannot erase the replacement", async () => {
  const store = memoryStore();
  const candidates = dates(201);
  const entered = gate();
  const release = gate();
  const abandoned = directory(store, candidates, {
    readManifest: async () => {
      entered.resolve();
      await release.promise;
      return { status: "available", edition: { actorId: "late", actorName: "Late" } };
    },
  });
  await entered.promise;
  const recovered = await directory(store, candidates, {
    timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_COALESCE_MS,
  });
  const ahead = await directory(store, candidates, {
    timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_COALESCE_MS,
    cursor: recovered.page.nextCursor,
  });
  release.resolve();
  await abandoned;
  assert.equal(store.value.scanned, 200);
  assert.deepEqual(store.value.actors, ahead.actors);
  assert.equal((await directory(store, candidates, {
    timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_COALESCE_MS,
  })).actorInventory.complete, true);
});

test("sharing cannot carry a warm snapshot across its original evidence expiry", async () => {
  const store = memoryStore();
  await directory(store, dates(1));
  const originalGet = store.get.bind(store);
  const entered = gate();
  const release = gate();
  let hold = true;
  store.get = async (...args) => {
    const data = await originalGet(...args);
    if (hold) {
      hold = false;
      entered.resolve();
      await release.promise;
    }
    return data;
  };
  const owner = directory(store, dates(1), {
    timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS - 1,
  });
  await entered.promise;
  let reads = 0;
  const expired = Array.from({ length: 10 }, () => directory(store, dates(1), {
    timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS,
    readManifest: async () => {
      reads++;
      return { status: "not_public" };
    },
  }));
  release.resolve();
  assert.equal((await owner).actors.length, 1);
  assert.ok((await Promise.all(expired)).every(body => body.actors.length === 0));
  assert.equal(reads, 1, "expiry followers must also share the replacement scan");
});

test("shared partial storage failures retain verified names and never suppress a later retry", async () => {
  const store = memoryStore();
  const candidates = dates(101);
  const first = await directory(store, candidates);
  const saved = store.value;
  const entered = gate();
  const release = gate();
  const owner = directory(store, candidates, {
    readManifest: async () => {
      entered.resolve();
      await release.promise;
      return { status: "unavailable" };
    },
  });
  await entered.promise;
  const follower = directory(store, candidates);
  release.resolve();
  const failed = await follower;
  assert.deepEqual(await owner, failed);
  assert.equal(failed.page.unavailable, true);
  assert.deepEqual(failed.actors, first.actors);
  assert.deepEqual(store.value, saved);
  const originalSet = store.setJSON.bind(store);
  store.setJSON = async () => { throw new Error("write failed"); };
  const unwritten = await Promise.all(Array.from({ length: 10 }, () => directory(store, candidates)));
  assert.ok(unwritten.every(body => body.actorInventory.cacheAvailable === false));
  assert.deepEqual(store.value, saved);
  store.setJSON = originalSet;
  assert.equal((await directory(store, candidates)).actorInventory.complete, true);
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