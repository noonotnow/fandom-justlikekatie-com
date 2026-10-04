import assert from "node:assert/strict";
import test from "node:test";
import { createArchiveDiagnosticsFactory } from "./public-archive-diagnostics.js";
import {
  PUBLIC_ARCHIVE_DIRECTORY_KEY,
  PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS,
  readVerifiedActorDirectory,
} from "./public-archive-directory.js";
import { createPublicArchiveInventoryHandler } from "./public-archive-inventory.js";
import { publicationManifestCatalogKey } from "./publication-manifest.js";

const timestamp = Date.parse("2026-10-04T00:00:00Z");
const dates = ["2026-10-03", "2026-10-02", "2026-10-01"];
const available = async () => ({
  status: "available", edition: { actorId: "private-actor-marker", actorShortNameEn: "private-name-marker" },
});

function capture(options = {}) {
  const records = [];
  const factory = createArchiveDiagnosticsFactory({
    emit: line => records.push(JSON.parse(line)), ...options,
  });
  return { records, factory };
}

function store() {
  let snapshot = null;
  let version = 0;
  return {
    get snapshot() { return structuredClone(snapshot); },
    async get(key) {
      assert.equal(key, PUBLIC_ARCHIVE_DIRECTORY_KEY);
      return structuredClone(snapshot);
    },
    async getWithMetadata(key) {
      const data = await this.get(key);
      return data ? { data, etag: String(version) } : null;
    },
    async setJSON(key, value, options) {
      assert.equal(key, PUBLIC_ARCHIVE_DIRECTORY_KEY);
      if ((options.onlyIfNew && snapshot)
        || (options.onlyIfMatch && options.onlyIfMatch !== String(version))) return { modified: false };
      snapshot = structuredClone(value);
      version += 1;
      return { modified: true };
    },
  };
}

function request(query = "?directory=actors", marked = false) {
  return new Request(`https://secret-host-marker.example/.netlify/functions/public-archive-inventory${query}`, {
    headers: {
      ...(marked ? { "x-vibe-atlas-archive-test": "1" } : {}),
      "cookie": "session=private-cookie-marker", "authorization": "Bearer private-token-marker",
    },
  });
}

async function runDirectory(backing, factory, options = {}) {
  const diagnostics = factory(request("?directory=actors&actorName=private-query-marker", options.marked));
  let result;
  try {
    result = await readVerifiedActorDirectory({
      store: backing, dates, timestamp, maxScan: 100, cursor: null, ...options,
      diagnostics,
      readManifest: (...args) => {
        diagnostics.manifestRead();
        return (options.readManifest || available)(...args);
      },
    });
    return result;
  } finally {
    diagnostics.finish(result ? 200 : undefined);
  }
}

const chunks = records => records.filter(record => record.event === "archive_scan_chunk");
const requests = records => records.filter(record => record.event === "archive_inventory_request");

test("cold and warm records distinguish actual reads, snapshot outcome and CAS without exposing content", async () => {
  const backing = store();
  const { records, factory } = capture();
  const body = await runDirectory(backing, factory, { marked: true });
  const cold = chunks(records)[0];
  assert.equal(cold.manifestReadAttempts, 3);
  assert.equal(cold.startOffset, 0);
  assert.equal(cold.attemptedEndOffset, 3);
  assert.equal(cold.progressEndOffset, 3);
  assert.equal(cold.scanEndKnown, true);
  assert.equal(cold.snapshotOutcome, "missing");
  assert.equal(cold.outcome, "verified");
  assert.equal(cold.casOutcome, "modified");
  assert.equal(cold.traffic, "marked_test");
  assert.match(cold.generationHash, /^[a-f0-9]{64}$/);
  assert.notEqual(cold.generationHash, body.actorInventory.generation);
  assert.equal(requests(records)[0].manifestReadAttempts, 3);
  assert.deepEqual(requests(records)[0].works, [{ workId: cold.workId, role: "owner" }]);
  await runDirectory(backing, factory);
  const warm = chunks(records)[1];
  assert.equal(warm.source, "snapshot");
  assert.equal(warm.snapshotOutcome, "complete");
  assert.equal(warm.manifestReadAttempts, 0);
  assert.equal(warm.chunkIdentity, null);
  assert.equal(warm.casOutcome, "not_attempted");
  assert.equal(warm.generationHash, cold.generationHash);
  assert.equal(warm.processId, cold.processId);
  const serialized = JSON.stringify(records);
  for (const secret of ["private-", "secret-host-marker", dates[0], body.actorInventory.generation]) {
    assert.equal(serialized.includes(secret), false, `must not log ${secret}`);
  }
  assert.ok(records.every(record => JSON.stringify(record).length < 2500));
});

