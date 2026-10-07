import assert from "node:assert/strict";
import test from "node:test";
import { archiveImageSaveDecision } from "./archive-access.js";
import { gridManifestKey, publicationManifestCatalogKey } from "./publication-manifest.js";
import {
  PUBLIC_ARCHIVE_MAX_SCAN,
  createPublicArchiveInventoryHandler,
  isValidArchiveImageIdentity,
  publicArchiveGrid,
  readPublicManifestForDate,
} from "./public-archive-inventory.js";
import { createArchiveImageSaveHandler } from "../archive-image-save.js";
import {
  PUBLIC_ARCHIVE_DIRECTORY_KEY,
  PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS,
} from "./public-archive-directory.js";

const today = "2026-08-10";

function manifest(date, actorId = "actor-a") {
  const sourceCandidateIds = Array.from({ length: 9 }, (_, index) => `${actorId}-${date}-candidate-${index}`);
  const actorSlug = actorId;
  return {
    schemaVersion: 1,
    manifestVersion: "v1",
    manifestId: `manifest-${actorId}-${date}`,
    idempotencyKey: `vibe-atlas:daily-drop:${date}`,
    kind: "vibe-atlas-daily-drop",
    publicationDate: date,
    publishedAt: `${date}T04:00:00.000Z`,
    boardHash: "a".repeat(64),
    actor: {
      id: actorId,
      name: `演员 ${actorId}`,
      nameEn: actorId,
      accentColor: "#8d2638",
    },
    vibe: {
      key: `${actorId}:0`,
      idx: 0,
      label: "氛围",
      labelEn: "Vibe",
      subtitle: "演员的视觉记录",
      subtitleEn: "A curated visual record with an editorial point of view.",
      supportingCopyEn: "Nine immutable images from one approved edition, preserved with their original editorial context.",
    },
    heroPosition: 4,
    cardCount: 9,
    retention: { policy: "permanent", deleteWithCollection: false },
    provenance: { sourceCandidateIds },
    publicRecord: {
      actorPath: `/vibe-atlas/actors/${actorSlug}/`,
      editionPath: `/vibe-atlas/editions/${date}/${actorSlug}/`,
    },
    cards: sourceCandidateIds.map((candidateId, position) => ({
      position,
      candidateId,
      title: `Frame ${position}`,
      source: "Verified publication",
      link: `https://publisher.example/${position}`,
      sourceUrl: `https://images.example/${actorId}-${date}-${position}.jpg`,
      familyId: `event-${actorId}-${date}`,
      familyLabel: `Event ${date}`,
      familyEvidence: "persisted-event",
      media: {
        schemaVersion: 1,
        assetId: `00000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
        deliveryUrl: `https://media.example/assets/${actorId}-${date}-${position}.jpg`,
        thumbnailUrl: `https://media.example/thumbs/${actorId}-${date}-${position}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100 + position,
        checksum: String(position).padStart(64, "0"),
        dimensions: { width: 1200, height: 1200 },
        association: {
          type: "publication",
          id: `vibe-atlas:daily-drop:${date}`,
          itemId: `card-${position}`,
        },
      },
    })),
  };
}

function catalog(dates) {
  return {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates,
  };
}

function memoryStore(values = {}) {
  const records = new Map(Object.entries(values));
  const reads = [];
  let revision = 0;
  return {
    records,
    reads,
    async get(key, options) {
      reads.push({ key, options });
      return structuredClone(records.get(key) ?? null);
    },
    async getWithMetadata(key, options) {
      reads.push({ key, options });
      return records.has(key)
        ? { data: structuredClone(records.get(key)), etag: String(revision) } : null;
    },
    async setJSON(key, value, options = {}) {
      if ((options.onlyIfNew && records.has(key))
        || (options.onlyIfMatch && options.onlyIfMatch !== String(revision))) {
        return { modified: false };
      }
      revision += 1;
      records.set(key, structuredClone(value));
      return { modified: true };
    },
    async list() {
      throw new Error("Archive image authorization must not enumerate publication history.");
    },
  };
}

function inventoryHandler(store, clock = new Date(`${today}T04:00:00.000Z`)) {
  return createPublicArchiveInventoryHandler({
    getStore: () => store,
    now: () => clock,
  });
}

async function inventoryRequest(handler, query = "") {
  return handler(new Request(`https://fandom.test/.netlify/functions/public-archive-inventory${query}`), {});
}

test("directory-only classification uses the same strong read without changing exact-date outcomes", async () => {
  for (const [label, mutate, expected] of [
    ["short copy", value => { value.vibe.supportingCopyEn = "Short"; }, "valid_non_indexable"],
    ["missing public record", value => { delete value.publicRecord; }, "valid_non_indexable"],
    ["missing subtitle", value => { delete value.vibe.subtitleEn; }, "valid_non_indexable"],
    ["MEDIA association", value => { value.cards[0].media.association.id = "private"; }, "retryable"],
    ["MEDIA checksum", value => { value.cards[0].media.checksum = "broken"; }, "retryable"],
    ["null record", value => { value.publicRecord = null; }, "retryable"],
    ["malformed record", value => { value.publicRecord.editionPath = "/private"; }, "retryable"],
    ["mismatched date", value => { value.publicationDate = "2026-08-09"; }, undefined],
  ]) {
    const value = manifest(today);
    mutate(value);
    const store = memoryStore({ [gridManifestKey(today)]: value });
    const found = await readPublicManifestForDate(store, today, { classifyDirectory: true });
    assert.equal(found.directoryOmission, expected, label);
    assert.equal(store.reads.length, 1, label);
    assert.equal(store.reads[0].options.consistency, "strong");
    const exact = await readPublicManifestForDate(store, today);
    assert.deepEqual(exact, { status: label === "mismatched date" ? "invalid" : "not_public" });
    assert.equal("manifest" in found, false, "rejections expose no private evidence");
  }
});

test("warm partial directory does not authorize or block independent edition and daily save checks", async () => {
  const daily = manifest(today, "daily");
  delete daily.publicRecord;
  delete daily.vibe.supportingCopyEn;
  const publicEdition = manifest("2026-08-09", "public");
  const store = memoryStore({
    [publicationManifestCatalogKey()]: catalog([publicEdition.publicationDate, today]),
    [gridManifestKey(today)]: daily,
    [gridManifestKey(publicEdition.publicationDate)]: publicEdition,
  });
  const handler = inventoryHandler(store);
  const cold = responseJson(await inventoryRequest(handler, "?directory=actors"));
  assert.ok(cold.actorInventory.retryAt);
  const warm = responseJson(await inventoryRequest(handler, "?directory=actors"));
  assert.equal(warm.actorInventory.source, "snapshot");
  const save = saveHandler(store);
  assert.equal((await save(saveRequest({ date: today, imageId: `archive:${today}:card-0` }), {})).statusCode, 200);
  assert.equal((await inventoryRequest(handler, `?date=${today}`)).statusCode, 404,
    "a structurally valid daily board still does not grant editorial access");
  publicEdition.cards[0].media.association.id = "revoked";
  store.records.set(gridManifestKey(publicEdition.publicationDate), publicEdition);
  daily.cards[0].media.association.id = "revoked";
  store.records.set(gridManifestKey(today), daily);
  const stillWarm = responseJson(await inventoryRequest(handler, "?directory=actors"));
  assert.deepEqual(stillWarm.actors, warm.actors, "discovery alone may lag within its approved minute");
  const before = store.reads.length;
  assert.equal((await inventoryRequest(handler, `?date=${publicEdition.publicationDate}`)).statusCode, 404);
  assert.equal((await save(saveRequest({ date: today, imageId: `archive:${today}:card-0` }), {})).statusCode, 404);
  assert.equal((await save(saveRequest({ date: today, imageId: "unrelated" }), {})).statusCode, 404);
  assert.ok(store.reads.slice(before).filter(read => read.key === gridManifestKey(today)).length >= 2);
  assert.ok(store.reads.slice(before).every(read => read.options.consistency === "strong"));
});

test("retained partial invalidates on actual Shanghai rollover and rereads repaired MEDIA and links at deadline", async () => {
  let clock = new Date("2026-08-10T15:59:30Z");
  const withheld = manifest(today);
  delete withheld.publicRecord;
  const future = manifest("2026-08-11", "future");
  const store = memoryStore({
    [publicationManifestCatalogKey()]: catalog([today, future.publicationDate]),
    [gridManifestKey(today)]: withheld,
    [gridManifestKey(future.publicationDate)]: future,
  });
  const handler = createPublicArchiveInventoryHandler({ getStore: () => store, now: () => clock });
  const first = responseJson(await inventoryRequest(handler, "?directory=actors"));
  assert.ok(first.actorInventory.retryAt);
  clock = new Date("2026-08-10T16:00:00Z");
  const rollover = responseJson(await inventoryRequest(handler, "?directory=actors"));
  assert.notEqual(rollover.actorInventory.generation, first.actorInventory.generation);
  assert.deepEqual(rollover.actors, [{ id: "future", name: "future" }]);
  store.records.set(gridManifestKey(today), manifest(today, "repaired"));
  future.publicRecord.editionPath = "/private";
  store.records.set(gridManifestKey(future.publicationDate), future);
  clock = new Date("2026-08-10T16:00:59.999Z");
  assert.equal(responseJson(await inventoryRequest(handler, "?directory=actors")).actorInventory.source, "snapshot");
  clock = new Date("2026-08-10T16:01:00Z");
  const repaired = responseJson(await inventoryRequest(handler, "?directory=actors"));
  assert.deepEqual(repaired.actors, [{ id: "repaired", name: "repaired" }]);
  assert.equal(repaired.actorInventory.retryAt, undefined);
});

test("actor directory verifies manifests independently and exposes only published actor summaries", async () => {
  const good = manifest("2026-08-01", "older-actor");
  const invalidMedia = manifest("2026-08-02", "private-actor");
  invalidMedia.cards[0].media.association.id = "unpublished-pack";
  const invalidRecord = manifest("2026-08-03", "invalid-record");
  invalidRecord.publicRecord.editionPath = "/private/pack";
  const future = manifest("2026-08-11", "future-actor");
  const recent = manifest(today, "recent-actor");
  const store = memoryStore({
    [publicationManifestCatalogKey()]: catalog([good, invalidMedia, invalidRecord, recent, future].map(item => item.publicationDate)),
    ...Object.fromEntries([good, invalidMedia, invalidRecord, recent, future].map(item => [gridManifestKey(item.publicationDate), item])),
    "private-packs": { actor: "never-public" },
  });
  const handler = inventoryHandler(store);
  const first = responseJson(await inventoryRequest(handler, "?limit=1"));
  assert.deepEqual(first.actors, [{ id: "recent-actor", name: "recent-actor" }]);
  const directory = responseJson(await inventoryRequest(handler, "?directory=actors&limit=1"));
  assert.deepEqual(directory.actors, [
    { id: "older-actor", name: "older-actor" },
    { id: "recent-actor", name: "recent-actor" },
  ]);
  assert.equal("editions" in directory, false);
  assert.equal(directory.actorInventory.scope, "verified-directory");
  assert.equal(directory.actorInventory.complete, false);
  assert.equal(directory.page.unavailableCount, 2);
  assert.equal(JSON.stringify(directory).includes("media.example"), false);
  assert.equal(store.reads.some(read => read.key === gridManifestKey(future.publicationDate)), false);
  assert.equal(store.reads.some(read => read.key === "private-packs"), false);
});

test("actor directory scans are bounded, resumable, deduplicated and complete only after verification", async () => {
  const dates = Array.from({ length: PUBLIC_ARCHIVE_MAX_SCAN + 1 }, (_, index) =>
    new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10));
  const store = memoryStore({
    [publicationManifestCatalogKey()]: catalog(dates),
    ...Object.fromEntries(dates.map((date, index) => [
      gridManifestKey(date), manifest(date, index === 0 ? "oldest-actor" : "recent-actor"),
    ])),
  });
  const handler = inventoryHandler(store);
  const first = responseJson(await inventoryRequest(handler, "?directory=actors"));
  assert.equal(first.page.scanned, PUBLIC_ARCHIVE_MAX_SCAN);
  assert.equal(first.page.hasMore, true);
  assert.equal(first.actorInventory.complete, false);
  assert.deepEqual(first.actors, [{ id: "recent-actor", name: "recent-actor" }]);
  const second = responseJson(await inventoryRequest(handler, `?directory=actors&cursor=${first.page.nextCursor}`));
  assert.deepEqual(second.actors, [
    { id: "oldest-actor", name: "oldest-actor" },
    { id: "recent-actor", name: "recent-actor" },
  ]);
  assert.equal(second.page.hasMore, false);
  assert.equal(second.actorInventory.complete, true);
  const filtered = responseJson(await inventoryRequest(handler, "?actorId=oldest-actor"));
  assert.equal(filtered.page.hasMore, true);
  const older = responseJson(await inventoryRequest(handler, `?actorId=oldest-actor&cursor=${filtered.page.nextCursor}`));
  assert.deepEqual(older.editions.map(edition => edition.actorId), ["oldest-actor"]);
});

test("actor directory storage failures stay explicit and retryable, including empty directories", async () => {
  const store = memoryStore({ [publicationManifestCatalogKey()]: catalog([today]) });
  const originalGet = store.get.bind(store);
  store.get = async (key, options) => {
    if (key === gridManifestKey(today)) throw new Error("storage unavailable");
    return originalGet(key, options);
  };
  const body = responseJson(await inventoryRequest(inventoryHandler(store), "?directory=actors"));
  assert.deepEqual(body.actors, []);
  assert.equal(body.page.unavailable, true);
  assert.equal(body.actorInventory.complete, false);
  assert.equal(body.page.hasMore, true);
  const empty = memoryStore({ [publicationManifestCatalogKey()]: catalog([]) });
  const emptyBody = responseJson(await inventoryRequest(inventoryHandler(empty), "?directory=actors"));
  assert.deepEqual(emptyBody.actors, []);
  assert.equal(emptyBody.actorInventory.complete, true);
  assert.equal((await inventoryRequest(inventoryHandler(empty), "?directory=private")).statusCode, 400);
  assert.equal((await inventoryRequest(inventoryHandler(empty), "?directory=actors&actorId=a")).statusCode, 400);
});

test("directory snapshot expiry revalidates MEDIA, public links and missing-manifest repairs", async () => {
  const date = "2026-08-01";
  const store = memoryStore({
    [publicationManifestCatalogKey()]: catalog([date]),
    [gridManifestKey(date)]: manifest(date),
  });
  const clock = new Date(`${today}T04:00:00Z`);
  const first = responseJson(await inventoryRequest(inventoryHandler(store, clock), "?directory=actors"));
  assert.equal(first.actorInventory.complete, true);
  assert.equal(store.records.has(PUBLIC_ARCHIVE_DIRECTORY_KEY), true);
  const warmReadCount = store.reads.length;
  const warm = await inventoryRequest(inventoryHandler(store, clock), "?directory=actors");
  assert.equal(responseJson(warm).actorInventory.source, "snapshot");
  assert.equal(store.reads.length - warmReadCount, 2);
  assert.equal(warm.headers["Cache-Control"], "no-store");

  const invalidMedia = manifest(date);
  invalidMedia.cards[0].media.association.itemId = "card-8";
  store.records.set(gridManifestKey(date), invalidMedia);
  // Discovery may briefly cache names, but edition/image authority never does.
  assert.equal((await inventoryRequest(inventoryHandler(store, clock), `?date=${date}`)).statusCode, 404);
  const expiredClock = new Date(clock.getTime() + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS);
  const revoked = responseJson(await inventoryRequest(inventoryHandler(store, expiredClock), "?directory=actors"));
  assert.deepEqual(revoked.actors, []);
  assert.equal(revoked.actorInventory.complete, false);
  assert.equal(revoked.page.unavailableCount, 1);

  const invalidLink = manifest(date);
  invalidLink.publicRecord.editionPath = "/private/packs";
  store.records.set(gridManifestKey(date), invalidLink);
  const linkCheck = responseJson(await inventoryRequest(inventoryHandler(store, expiredClock), "?directory=actors"));
  assert.deepEqual(linkCheck.actors, []);
  store.records.delete(gridManifestKey(date));
  const missing = responseJson(await inventoryRequest(inventoryHandler(store, expiredClock), "?directory=actors"));
  assert.equal(missing.actorInventory.complete, false);
  store.records.set(gridManifestKey(date), manifest(date));
  const repaired = responseJson(await inventoryRequest(inventoryHandler(store, expiredClock), "?directory=actors"));
  assert.equal(repaired.actorInventory.complete, true);
  assert.deepEqual(repaired.actors, [{ id: "actor-a", name: "actor-a" }]);
});

test("Shanghai rollover makes a future manifest eligible without trusting catalogue actor names", async () => {
  const nextDate = "2026-08-11";
  const store = memoryStore({
    [publicationManifestCatalogKey()]: { ...catalog([today, nextDate]), actors: [{ id: "private", name: "Private Pack" }] },
    [gridManifestKey(today)]: manifest(today, "today-actor"),
    [gridManifestKey(nextDate)]: manifest(nextDate, "tomorrow-actor"),
  });
  const first = responseJson(await inventoryRequest(inventoryHandler(store, new Date("2026-08-10T15:59:00Z")), "?directory=actors"));
  assert.deepEqual(first.actors, [{ id: "today-actor", name: "today-actor" }]);
  const rollover = responseJson(await inventoryRequest(inventoryHandler(store, new Date("2026-08-10T16:00:00Z")), "?directory=actors"));
  assert.notEqual(rollover.actorInventory.generation, first.actorInventory.generation);
  assert.deepEqual(rollover.actors, [
    { id: "today-actor", name: "today-actor" },
    { id: "tomorrow-actor", name: "tomorrow-actor" },
  ]);
  assert.equal(rollover.actorInventory.source, "verification");
});

function responseJson(response) {
  return JSON.parse(response.body);
}

function saveRequest({ date, imageId, origin = "https://fandom.test" }) {
  return new Request("https://fandom.test/.netlify/functions/archive-image-save", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ date, imageId }),
  });
}

function saveHandler(store, {
  clock = new Date("2026-08-10T04:00:00.000Z"),
  authenticate = async () => { throw Object.assign(new Error("Sign in required."), { status: 401 }); },
  membership = { status: "inactive" },
  billingFailure,
  env = {},
} = {}) {
  return createArchiveImageSaveHandler({
    getStore: () => store,
    authenticate,
    billing: {
      async initialize() {
        if (billingFailure) throw billingFailure;
      },
      repository() {
        return {
          async membershipForAccount() {
            return membership;
          },
        };
      },
    },
    env,
    now: () => clock,
  });
}

test("archive inventory projects the immutable nine-card board with safe MEDIA and edition identities", () => {
  const stored = manifest("2026-08-10");
  const edition = publicArchiveGrid(stored);
  assert.equal(edition.date, stored.publicationDate);
  assert.equal(edition.displayResults.length, 9);
  assert.deepEqual(edition.publicRecord, stored.publicRecord);
  assert.equal(edition.displayResults[0].imageId, `archive:${stored.publicationDate}:card-0`);
  assert.equal(edition.displayResults[0].thumbnail, stored.cards[0].media.thumbnailUrl);
  assert.equal(edition.displayResults[0].deliveryUrl, stored.cards[0].media.deliveryUrl);
  assert.equal(edition.displayResults[0].archiveEditionPath, stored.publicRecord.editionPath);
  assert.equal(edition.displayResults[0].link, stored.cards[0].link);
  const serialized = JSON.stringify(edition);
  assert.doesNotMatch(serialized, /sourceUrl|assetId|checksum|candidateId|provenance|diagnostic/);
  assert.equal(isValidArchiveImageIdentity(stored, stored.cards[0].candidateId), true);
  assert.equal(isValidArchiveImageIdentity(stored, stored.cards[0].media.thumbnailUrl), true);
  assert.equal(isValidArchiveImageIdentity(stored, stored.cards[0].media.deliveryUrl), true);
  assert.equal(isValidArchiveImageIdentity(stored, "unrelated-image"), false);
  assert.notEqual(
    edition.displayResults[0].imageId,
    publicArchiveGrid(manifest("2026-08-09")).displayResults[0].imageId,
  );

  const invalidLink = structuredClone(stored);
  invalidLink.publicRecord.editionPath = `/vibe-atlas/editions/2026-08-09/${invalidLink.actor.id}/`;
  assert.equal(publicArchiveGrid(invalidLink), null);
  const brokenMedia = structuredClone(stored);
  brokenMedia.cards[0].media.association.itemId = "card-8";
  assert.equal(publicArchiveGrid(brokenMedia), null);
});

test("direct date inventory bypasses legacy access windows but returns published manifests only", async () => {
  const published = manifest(today);
  const store = memoryStore({
    [gridManifestKey(today)]: published,
  });
  const handler = inventoryHandler(store);
  const found = await inventoryRequest(handler, `?date=${today}`);
  assert.equal(found.statusCode, 200);
  assert.equal(responseJson(found).displayResults.length, 9);

  const missing = await inventoryRequest(handler, "?date=2026-08-09");
  assert.equal(missing.statusCode, 404);
  assert.equal(responseJson(missing).fallback, "legacy_unverified_edition");
  const future = await inventoryRequest(handler, "?date=2026-08-11");
  assert.equal(future.statusCode, 404);
  assert.equal(responseJson(future).fallback, undefined);
  const unavailableDate = "2026-08-08";
  const unavailableHandler = inventoryHandler({
    async get(key) {
      if (key === gridManifestKey(unavailableDate)) throw new Error("temporary storage failure");
      return null;
    },
  });
  const unavailable = await inventoryRequest(unavailableHandler, `?date=${unavailableDate}`);
  assert.equal(unavailable.statusCode, 503);
  assert.equal(responseJson(unavailable).fallback, undefined);
  const malformed = await inventoryRequest(handler, "?date=2026-02-30");
  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(store.reads.map(read => read.key), [
    gridManifestKey(today),
    gridManifestKey("2026-08-09"),
  ], "date lookup reads only the specifically requested manifests");
});

test("inventory scans past missing, malformed, and non-indexable catalogue entries and marks the page partial", async () => {
  const recent = manifest("2026-08-04", "actor-a");
  const older = manifest("2026-08-01", "actor-b");
  const malformed = manifest("2026-08-02", "actor-c");
  malformed.cards[0].media.thumbnailUrl = "";
  const store = memoryStore({
    [publicationManifestCatalogKey()]: catalog([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]),
    [gridManifestKey("2026-08-01")]: older,
    [gridManifestKey("2026-08-02")]: malformed,
    [gridManifestKey("2026-08-04")]: recent,
  });
  const response = await inventoryRequest(inventoryHandler(store), "?limit=2");
  const body = responseJson(response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.editions.map(item => item.date), ["2026-08-04", "2026-08-01"]);
  assert.deepEqual(body.actors, [
    { id: "actor-a", name: "actor-a" },
    { id: "actor-b", name: "actor-b" },
  ]);
  assert.deepEqual(body.actorInventory, {
    complete: false,
    scope: "verified-page",
    reason: "A complete global actor directory is not part of this bounded page read.",
  });
  assert.equal(body.page.status, "partial");
  assert.equal(body.page.partial, true);
  assert.equal(body.page.unavailableCount, 2);
  assert.equal(body.page.hasMore, false);
  assert.equal(body.page.nextCursor, null);
});

test("actor-filtered inventory cursors advance past other actors without reloading them", async () => {
  const actorA1 = manifest("2026-08-04", "actor-a");
  const actorB = manifest("2026-08-03", "actor-b");
  const actorA2 = manifest("2026-08-02", "actor-a");
  const store = memoryStore({
    [publicationManifestCatalogKey()]: catalog(["2026-08-02", "2026-08-03", "2026-08-04"]),
    [gridManifestKey("2026-08-02")]: actorA2,
    [gridManifestKey("2026-08-03")]: actorB,
    [gridManifestKey("2026-08-04")]: actorA1,
  });
  const handler = inventoryHandler(store);
  const first = responseJson(await inventoryRequest(handler, "?actorId=actor-a&limit=1"));
  assert.deepEqual(first.editions.map(item => item.date), ["2026-08-04"]);
  assert.equal(first.page.hasMore, true);
  assert.equal(first.page.nextCursor, "2026-08-04");

  const second = responseJson(await inventoryRequest(
    handler,
    `?actorId=actor-a&limit=1&cursor=${first.page.nextCursor}`,
  ));
  assert.deepEqual(second.editions.map(item => item.date), ["2026-08-02"]);
  assert.deepEqual(second.actors, [{ id: "actor-a", name: "actor-a" }]);
  assert.equal(second.page.hasMore, false);
});

test("inventory read failures expose a retryable cursor without skipping the unavailable edition", async () => {
  const unavailableDate = "2026-08-03";
  const newestDate = "2026-08-04";
  const records = new Map([
    [publicationManifestCatalogKey(), catalog([unavailableDate, newestDate])],
    [gridManifestKey(unavailableDate), manifest(unavailableDate)],
    [gridManifestKey(newestDate), manifest(newestDate)],
  ]);
  let failRead = true;
  const store = {
    async get(key) {
      if (key === gridManifestKey(unavailableDate) && failRead) {
        throw new Error("Temporary storage outage.");
      }
      return structuredClone(records.get(key) ?? null);
    },
  };
  const handler = inventoryHandler(store);
  const first = responseJson(await inventoryRequest(handler, "?limit=2"));
  assert.deepEqual(first.editions.map(item => item.date), [newestDate]);
  assert.equal(first.page.status, "partial");
  assert.equal(first.page.unavailable, true);
  assert.equal(first.page.hasMore, true);
  assert.equal(first.page.nextCursor, newestDate);

  failRead = false;
  const retry = responseJson(await inventoryRequest(
    handler,
    `?limit=2&cursor=${first.page.nextCursor}`,
  ));
  assert.deepEqual(retry.editions.map(item => item.date), [unavailableDate]);
  assert.equal(retry.page.hasMore, false);
});

test("unready and unbounded archive inventory requests fail explicitly", async () => {
  const store = memoryStore({
    [publicationManifestCatalogKey()]: { kind: "broken" },
  });
  const handler = inventoryHandler(store);
  const unavailable = await inventoryRequest(handler);
  assert.equal(unavailable.statusCode, 503);
  assert.match(responseJson(unavailable).error, /not ready/i);
  assert.equal((await inventoryRequest(handler, "?limit=51")).statusCode, 400);
  assert.equal((await inventoryRequest(handler, "?cursor=garbage")).statusCode, 400);
  assert.equal((await handler(new Request("https://fandom.test/archive", { method: "POST" }), {})).statusCode, 405);
});

test("bounded archive scans return a resumable partial page instead of silently stopping", async () => {
  const dates = [];
  const start = new Date("2026-01-01T00:00:00.000Z");
  for (let index = 0; index <= PUBLIC_ARCHIVE_MAX_SCAN; index += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    dates.push(date.toISOString().slice(0, 10));
  }
  const store = memoryStore({
    [publicationManifestCatalogKey()]: catalog(dates),
    [gridManifestKey(dates[0])]: manifest(dates[0]),
  });
  const response = await inventoryRequest(inventoryHandler(store), "?limit=1");
  const body = responseJson(response);
  assert.equal(body.editions.length, 0);
  assert.equal(body.page.scanned, PUBLIC_ARCHIVE_MAX_SCAN);
  assert.equal(body.page.scanLimitReached, true);
  assert.equal(body.page.partial, true);
  assert.equal(body.page.hasMore, true);
  assert.ok(body.page.nextCursor);
});

test("individual-save cutoff uses calendar age, including the exact three-day boundary", () => {
  assert.deepEqual(archiveImageSaveDecision({
    publicationDate: "2026-08-07",
    today: "2026-08-10",
    hasCollectorAccess: false,
  }), { allowed: true, access: "free", ageDays: 3 });
  assert.deepEqual(archiveImageSaveDecision({
    publicationDate: "2026-08-06",
    today: "2026-08-10",
    hasCollectorAccess: false,
  }), { allowed: false, reason: "collector_required", ageDays: 4 });
  assert.deepEqual(archiveImageSaveDecision({
    publicationDate: "2026-08-10",
    today: "2026-08-10",
    hasCollectorAccess: false,
  }), { allowed: true, access: "free", ageDays: 0 });
  assert.deepEqual(archiveImageSaveDecision({
    publicationDate: "2026-08-11",
    today: "2026-08-10",
    hasCollectorAccess: true,
  }), { allowed: false, reason: "future_edition" });
});

test("Shanghai rollover determines age and a missing publication day does not extend the free window", async () => {
  const editionDate = "2026-08-07";
  const store = memoryStore({ [gridManifestKey(editionDate)]: manifest(editionDate) });
  const atShanghaiMidnight = saveHandler(store, {
    clock: new Date("2026-08-09T16:00:00.000Z"),
  });
  const result = await atShanghaiMidnight(saveRequest({
    date: editionDate,
    imageId: manifest(editionDate).cards[0].media.thumbnailUrl,
  }), {});
  assert.equal(result.statusCode, 200);
  assert.equal(responseJson(result).access, "free");
  assert.deepEqual(store.reads.map(read => read.key), [gridManifestKey(editionDate)]);
});

test("free archive image saves require no sign-in and authorize only the exact published card identity", async () => {
  const date = "2026-08-10";
  const published = manifest(date);
  const store = memoryStore({ [gridManifestKey(date)]: published });
  const handler = saveHandler(store);
  const allowed = await handler(saveRequest({
    date,
    imageId: `archive:${date}:card-0`,
  }), {});
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(responseJson(allowed), {
    allowed: true,
    access: "free",
    date,
    imageId: `archive:${date}:card-0`,
    thumbnailUrl: published.cards[0].media.thumbnailUrl,
    deliveryUrl: published.cards[0].media.deliveryUrl,
    archiveEditionPath: published.publicRecord.editionPath,
  });
  assert.equal((await handler(saveRequest({
    date,
    imageId: published.cards[0].media.thumbnailUrl,
  }), {})).statusCode, 200, "the current thumbnail identity remains supported");
  assert.equal((await handler(saveRequest({ date, imageId: "not-a-card" }), {})).statusCode, 404);
  assert.deepEqual(store.reads.map(read => read.key), [
    gridManifestKey(date),
    gridManifestKey(date),
    gridManifestKey(date),
  ]);
});

test("all nine immutable daily cards can be acquired without an indexable editorial page", async () => {
  const date = "2026-10-02";
  const daily = manifest(date, "liu-yuning");
  delete daily.vibe.supportingCopyEn;
  delete daily.publicRecord;
  const store = memoryStore({ [gridManifestKey(date)]: daily });
  const handler = saveHandler(store, { clock: new Date("2026-10-01T18:00:00Z") });
  assert.equal(publicArchiveGrid(daily), null);
  assert.equal((await inventoryRequest(inventoryHandler(store, new Date("2026-10-01T18:00:00Z")), `?date=${date}`)).statusCode, 404);
  for (const card of daily.cards) {
    for (const imageId of [
      `archive:${date}:card-${card.position}`,
      card.candidateId,
      card.media.thumbnailUrl,
      card.media.deliveryUrl,
    ]) {
      const response = await handler(saveRequest({ date, imageId }), {});
      assert.equal(response.statusCode, 200);
      const body = responseJson(response);
      assert.equal(body.imageId, `archive:${date}:card-${card.position}`);
      assert.equal(body.thumbnailUrl, card.media.thumbnailUrl);
      assert.equal(body.archiveEditionPath, undefined);
    }
  }
  assert.equal((await handler(saveRequest({ date, imageId: "unrelated-card" }), {})).statusCode, 404);
  assert.equal((await handler(saveRequest({
    date, imageId: daily.cards[0].sourceUrl,
  }), {})).statusCode, 404, "transient provenance URLs are not delivered card identities");
  assert.equal((await handler(saveRequest({
    date, imageId: `/.netlify/functions/image-proxy?url=${encodeURIComponent(daily.cards[0].media.thumbnailUrl)}`,
  }), {})).statusCode, 404, "a client proxy URL cannot grant acquisition");
  assert.ok(store.reads.every(read => read.key === gridManifestKey(date)
    && read.options.consistency === "strong"));
});

test("missing, private and changed invalid daily evidence never falls back to caches or writes", async () => {
  const date = today;
  for (const alter of [
    () => null,
    daily => ({ ...daily, kind: "private-audit-board" }),
    daily => ({ ...daily, publicationDate: "2026-08-09" }),
    daily => ({ ...daily, cards: daily.cards.slice(0, 8) }),
    daily => {
      daily.cards[0].candidateId = "changed-unapproved-candidate";
      return daily;
    },
    daily => {
      daily.cards[0].media.association.id = "private-pack";
      return daily;
    },
    daily => {
      daily.cards[0].media.checksum = "invalid";
      return daily;
    },
  ]) {
    const original = manifest(date);
    const records = {
      [gridManifestKey(date)]: alter(structuredClone(original)),
      [`starOfDay:v10:${date}`]: original,
      "private-audit": original,
    };
    const store = memoryStore(records);
    const before = structuredClone([...store.records]);
    const handler = saveHandler(store);
    const response = await handler(saveRequest({
      date, imageId: original.cards[0].media.thumbnailUrl,
    }), {});
    assert.equal(response.statusCode, 404);
    assert.deepEqual([...store.records], before);
    assert.deepEqual(store.reads.map(read => read.key), [gridManifestKey(date)]);
  }
});

test("daily acquisition uses Shanghai rollover and preserves the three/four-day membership boundary", async () => {
  const date = "2026-10-02";
  const daily = manifest(date);
  delete daily.vibe.supportingCopyEn;
  const store = memoryStore({ [gridManifestKey(date)]: daily });
  const request = () => saveRequest({ date, imageId: daily.cards[4].media.thumbnailUrl });
  for (const [clock, expected] of [
    ["2026-10-01T15:59:59Z", 404],
    ["2026-10-01T16:00:00Z", 200],
    ["2026-10-04T16:00:00Z", 200],
    ["2026-10-05T15:59:59Z", 200],
    ["2026-10-05T16:00:00Z", 401],
  ]) {
    assert.equal((await saveHandler(store, { clock: new Date(clock) })(request(), {})).statusCode, expected, clock);
  }
  const member = saveHandler(store, {
    clock: new Date("2026-10-05T16:00:00Z"),
    authenticate: async () => ({ user: { accountId: "collector" } }),
    membership: { status: "active", product: "fandom_collector" },
  });
  assert.equal((await member(request(), {})).statusCode, 200);
});

test("older image saves require sign-in, verified Collector membership, and report billing delays", async () => {
  const date = "2026-08-06";
  const published = manifest(date);
  const store = memoryStore({ [gridManifestKey(date)]: published });
  const unauthenticated = saveHandler(store);
  const signIn = await unauthenticated(saveRequest({
    date,
    imageId: published.cards[0].candidateId,
  }), {});
  assert.equal(signIn.statusCode, 401);
  assert.match(responseJson(signIn).error, /sign in/i);

  const inactive = saveHandler(store, {
    authenticate: async () => ({ user: { accountId: "account-1" } }),
    membership: { status: "inactive", capabilities: ["fandom_collector"] },
  });
  const upgrade = await inactive(saveRequest({
    date,
    imageId: published.cards[0].candidateId,
  }), {});
  assert.equal(upgrade.statusCode, 403);
  assert.match(responseJson(upgrade).error, /active Collector membership/i);

  const pastDue = saveHandler(store, {
    authenticate: async () => ({ user: { accountId: "account-1" } }),
    membership: { status: "past_due", product: "fandom_collector" },
  });
  assert.equal((await pastDue(saveRequest({
    date,
    imageId: published.cards[0].candidateId,
  }), {})).statusCode, 403);

  const active = saveHandler(store, {
    authenticate: async () => ({ user: { accountId: "account-1" } }),
    membership: { status: "active", product: "fandom_collector" },
  });
  const authorized = await active(saveRequest({
    date,
    imageId: published.cards[0].candidateId,
  }), {});
  assert.equal(authorized.statusCode, 200);
  assert.equal(responseJson(authorized).access, "member");
});

test("membership outages, cross-origin requests, invalid bodies, and storage failures fail closed", async () => {
  const date = "2026-08-06";
  const published = manifest(date);
  const store = memoryStore({ [gridManifestKey(date)]: published });
  const unavailable = saveHandler(store, {
    authenticate: async () => ({ user: { accountId: "account-1" } }),
    billingFailure: new Error("secret billing detail"),
  });
  const response = await unavailable(saveRequest({
    date,
    imageId: published.cards[0].candidateId,
  }), {});
  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(responseJson(response).error, /secret billing detail/);

  const handler = saveHandler(store);
  assert.equal((await handler(saveRequest({
    date,
    imageId: published.cards[0].candidateId,
    origin: "https://attacker.test",
  }), {})).statusCode, 403);
  const badJson = await handler(new Request("https://fandom.test/archive-image-save", {
    method: "POST",
    headers: { Origin: "https://fandom.test", "Content-Type": "application/json" },
    body: "{",
  }), {});
  assert.equal(badJson.statusCode, 400);
  const badDate = await handler(saveRequest({
    date: "2026-02-30",
    imageId: published.cards[0].candidateId,
  }), {});
  assert.equal(badDate.statusCode, 400);
  const badMethod = await handler(new Request("https://fandom.test/archive-image-save"), {});
  assert.equal(badMethod.statusCode, 405);

  const brokenStore = {
    async get() {
      throw new Error("Blob read failed.");
    },
  };
  const storageError = await saveHandler(brokenStore)(saveRequest({
    date,
    imageId: published.cards[0].candidateId,
  }), {});
  assert.equal(storageError.statusCode, 503);
  assert.match(responseJson(storageError).error, /could not be verified/i);
});