test("in-process joiners reference owner work without double-counting manifest reads, including mixed test traffic", async () => {
  const backing = store();
  const refreshScope = {};
  const { records, factory } = capture();
  let release;
  let began;
  const waiting = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { began = resolve; });
  const readManifest = async () => { began(); await waiting; return available(); };
  const owner = runDirectory({ ...backing }, factory, { refreshScope, readManifest, marked: true });
  await started;
  const joiner = runDirectory({ ...backing }, factory, { refreshScope, readManifest });
  release();
  assert.deepEqual(await owner, await joiner);
  assert.equal(chunks(records).length, 1);
  const summaries = requests(records);
  assert.equal(summaries.length, 2);
  const follower = summaries.find(record => record.works[0].role === "joiner");
  assert.equal(follower.works[0].workId, chunks(records)[0].workId);
  assert.equal(follower.manifestReadAttempts, 0);
  assert.equal(follower.traffic, "unmarked");
  assert.equal(chunks(records)[0].traffic, "marked_test");
  assert.ok(follower.coalescedWaitMs >= 0);
});

test("independent cold work shares chunk identity despite different generations and reports winning and losing CAS", async () => {
  const backing = store();
  const { records, factory } = capture();
  let attempts = 0;
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const readManifest = async () => {
    attempts += 1;
    if (attempts === 6) release();
    await waiting;
    return available();
  };
  await Promise.all([
    runDirectory(backing, factory, { refreshScope: {}, readManifest }),
    runDirectory(backing, factory, { refreshScope: {}, readManifest }),
  ]);
  const scans = chunks(records);
  assert.equal(scans.length, 2);
  assert.equal(scans[0].candidateFingerprint, scans[1].candidateFingerprint);
  assert.equal(scans[0].chunkIdentity, scans[1].chunkIdentity);
  assert.notEqual(scans[0].generationHash, scans[1].generationHash);
  assert.notEqual(scans[0].workId, scans[1].workId);
  assert.deepEqual(scans.map(scan => scan.casOutcome).sort(), ["modified", "not_modified"]);
  assert.equal(scans.reduce((sum, scan) => sum + scan.manifestReadAttempts, 0), 6);
  // Separate storage scopes here do not simulate separate production processes.
});

test("sequential partial passes, expiry and continued progress remain distinct snapshot outcomes", async () => {
  const backing = store();
  const { records, factory } = capture();
  const readManifest = async () => ({ status: "not_public" });
  await runDirectory(backing, factory, { readManifest });
  await runDirectory(backing, factory, { readManifest });
  assert.equal(chunks(records)[0].outcome, "partial");
  assert.equal(chunks(records)[1].snapshotInitialOutcome, "partial_exhausted");
  assert.equal(chunks(records)[1].unavailableCount, 3);
  assert.equal(chunks(records)[1].hasMore, false);
  assert.equal(chunks(records)[0].chunkIdentity, chunks(records)[1].chunkIdentity);
  assert.ok(chunks(records)[0].endedAt <= chunks(records)[1].startedAt);
  const progressStore = store();
  const first = await runDirectory(progressStore, factory, { maxScan: 1 });
  await runDirectory(progressStore, factory, { cursor: first.page.nextCursor, maxScan: 1 });
  assert.equal(chunks(records)[3].snapshotOutcome, "progress");
  assert.equal(chunks(records)[3].startOffset, 1);
  assert.equal(chunks(records)[3].attemptedEndOffset, 2);
  await runDirectory(progressStore, factory, { timestamp: timestamp + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS });
  assert.equal(chunks(records)[4].snapshotOutcome, "expired");
});

test("unavailable batches count all attempts, not only retained progress, and do not attempt CAS", async () => {
  const { records, factory } = capture();
  await runDirectory(store(), factory, {
    readManifest: async () => ({ status: "unavailable" }),
  });
  const chunk = chunks(records)[0];
  assert.equal(chunk.manifestReadAttempts, 3);
  assert.equal(chunk.progressEndOffset, 0);
  assert.equal(chunk.attemptedEndOffset, 3);
  assert.equal(chunk.storageUnavailable, true);
  assert.equal(chunk.casOutcome, "not_attempted");
  assert.equal(chunk.outcome, "refreshing");
});

test("throwing reads retain attempt counts and explicitly mark unknown scan end", async () => {
  const { records, factory } = capture();
  await assert.rejects(runDirectory(store(), factory, {
    readManifest: async () => { throw new Error("private-error-marker"); },
  }), /private-error-marker/);
  assert.equal(chunks(records)[0].manifestReadAttempts, 3);
  assert.equal(chunks(records)[0].scanEndKnown, false);
  assert.equal(chunks(records)[0].outcome, "error");
  assert.equal(requests(records)[0].outcome, "exception");
  assert.equal(JSON.stringify(records).includes("private-error-marker"), false);
  const synchronous = capture();
  await assert.rejects(runDirectory(store(), synchronous.factory, {
    readManifest: () => { throw new Error("synchronous read failure"); },
  }));
  assert.equal(chunks(synchronous.records)[0].manifestReadAttempts, 1);
});

test("CAS errors and unknown SDK results stay explicit without changing response or leaking errors", async () => {
  const { records, factory } = capture();
  let clock = 0;
  const timing = capture({ monotonicNow: () => clock });
  const backing = store();
  backing.setJSON = async () => { clock += 9; throw new Error("private-cas-error"); };
  const body = await runDirectory(backing, timing.factory, {
    readManifest: async () => { clock += 2; return available(); },
  });
  assert.equal(body.actorInventory.cacheAvailable, false);
  assert.equal(chunks(timing.records)[0].casOutcome, "error");
  assert.equal(chunks(timing.records)[0].casElapsedMs, 9);
  assert.equal(chunks(timing.records)[0].manifestScanElapsedMs, 6);
  assert.equal(JSON.stringify(timing.records).includes("private-cas-error"), false);
  const unknown = store();
  unknown.setJSON = async () => undefined;
  await runDirectory(unknown, factory);
  assert.equal(chunks(records)[0].casOutcome, "unknown");
});

test("handler distinguishes exact editions, pages, directory reads and invalid requests with actual storage attempts", async () => {
  const { records, factory } = capture();
  let manifestReads = 0;
  const backing = store();
  const originalGet = backing.get;
  backing.get = async key => {
    if (key === publicationManifestCatalogKey()) return {
      schemaVersion: 1, catalogVersion: "v1",
      kind: "vibe-atlas-publication-manifest-catalog", dates: [...dates].reverse(),
    };
    if (key === PUBLIC_ARCHIVE_DIRECTORY_KEY) return originalGet(key);
    manifestReads += 1;
    return null;
  };
  const handler = createPublicArchiveInventoryHandler({
    getStore: () => backing, now: () => new Date(timestamp), createDiagnostics: factory,
  });
  assert.equal((await handler(request("?date=2026-10-03", true))).statusCode, 404);
  assert.equal((await handler(request("?actorId=private-filter-marker"))).statusCode, 200);
  assert.equal((await handler(request("?directory=actors"))).statusCode, 200);
  assert.equal((await handler(request("?date=invalid-private-marker"))).statusCode, 400);
  const summaries = requests(records);
  assert.deepEqual(summaries.map(record => record.requestKind), ["edition", "page", "directory", "edition"]);
  assert.deepEqual(summaries.map(record => record.manifestReadAttempts), [1, 3, 3, 0]);
  assert.equal(manifestReads, 7);
  assert.equal(summaries[1].filtered, true);
  assert.equal(summaries[0].traffic, "marked_test");
  assert.equal(JSON.stringify(records).includes("private-"), false);
});

test("diagnostic sink and setup failures cannot change inventory behavior; log volume is capped with loss accounting", async () => {
  const broken = createArchiveDiagnosticsFactory({ emit: () => { throw new Error("logger failed"); } });
  assert.equal((await runDirectory(store(), broken)).actorInventory.complete, true);
  const handler = createPublicArchiveInventoryHandler({
    getStore: () => store(), createDiagnostics: () => { throw new Error("setup failed"); },
  });
  assert.equal((await handler(request("?date=invalid"))).statusCode, 400);
  let clock = 60_000;
  const { records, factory } = capture({ epochNow: () => clock, maxRecordsPerMinute: 1 });
  factory(request()).finish(200);
  factory(request()).finish(200);
  factory(request()).finish(200);
  assert.equal(records.length, 1);
  clock += 60_000;
  factory(request()).finish(200);
  assert.equal(records.length, 2);
  assert.equal(records[1].droppedRecordsSinceLastEmit, 2);
  const diag = factory(request());
  for (let index = 0; index < 100; index += 1) diag.work("fixed-test-work", "joiner");
  clock += 60_000;
  diag.finish(200);
  diag.finish(200);
  assert.equal(records.length, 3);
  assert.equal(records[2].works.length, 4);
  assert.equal(records[2].workReferencesTruncated, true);
});