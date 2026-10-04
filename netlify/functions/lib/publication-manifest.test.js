import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getStore } from "@netlify/blobs";
import { BlobsServer } from "@netlify/blobs/server";
import { createPublicSitemapHandler } from "../public-sitemap.js";
import {
  acquireCorrectionPublicationLock,
  backfillPublicationReleaseDates,
  reconcilePublicationReleaseReceipts,
  boardHash,
  diagnoseArchivedPublications,
  diagnosePublicationManifestCatalog,
  gridCorrectionPrefix,
  gridManifestKey,
  gridPendingKey,
  isGridManifest,
  manifestPayload,
  materializePublicationManifest,
  publicationActorIndexKey,
  publicationActorIndexRepairKey,
  publicationActorIndexRepairRecoveryCatalogKey,
  publicationManifestCatalogKey,
  PUBLICATION_RELEASE_DATES_KEY,
  publicationReleaseReceiptKey,
  ensurePublicationReleaseDates,
  readPublicationReleaseDates,
  publicationJoinReceipt,
  pinnedPublicLookup,
  readPublicationManifests,
  isIndexablePublicationManifest,
  publicActorDirectory,
  publicActorPath,
  publicEditionPath,
  publicEditionPreview,
  publicActorSlug,
  readPublicationCorrections,
  recordPublicationCorrectionsForMisprint,
  readLatestPublicationDatesByActor,
  readLatestPublicationDatesByActorWithHealth,
  rebuildPublicationActorIndex,
  recoverPublicationActorIndexRepairHealth,
  listPublicationActorIndexRepairRecoveryReceipts,
  repairMissingPublicationCatalogDate,
  repairPublicationManifestPublicRecords,
  releaseCorrectionPublicationLock,
} from "./publication-manifest.js";

test("private Archive diagnosis distinguishes missing, malformed and non-indexable manifests", async () => {
  const good = storedPublicationManifest("2026-09-03", "actor-a");
  good.vibe.subtitleEn = "A verified editorial subtitle";
  good.vibe.supportingCopyEn = "An approved nine-frame editorial record with substantive context for readers.";
  const shallow = storedPublicationManifest("2026-09-02", "actor-a");
  const wrongDate = storedPublicationManifest("2026-08-31", "actor-a");
  const values = new Map([
    [gridManifestKey(good.publicationDate), good],
    [gridManifestKey(shallow.publicationDate), shallow],
    [gridManifestKey("2026-09-01"), { cards: Array(9).fill({}) }],
    [gridManifestKey("2026-08-30"), wrongDate],
  ]);
  const reads = [];
  const records = await diagnoseArchivedPublications({
    async get(key, options) {
      reads.push(options);
      return values.get(key) ?? null;
    },
  }, ["2026-09-04", "2026-09-03", "2026-09-02", "2026-09-01", "2026-08-30"]);
  assert.deepEqual(records.map(record => record.status), [
    "missing_manifest", "indexable", "not_indexable", "malformed_manifest", "malformed_manifest",
  ]);
  assert.ok(reads.every(options => options.consistency === "strong"));
  assert.deepEqual(Object.keys(records[1]), ["date", "status"]);
});

test("private catalogue diagnosis identifies missing and wrong-date manifest references", async () => {
  const store = memoryStore();
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: ["2026-09-01", "2026-09-02", "2026-09-03"],
  });
  await store.setJSON(gridManifestKey("2026-09-02"),
    storedPublicationManifest("2026-09-01", "actor-a"));
  await store.setJSON(gridManifestKey("2026-09-03"),
    storedPublicationManifest("2026-09-03", "actor-a"));
  const diagnosis = await diagnosePublicationManifestCatalog(store);
  assert.equal(diagnosis.catalogStatus, "valid");
  assert.equal(diagnosis.inventory.complete, false);
  assert.deepEqual(diagnosis.catalogFailures, [
    { date: "2026-09-01", status: "missing_manifest" },
    { date: "2026-09-02", status: "malformed_manifest" },
  ]);
  assert.equal(diagnosis.catalogFailuresTruncated, false);
  assert.doesNotMatch(JSON.stringify(diagnosis), /media\.example|candidate-/);
});

test("a shared-lock repair removes only a confirmed missing catalogue date", async () => {
  const store = memoryStore();
  const key = publicationManifestCatalogKey();
  const dates = ["2026-09-03", "2026-09-04"];
  await store.setJSON(key, {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates,
  });
  await store.setJSON(gridManifestKey(dates[0]),
    storedPublicationManifest(dates[0], "actor-a"));
  let revision = 0;
  const etags = new Map([[key, "revision-0"]]);
  const set = store.setJSON;
  store.getWithMetadata = async blobKey => ({
    data: await store.get(blobKey),
    etag: etags.get(blobKey),
  });
  store.setJSON = async (blobKey, value, options = {}) => {
    if (options.onlyIfMatch && options.onlyIfMatch !== etags.get(blobKey)) {
      return { modified: false };
    }
    const result = await set(blobKey, value, options);
    etags.set(blobKey, `revision-${++revision}`);
    return result;
  };
  assert.deepEqual(await repairMissingPublicationCatalogDate(store, dates[1]), {
    date: dates[1], status: "removed_missing_manifest",
  });
  assert.deepEqual(store.records.get(key).dates, [dates[0]]);
  assert.equal(store.records.has(gridManifestKey(dates[1])), false);
  assert.equal((await readPublicationManifests(store)).inventory.complete, true);
  assert.deepEqual(await repairMissingPublicationCatalogDate(store, dates[1]), {
    date: dates[1], status: "already_absent",
  });
});

test("catalogue repair keeps pending and present publications untouched", async () => {
  const store = memoryStore();
  const date = "2026-09-28";
  const key = publicationManifestCatalogKey();
  await store.setJSON(key, {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: [date],
  });
  store.getWithMetadata = async blobKey => ({
    data: await store.get(blobKey),
    etag: "revision",
  });
  await store.setJSON(gridPendingKey(date), { state: "pending" });
  assert.deepEqual(await repairMissingPublicationCatalogDate(store, date), {
    date, status: "publication_pending", reason: "unverifiable_receipt",
  });
  await store.delete(gridPendingKey(date));
  await store.setJSON(gridManifestKey(date), storedPublicationManifest(date, "actor-a"));
  assert.equal((await repairMissingPublicationCatalogDate(store, date)).status, "manifest_present");
  assert.deepEqual(store.records.get(key).dates, [date]);
});

test("catalogue repair retains stale pending MEDIA receipt for an eventual retry", async () => {
  const store = memoryStore();
  const date = "2026-09-28";
  const key = publicationManifestCatalogKey();
  const pendingKey = gridPendingKey(date);
  await store.setJSON(key, {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: [date],
  });
  const pending = {
    state: "pending",
    date,
    boardHash: "a".repeat(64),
    assets: [{ position: 0, media: { assetId: "preserve-me" } }],
    updatedAt: "2026-09-28T10:00:00.000Z",
  };
  await store.setJSON(pendingKey, pending);
  let revision = 0;
  const etags = new Map([[key, "revision-0"]]);
  const set = store.setJSON;
  store.getWithMetadata = async blobKey => ({
    data: await store.get(blobKey),
    etag: etags.get(blobKey),
  });
  store.setJSON = async (blobKey, value, options = {}) => {
    if (options.onlyIfMatch && options.onlyIfMatch !== etags.get(blobKey)) {
      return { modified: false };
    }
    const result = await set(blobKey, value, options);
    etags.set(blobKey, `revision-${++revision}`);
    return result;
  };
  const now = () => new Date("2026-09-28T11:30:00.000Z");
  const activeLock = "vibeAtlas:grid-lock:v1:2026-09-28";
  await store.setJSON(activeLock, {
    startedAt: "2026-09-28T11:00:00.000Z", state: "active",
  });
  assert.deepEqual(await repairMissingPublicationCatalogDate(store, date, { now }), {
    date, status: "publication_pending", reason: "recent_date_lock",
    retryAfter: "2026-09-28T12:00:00.000Z",
  });
  await store.delete(activeLock);
  await store.setJSON(pendingKey, {
    ...pending, updatedAt: "2026-09-28T11:00:00.000Z",
  });
  assert.deepEqual(await repairMissingPublicationCatalogDate(store, date, { now }), {
    date, status: "publication_pending", reason: "recent_receipt",
    retryAfter: "2026-09-28T12:00:00.000Z",
  });
  await store.setJSON(pendingKey, pending);
  assert.deepEqual(await repairMissingPublicationCatalogDate(store, date, { now }), {
    date, status: "removed_stale_pending_catalog_reference",
  });
  assert.deepEqual(store.records.get(pendingKey), pending);
  assert.deepEqual(store.records.get(key).dates, []);
});

test("pinned HTTPS lookup returns the validated address in both Node callback shapes", () => {
  const resolved = { address: "8.8.8.8", family: 4 };
  const lookup = pinnedPublicLookup(resolved);
  let all;
  lookup("another.example", { all: true }, (...args) => { all = args; });
  assert.deepEqual(all, [null, [resolved]]);
  let single;
  lookup("another.example", { all: false }, (...args) => { single = args; });
  assert.deepEqual(single, [null, resolved.address, resolved.family]);
});

test("public projections are explicit allowlists with stable canonical paths", () => {
  const manifest = storedPublicationManifest("2026-09-03", "liu-xueyi");
  manifest.vibe.subtitleEn = "A beautiful ache held in perfect stillness.";
  manifest.vibe.supportingCopy = "戏服会换，情绪废墟不换。";
  manifest.vibe.supportingCopyEn =
    "A carefully curated visual record of Liu Xueyi's restrained, moonlit melancholy.";
  const unchangedManifest = structuredClone(manifest);
  assert.equal(isIndexablePublicationManifest(manifest), true);
  assert.equal(publicActorSlug(manifest.actor), "liu-xueyi");
  assert.equal(publicActorPath(manifest.actor), "/vibe-atlas/actors/liu-xueyi/");
  assert.equal(publicEditionPath(manifest), "/vibe-atlas/editions/2026-09-03/liu-xueyi/");

  const projection = publicEditionPreview(manifest);
  assert.deepEqual(Object.keys(projection).sort(), [
    "actor", "canonical", "date", "heroPosition", "kind", "path",
    "previews", "publishedAt", "vibe",
  ].sort());
  assert.equal(projection.previews.length, 9);
  assert.equal(projection.previews[0].thumbnailUrl, manifest.cards[0].media.thumbnailUrl);
  assert.equal(projection.previews[0].deliveryUrl, manifest.cards[0].media.deliveryUrl);
  assert.equal(projection.vibe.copyZh, "戏服会换，情绪废墟不换。");
  assert.equal(projection.vibe.copyEn, manifest.vibe.supportingCopyEn);
  assert.deepEqual(manifest, unchangedManifest, "public projection must not mutate the immutable publication manifest");
  const serialized = JSON.stringify(projection);
  for (const forbidden of [
    "query", "prompt", "diagnostic", "confidence", "score", "audit",
    "account", "entitlement", "checksum", "provenance", "candidateId",
    "sourceUrl", "assetId",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }

  const directory = publicActorDirectory([manifest]);
  assert.equal(directory.length, 1);
  assert.equal(directory[0].path, "/vibe-atlas/actors/liu-xueyi/");
  assert.equal(directory[0].editions[0].path, projection.path);
  assert.deepEqual(manifestPayload(manifest).publicRecord, {
    actorPath: "/vibe-atlas/actors/liu-xueyi/",
    editionPath: "/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  });
});

test("public indexability fails closed for incomplete editorial or MEDIA records", () => {
  const manifest = storedPublicationManifest("2026-09-03", "liu-xueyi");
  assert.equal(isIndexablePublicationManifest(manifest), false);
  assert.equal(manifestPayload(manifest).publicRecord, undefined);
  manifest.vibe.subtitleEn = "A beautiful ache held in perfect stillness.";
  manifest.vibe.supportingCopyEn = "A substantial original editorial context for this approved edition.";
  assert.equal(isIndexablePublicationManifest(manifest), true);
  manifest.cards[4].media.thumbnailUrl = "";
  assert.equal(isIndexablePublicationManifest(manifest), false);
  const malformed = { ...manifest, cards: manifest.cards.slice(0, 8) };
  assert.equal(publicEditionPreview(malformed), null);
  assert.deepEqual(publicActorDirectory([malformed]), []);
  assert.equal(manifestPayload(manifest), null);
});

test("only the reviewed September 3 manifest accepts its original short bilingual pack line", () => {
  const approved = storedPublicationManifest("2026-09-03", "actor-a");
  approved.vibe.label = "已批准的名称";
  approved.vibe.labelEn = "Approved name";
  approved.vibe.subtitleEn = "Approved line";
  assert.equal(isIndexablePublicationManifest(approved), true);
  assert.equal(publicEditionPreview(approved).vibe.copy, "Approved line");
  assert.equal(publicEditionPreview(approved).vibe.subtitleEn, "Approved line");
  assert.equal(publicEditionPreview(approved).vibe.copyZh, undefined);
  assert.equal(publicEditionPreview(approved).vibe.copyEn, undefined);

  const other = storedPublicationManifest("2026-09-02", "actor-a");
  other.vibe = { ...approved.vibe };
  assert.equal(isIndexablePublicationManifest(other), false);
  assert.equal(publicEditionPreview(other), null);
  const noLine = { ...approved, vibe: { ...approved.vibe, subtitleEn: "" } };
  assert.equal(isIndexablePublicationManifest(noLine), false);
  const noChineseName = { ...approved, vibe: { ...approved.vibe, label: "" } };
  assert.equal(isIndexablePublicationManifest(noChineseName), false);
  const missingMedia = { ...approved, cards: approved.cards.slice(0, 8) };
  assert.equal(isIndexablePublicationManifest(missingMedia), false);
});

test("archive publication diagnosis separates missing, malformed, thin, and verified records", async () => {
  const store = memoryStore();
  const malformed = storedPublicationManifest("2026-09-02", "actor-a");
  malformed.cards[0].media.thumbnailUrl = "";
  const thin = storedPublicationManifest("2026-09-03", "actor-a");
  const approved = storedPublicationManifest("2026-09-04", "actor-a");
  approved.vibe.subtitleEn = "An approved editorial subtitle";
  approved.vibe.supportingCopyEn = "A substantial original editorial account of this approved nine-card edition.";
  for (const manifest of [malformed, thin, approved]) {
    await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  }
  assert.deepEqual(await diagnoseArchivedPublications(store, [
    "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
  ]), [
    { date: "2026-09-01", status: "missing_manifest" },
    { date: "2026-09-02", status: "malformed_manifest" },
    { date: "2026-09-03", status: "not_indexable" },
    { date: "2026-09-04", status: "indexable" },
  ]);
});

test("publication inventory requires every catalog date to resolve to its exact valid manifest", async () => {
  const missingStore = memoryStore();
  await missingStore.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: ["2026-09-03"],
  });
  const missing = await readPublicationManifests(missingStore);
  assert.equal(missing.inventory.complete, false);

  const malformedStore = memoryStore();
  await malformedStore.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: ["2026-09-03"],
  });
  await malformedStore.setJSON(gridManifestKey("2026-09-03"), {
    publicationDate: "2026-09-03",
    actor: { id: "not-a-valid-manifest" },
  });
  const malformed = await readPublicationManifests(malformedStore);
  assert.equal(malformed.inventory.complete, false);

  const exactStore = memoryStore();
  const valid = storedPublicationManifest("2026-09-03", "actor-a");
  await exactStore.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: [valid.publicationDate],
  });
  await exactStore.setJSON(gridManifestKey(valid.publicationDate), valid);
  const exact = await readPublicationManifests(exactStore);
  assert.equal(exact.inventory.complete, true);
});

test("released-date history survives a valid empty catalog and refuses invalid or unsafe updates", async () => {
  const store = memoryStore();
  const date = "2026-09-03";
  await ensurePublicationReleaseDates(store, [date], { publicationDate: date });
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [],
  });
  assert.deepEqual(await readPublicationReleaseDates(store), {
    schemaVersion: 1, kind: "vibe-atlas-released-dates",
    verifiedBaseline: false, dates: [date],
  });
  await ensurePublicationReleaseDates(store, [date]);
  assert.deepEqual((await readPublicationReleaseDates(store)).dates, [date]);
  assert.deepEqual(await store.get(publicationReleaseReceiptKey(date)), {
    schemaVersion: 1, kind: "vibe-atlas-release-receipt", date,
  });
  await assert.rejects(ensurePublicationReleaseDates(store, ["invalid"]), /invalid date/);
  await store.setJSON(PUBLICATION_RELEASE_DATES_KEY, { dates: [] });
  await assert.rejects(readPublicationReleaseDates(store), /invalid/);
});

test("historical release baseline uses immutable manifests and Archive, not just the current catalog", async t => {
  const store = await blobsTestStore(t, "release-baseline");
  const older = "2026-09-01";
  const newer = "2026-09-03";
  for (const date of [older, newer]) {
    await store.setJSON(gridManifestKey(date), storedPublicationManifest(date, "actor-a"));
  }
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [older, newer],
  });
  const archive = [older, newer].map(date => ({
    date, actorName: "actor-a", vibeLabel: "氛围",
  }));
  await ensurePublicationReleaseDates(store, [newer], { publicationDate: newer });
  const history = await backfillPublicationReleaseDates(store, archive);
  assert.deepEqual(history.dates, [older, newer]);
  assert.equal(history.verifiedBaseline, true);
  assert.deepEqual(await backfillPublicationReleaseDates(store, archive), history);
  await store.delete(publicationReleaseReceiptKey(newer));
  const handler = createPublicSitemapHandler({
    getStore: () => store,
    buildReleaseCatalog: async () => ({ complete: true, packs: [] }),
  });
  const sitemap = () => handler(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  assert.equal((await sitemap()).headers["X-Public-Sitemap-Inventory"], "release-history-unavailable");
  assert.deepEqual(await reconcilePublicationReleaseReceipts(store, archive),
    { checked: 2, written: 2 });
  assert.deepEqual(await reconcilePublicationReleaseReceipts(store, archive),
    { checked: 2, written: 0 });
  assert.equal((await sitemap()).headers["X-Public-Sitemap-Inventory"], "complete");
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [newer],
  });
  assert.equal((await sitemap()).headers["X-Public-Sitemap-Inventory"], "publication-history-mismatch");
});

test("legacy Archive links do not invent releases or prevent receipt reconciliation", async t => {
  const store = await blobsTestStore(t, "release-baseline-legacy-links");
  const legacyDate = "2026-07-31";
  const releasedDate = "2026-09-03";
  await store.setJSON(gridManifestKey(releasedDate),
    storedPublicationManifest(releasedDate, "actor-a"));
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [releasedDate],
  });
  const archive = [legacyDate, releasedDate].map(date => ({
    date, actorName: "actor-a", vibeLabel: "氛围",
    publicRecord: {
      actorPath: "/vibe-atlas/actors/actor-a/",
      editionPath: `/vibe-atlas/editions/${date}/actor-a/`,
    },
  }));
  const history = await backfillPublicationReleaseDates(store, archive);
  assert.equal(history.verifiedBaseline, true);
  assert.deepEqual(history.dates, [releasedDate]);
  assert.deepEqual(await reconcilePublicationReleaseReceipts(store, archive),
    { checked: 2, written: 1 });
  await store.setJSON(publicationReleaseReceiptKey(legacyDate), {
    schemaVersion: 1, kind: "vibe-atlas-release-receipt", date: legacyDate,
  });
  await assert.rejects(backfillPublicationReleaseDates(store, archive),
    /publication evidence is missing for 2026-07-31/);
  await assert.rejects(reconcilePublicationReleaseReceipts(store, archive),
    /baseline omits 2026-07-31/);
});

test("receipt reconciliation requires a verified baseline and validates the whole bounded page", async t => {
  const store = await blobsTestStore(t, "receipt-reconciliation-refusal");
  const dates = ["2026-09-01", "2026-09-02"];
  const archive = dates.map(date => ({ date, actorName: "actor-a", vibeLabel: "氛围" }));
  for (const date of dates) {
    await store.setJSON(gridManifestKey(date), storedPublicationManifest(date, "actor-a"));
  }
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates,
  });
  await assert.rejects(reconcilePublicationReleaseReceipts(store, archive), /baseline is not verified/);
  await backfillPublicationReleaseDates(store, archive);
  await assert.rejects(reconcilePublicationReleaseReceipts(store, Array(101).fill(archive[0])),
    /batch is invalid/);
  await assert.rejects(reconcilePublicationReleaseReceipts(store, [
    archive[0], { ...archive[1], actorName: "wrong" },
  ]), /evidence disagrees/);
  assert.equal(await store.get(publicationReleaseReceiptKey(dates[0])), null);
  await store.setJSON(publicationReleaseReceiptKey(dates[1]), { date: dates[0] });
  await assert.rejects(reconcilePublicationReleaseReceipts(store, archive), /receipt disagrees/);
  assert.equal(await store.get(publicationReleaseReceiptKey(dates[0])), null);
  await store.delete(publicationReleaseReceiptKey(dates[1]));
  assert.deepEqual(await reconcilePublicationReleaseReceipts(store, [archive[0]]),
    { checked: 1, written: 1 });
  assert.equal(await store.get(publicationReleaseReceiptKey(dates[1])), null);
});

test("ordinary release-history reads and updates cannot recreate a missing older receipt", async t => {
  const store = await blobsTestStore(t, "receipt-reconciliation-ledger");
  const older = "2026-09-01";
  const newer = "2026-09-02";
  await ensurePublicationReleaseDates(store, [older]);
  await store.delete(publicationReleaseReceiptKey(older));
  await ensurePublicationReleaseDates(store, [older]);
  assert.equal(await store.get(publicationReleaseReceiptKey(older)), null);
  await ensurePublicationReleaseDates(store, [newer], { publicationDate: newer });
  assert.equal(await store.get(publicationReleaseReceiptKey(older)), null);
  assert.equal((await store.get(publicationReleaseReceiptKey(newer), { type: "json" })).date, newer);
});

test("baseline refuses a shortened catalog or unverified Archive evidence", async t => {
  const store = await blobsTestStore(t, "release-baseline-refusal");
  const older = "2026-09-01";
  const newer = "2026-09-03";
  for (const date of [older, newer]) {
    await store.setJSON(gridManifestKey(date), storedPublicationManifest(date, "actor-a"));
  }
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [newer],
  });
  const archive = [older, newer].map(date => ({
    date, actorName: "actor-a", vibeLabel: "氛围",
  }));
  await assert.rejects(backfillPublicationReleaseDates(store, archive),
    /catalog is missing verified releases/);
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [older, newer],
  });
  await assert.rejects(backfillPublicationReleaseDates(store, [archive[1]]),
    /Archive publication evidence disagrees/);
  await assert.rejects(backfillPublicationReleaseDates(store, [
    { ...archive[0], actorName: "another actor" }, archive[1],
  ]), /Archive publication identity disagrees/);
  assert.equal(await readPublicationReleaseDates(store), null);
});

test("a shortened ledger and catalog cannot hide a previously receipted edition", async () => {
  const store = memoryStore();
  const first = "2026-09-02";
  const second = "2026-09-03";
  for (const date of [first, second]) {
    await store.setJSON(gridManifestKey(date), storedPublicationManifest(date, "actor-a"));
  }
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [first, second],
  });
  await ensurePublicationReleaseDates(store, [first, second], { publicationDate: first });
  await ensurePublicationReleaseDates(store, [first, second], { publicationDate: second });
  await store.setJSON(PUBLICATION_RELEASE_DATES_KEY, {
    ...(await readPublicationReleaseDates(store)), verifiedBaseline: true,
  });
  const handler = createPublicSitemapHandler({
    getStore: () => store,
    buildReleaseCatalog: async () => ({ complete: true, packs: [] }),
  });
  const sitemap = () => handler(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  assert.equal((await sitemap()).headers["X-Public-Sitemap-Inventory"], "complete");

  // Simulate a valid-looking replacement of both mutable indexes. Listing
  // the independent receipt still exposes the erased date even when the
  // manifest listing temporarily lags behind.
  await store.setJSON(PUBLICATION_RELEASE_DATES_KEY, {
    ...(await readPublicationReleaseDates(store)), dates: [second],
  });
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [second],
  });
  const laggedStore = {
    ...store,
    list: async ({ prefix, ...options }) => prefix === "vibeAtlas:grid-manifest:v1:"
      ? { blobs: [{ key: gridManifestKey(second) }] }
      : store.list({ prefix, ...options }),
  };
  const laggedSitemap = createPublicSitemapHandler({
    getStore: () => laggedStore,
    buildReleaseCatalog: async () => ({ complete: true, packs: [] }),
  });
  const result = await laggedSitemap(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  assert.equal(result.headers["X-Public-Sitemap-Inventory"], "release-history-unavailable");
  assert.doesNotMatch(result.body, /vibe-atlas\/editions\/2026-09-03/);

  await store.setJSON(PUBLICATION_RELEASE_DATES_KEY, {
    ...(await readPublicationReleaseDates(store)), dates: [],
  });
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [],
  });
  const emptyResult = await laggedSitemap(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  assert.equal(emptyResult.headers["X-Public-Sitemap-Inventory"], "release-history-unavailable");
});

test("the sitemap refuses missing or invalid per-release evidence", async () => {
  const store = memoryStore();
  const date = "2026-09-03";
  await store.setJSON(gridManifestKey(date), storedPublicationManifest(date, "actor-a"));
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [date],
  });
  await ensurePublicationReleaseDates(store, [date], { publicationDate: date });
  await store.setJSON(PUBLICATION_RELEASE_DATES_KEY, {
    ...(await readPublicationReleaseDates(store)), verifiedBaseline: true,
  });
  const handler = createPublicSitemapHandler({
    getStore: () => store,
    buildReleaseCatalog: async () => ({ complete: true, packs: [] }),
  });
  const sitemap = () => handler(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  await store.delete(publicationReleaseReceiptKey(date));
  assert.equal((await sitemap()).headers["X-Public-Sitemap-Inventory"], "release-history-unavailable");
  await store.setJSON(publicationReleaseReceiptKey(date), { date: "2026-09-04" });
  assert.equal((await sitemap()).headers["X-Public-Sitemap-Inventory"], "release-history-unavailable");
});

test("the real Blobs listing verifies receipts across a live sitemap read", async t => {
  const store = await blobsTestStore(t, "release-receipt-sitemap-contract");
  const date = "2026-09-03";
  await store.setJSON(gridManifestKey(date), storedPublicationManifest(date, "actor-a"));
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [date],
  });
  await ensurePublicationReleaseDates(store, [date], { publicationDate: date });
  await store.setJSON(PUBLICATION_RELEASE_DATES_KEY, {
    ...(await readPublicationReleaseDates(store)), verifiedBaseline: true,
  });
  const handler = createPublicSitemapHandler({
    getStore: () => store,
    buildReleaseCatalog: async () => ({ complete: true, packs: [] }),
  });
  const sitemap = () => handler(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  assert.equal((await sitemap()).headers["X-Public-Sitemap-Inventory"], "complete");
  await store.setJSON(PUBLICATION_RELEASE_DATES_KEY, {
    ...(await readPublicationReleaseDates(store)), dates: [],
  });
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [],
  });
  assert.notEqual((await sitemap()).headers["X-Public-Sitemap-Inventory"], "complete");
});

test("publication join receipt preserves matched, missing, ambiguous, and unavailable audit occurrences", () => {
  const input = publicationInput();
  const cards = input.board.candidates.map((candidate, position) => ({
    position,
    candidateId: candidate.candidateId,
    sourceUrl: candidate.thumbnail,
    media: { checksum: `digest-${position}` },
  }));
  const manifest = {
    publicationDate: "2026-09-03",
    manifestId: "manifest-1",
    boardHash: "a".repeat(64),
    actor: input.actor,
    vibe: input.vibe,
    cards,
  };
  const receipt = publicationJoinReceipt({
    runId: "run-1",
    completedAt: "2026-09-01T00:00:00.000Z",
    rawResults: [
      { provisionalCandidateId: "occurrence-0", candidateId: "candidate-0", thumbnail: input.board.candidates[0].thumbnail },
      { candidateId: "candidate-missing", thumbnail: "https://images.example/missing.png" },
      {},
      { candidateId: "candidate-1" },
    ],
  }, {
    actor: input.actor,
    vibeKey: input.vibe.key,
  }, [manifest, { ...manifest, manifestId: "manifest-2", publicationDate: "2026-09-04" }]);

  assert.deepEqual(receipt.counts, {
    matched: 0,
    missing: 1,
    ambiguous: 2,
    identity_unavailable: 1,
  });
  assert.equal(receipt.occurrences[0].auditOccurrenceId, "occurrence-0");
  assert.deepEqual(receipt.occurrences.map(item => item.status), [
    "ambiguous", "missing", "identity_unavailable", "ambiguous",
  ]);
  assert.deepEqual(receipt.occurrences[0].matches.map(match => match.publicationDate), [
    "2026-09-03", "2026-09-04",
  ]);
});

test("publication join uses the Shanghai audit date at the UTC day boundary", () => {
  const input = publicationInput();
  const card = {
    position: 0,
    candidateId: "candidate-0",
    sourceUrl: input.board.candidates[0].thumbnail,
    media: { checksum: "digest-0" },
  };
  const manifestFor = publicationDate => ({
    publicationDate,
    manifestId: `manifest-${publicationDate}`,
    boardHash: "a".repeat(64),
    actor: input.actor,
    vibe: input.vibe,
    cards: [card],
  });
  const pair = { actor: input.actor, vibeKey: input.vibe.key };
  const run = {
    runId: "run-boundary",
    rawResults: [{
      candidateId: card.candidateId,
      thumbnail: card.sourceUrl,
    }],
  };
  const manifests = [
    manifestFor("2026-09-03"),
    manifestFor("2026-09-04"),
    manifestFor("2026-09-05"),
  ];

  const beforeRollover = publicationJoinReceipt({
    ...run,
    completedAt: "2026-09-03T15:59:59.999Z",
  }, pair, manifests);
  assert.equal(beforeRollover.source.auditDate, "2026-09-03");
  assert.deepEqual(beforeRollover.occurrences[0].matches.map(match => match.publicationDate), [
    "2026-09-03", "2026-09-04", "2026-09-05",
  ]);

  const afterRollover = publicationJoinReceipt({
    ...run,
    completedAt: "2026-09-03T16:00:00.000Z",
  }, pair, manifests);
  assert.equal(afterRollover.source.auditDate, "2026-09-04");
  assert.deepEqual(afterRollover.occurrences[0].matches.map(match => match.publicationDate), [
    "2026-09-04", "2026-09-05",
  ]);

  const invalidTimestamp = publicationJoinReceipt({
    ...run,
    completedAt: "not-a-timestamp",
  }, pair, manifests);
  assert.equal(invalidTimestamp.source.auditDate, null);
  assert.equal(invalidTimestamp.occurrences[0].status, "missing");
  assert.deepEqual(invalidTimestamp.occurrences[0].matches, []);
});

const ENV = {
  MEDIA_ASSETS_TOKEN: "media-token",
  MEDIA_ASSETS_URL: "https://media.example/v1/assets/images",
};

function memoryStore() {
  const records = new Map();
  return {
    records,
    async get(key) {
      return structuredClone(records.get(key) || null);
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && records.has(key)) return { modified: false };
      records.set(key, structuredClone(value));
      return { modified: true };
    },
    async list({ prefix } = {}) {
      return {
        blobs: [...records.keys()]
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
    async delete(key) {
      records.delete(key);
    },
  };
}

async function blobsTestStore(t, name) {
  const directory = await mkdtemp(join(tmpdir(), `${name}-`));
  const server = new BlobsServer({ directory });
  const { address } = await server.start();
  t.after(async () => {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  });
  return getStore({
    edgeURL: address,
    uncachedEdgeURL: address,
    name,
    siteID: "test-site",
    token: "test-token",
  });
}

function omitStrongReadEtags(store) {
  const originalRead = store.getWithMetadata.bind(store);
  store.getWithMetadata = async (key, options) => {
    const entry = await originalRead(key, options);
    if (!entry) return entry;
    const { etag: _etag, ...withoutEtag } = entry;
    return withoutEtag;
  };
}

function publicationInput(overrides = {}) {
  const date = "2026-09-03";
  return {
    date,
    actor: {
      id: "liu-xueyi",
      name: "刘学义",
      nameEn: "Liu Xueyi",
      accentColor: "#8d2638",
    },
    vibe: {
      key: "liu-xueyi:3",
      idx: 3,
      label: "破碎感美人",
      labelEn: "Professionally Devastated",
      emoji: "🌙",
      subtitle: "为爱受苦",
      subtitleEn: "Born to suffer beautifully.",
      supportingCopy: "",
      supportingCopyEn: "",
      generationPrompt: "editorial",
    },
    board: {
      mode: "operator_rescue",
      candidates: Array.from({ length: 9 }, (_, position) => ({
        candidateId: `candidate-${position}`,
        title: `Frame ${position}`,
        thumbnail: `https://images.example/frame-${position}.png`,
        link: `https://publisher.example/story-${position}`,
        source: `publisher-${position}`,
        query: `query-${position}`,
      })),
    },
    provenance: {
      runId: "run-1",
      rescueReceiptId: "receipt-1",
      feedbackHash: "feedback-1",
    },
    resolveHost: async () => [{ address: "8.8.8.8", family: 4 }],
    ...overrides,
  };
}

function storedPublicationManifest(date, actorId) {
  const sourceCandidateIds = Array.from({ length: 9 }, (_, position) => `candidate-${actorId}-${position}`);
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
      name: actorId,
      nameEn: actorId,
      accentColor: "#8d2638",
    },
    vibe: {
      key: `${actorId}:0`,
      idx: 0,
      label: "氛围",
      labelEn: "Vibe",
    },
    heroPosition: 4,
    cardCount: 9,
    retention: { policy: "permanent", deleteWithCollection: false },
    provenance: { sourceCandidateIds },
    cards: sourceCandidateIds.map((candidateId, position) => ({
      position,
      candidateId,
      title: `Frame ${position}`,
      source: "publisher.example",
      link: `https://publisher.example/${position}`,
      sourceUrl: `https://images.example/${actorId}-${date}-${position}.jpg`,
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

function mediaHarness({ failSourcePosition = null, mismatchChecksum = false } = {}) {
  let sourceCalls = 0;
  let mediaCalls = 0;
  const metadata = [];
  const idempotencyKeys = [];
  const fetchImpl = async (url, init = {}) => {
    if (url === ENV.MEDIA_ASSETS_URL) {
      mediaCalls += 1;
      const file = init.body.get("file");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const checksum = createHash("sha256").update(bytes).digest("hex");
      metadata.push(JSON.parse(init.body.get("metadata")));
      idempotencyKeys.push(init.headers["Idempotency-Key"]);
      return new Response(JSON.stringify({
        data: {
          version: 1,
          assetId: `00000000-0000-4000-8000-${String(mediaCalls).padStart(12, "0")}`,
          mediaType: "image",
          mimeType: file.type,
          sizeBytes: bytes.byteLength,
          checksum: mismatchChecksum ? "0".repeat(64) : checksum,
          deliveryUrl: `https://media.example/assets/${checksum}.png`,
          thumbnailUrl: `https://media.example/thumbs/${checksum}.png`,
          dimensions: { width: 1200, height: 1200 },
        },
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    sourceCalls += 1;
    const position = Number(String(url).match(/frame-(\d+)/)?.[1]);
    if (position === failSourcePosition) {
      return new Response("gone", { status: 404 });
    }
    return new Response(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, position]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  };
  return {
    fetchImpl,
    metadata,
    idempotencyKeys,
    stats: () => ({ sourceCalls, mediaCalls }),
    clearFailure: () => {
      failSourcePosition = null;
    },
  };
}

test("materializes an immutable nine-card MEDIA manifest and reuses it idempotently", async () => {
  const store = memoryStore();
  const media = mediaHarness();
  const input = publicationInput();
  const first = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
    now: () => "2026-09-03T04:00:00.000Z",
  });

  assert.equal(isGridManifest(first.manifest), true);
  assert.equal(first.manifest.boardHash, boardHash(input.board));
  assert.equal(first.manifest.cards.length, 9);
  assert.equal(first.manifest.heroPosition, 4);
  assert.deepEqual(first.manifest.publicRecord, {
    actorPath: "/vibe-atlas/actors/liu-xueyi/",
    editionPath: "/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  });
  assert.deepEqual(first.manifest.cards.map(card => card.position), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(first.manifest.cards.every(card => card.media.association.type === "publication"));
  assert.ok(first.payload.displayResults.every(result => result.thumbnail.startsWith("https://media.example/thumbs/")));
  assert.equal(first.payload.displayResults[4].title, "Frame 4");
  assert.deepEqual(media.stats(), { sourceCalls: 9, mediaCalls: 9 });
  assert.equal(store.records.has(gridPendingKey(input.date)), false);
  assert.ok(store.records.has(gridManifestKey(input.date)));
  assert.deepEqual((await readPublicationReleaseDates(store)).dates, [input.date]);
  assert.equal(
    store.records.get(publicationActorIndexKey()).actors["liu-xueyi"].latestPublicationDate,
    input.date,
  );
  assert.equal(media.metadata[0].sourceType, "fandom-vibe-atlas-daily-drop");
  assert.match(media.metadata[0].linkedPostIdentifiers[0], /2026-09-03/);
  assert.equal(new Set(media.idempotencyKeys).size, 9);

  const second = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
  });
  assert.equal(second.manifest.manifestId, first.manifest.manifestId);
  assert.deepEqual((await readPublicationReleaseDates(store)).dates, [input.date]);
  assert.deepEqual(media.stats(), { sourceCalls: 9, mediaCalls: 9 });
});

test("a new publication cannot certify missing older releases without a verified baseline", async () => {
  const store = memoryStore();
  store.getWithMetadata = async key => store.records.has(key)
    ? { data: await store.get(key), etag: "test-revision" } : null;
  const oldDate = "2026-08-29";
  await store.setJSON(gridManifestKey(oldDate), storedPublicationManifest(oldDate, "actor-a"));
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1, catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog", dates: [],
  });
  const media = mediaHarness();
  const input = publicationInput();
  await materializePublicationManifest({
    store, ...input, env: ENV, fetchImpl: media.fetchImpl,
    now: () => "2026-09-03T04:00:00.000Z",
  });
  const history = await readPublicationReleaseDates(store);
  assert.deepEqual(history.dates, [input.date]);
  assert.equal(history.verifiedBaseline, false);
  const handler = createPublicSitemapHandler({
    getStore: () => store,
    buildReleaseCatalog: async () => ({ complete: true, packs: [] }),
  });
  const result = await handler(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  assert.equal(result.headers["X-Public-Sitemap-Inventory"], "release-history-unavailable");
});

test("publication manifests reject malformed stored public reader links", () => {
  const valid = storedPublicationManifest("2026-09-03", "liu-xueyi");
  valid.publicRecord = {
    actorPath: "/vibe-atlas/actors/liu-xueyi/",
    editionPath: "/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  };
  assert.equal(isGridManifest(valid), true);

  valid.publicRecord.editionPath = "/vibe-atlas/editions/2026-09-03/other-actor/";
  assert.equal(isGridManifest(valid), false);

  valid.publicRecord = {
    actorPath: "/vibe-atlas/actors/other-actor/",
    editionPath: "/vibe-atlas/editions/2026-09-04/other-actor/",
  };
  assert.equal(isGridManifest(valid), false);

  valid.publicRecord = null;
  assert.equal(isGridManifest(valid), false);
});

test("publication reader-link repair fixes malformed paths and actor mismatches idempotently", async () => {
  const store = memoryStore();
  store.getWithMetadata = async key => ({
    data: await store.get(key),
    etag: "test-revision",
  });
  for (const [date, publicRecord] of [
    ["2026-09-03", {
      actorPath: "/admin/actors/liu-xueyi/",
      editionPath: "/vibe-atlas/editions/2026-09-03/liu-xueyi/",
    }],
    ["2026-09-02", {
      actorPath: "/vibe-atlas/actors/other/",
      editionPath: "/vibe-atlas/editions/2026-09-02/other/",
    }],
  ]) {
    const manifest = storedPublicationManifest(date, "liu-xueyi");
    manifest.publicRecord = publicRecord;
    await store.setJSON(gridManifestKey(date), manifest);
  }
  const first = await repairPublicationManifestPublicRecords(store);
  assert.equal(first.repaired, 2);
  assert.equal(first.cataloged, 2);
  assert.deepEqual(first.invalid.map(item => item.status), [
    "malformed_actor_path", "actor_mismatch",
  ]);
  assert.deepEqual((await readPublicationManifests(store)).inventory, {
    catalogValid: true,
    catalogDateCount: 2,
    listedManifestCount: 2,
    manifestCount: 2,
    complete: true,
  });
  assert.deepEqual((await readPublicationReleaseDates(store)).dates, [
    "2026-09-02", "2026-09-03",
  ]);
  // A verified baseline must account for a repaired date before that date
  // can disappear without producing a public inventory warning.
  await store.setJSON(PUBLICATION_RELEASE_DATES_KEY, {
    ...(await readPublicationReleaseDates(store)),
    verifiedBaseline: true,
  });
  for (const date of ["2026-09-02", "2026-09-03"]) {
    await store.setJSON(publicationReleaseReceiptKey(date), {
      schemaVersion: 1, kind: "vibe-atlas-release-receipt", date,
    }, { onlyIfNew: true });
  }
  const handler = createPublicSitemapHandler({
    getStore: () => store,
    buildReleaseCatalog: async () => ({ complete: true, packs: [] }),
  });
  const sitemap = () => handler(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  assert.equal((await sitemap()).headers["X-Public-Sitemap-Inventory"], "complete");
  const catalog = await store.get(publicationManifestCatalogKey());
  await store.setJSON(publicationManifestCatalogKey(), {
    ...catalog, dates: ["2026-09-03"],
  });
  assert.equal((await sitemap()).headers["X-Public-Sitemap-Inventory"], "publication-history-mismatch");
  await store.setJSON(publicationManifestCatalogKey(), catalog);
  const second = await repairPublicationManifestPublicRecords(store);
  assert.equal(second.repaired, 0);
  assert.equal(second.cataloged, 0);
  assert.deepEqual(second.invalid, []);
});

test("publication reader-link repair fails after repeated conflicts without reporting success", async () => {
  const store = memoryStore();
  const manifest = storedPublicationManifest("2026-09-03", "liu-xueyi");
  manifest.publicRecord = {
    actorPath: "/admin/actors/liu-xueyi/",
    editionPath: "/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  };
  await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: [manifest.publicationDate],
    updatedAt: "2026-09-03T12:00:00.000Z",
  });
  store.getWithMetadata = async key => ({
    data: await store.get(key),
    etag: "test-revision",
  });
  let conflicts = 0;
  store.setJSON = async () => {
    conflicts += 1;
    return { modified: false };
  };
  await assert.rejects(
    repairPublicationManifestPublicRecords(store),
    /after repeated conflicts/,
  );
  assert.equal(conflicts, 8);
});

test("Netlify Blobs reader-link repair recovers an exact-key ETag before rereading changed manifest data", async t => {
  const store = await blobsTestStore(t, "publication-reader-link-recovery-contract");
  const manifest = storedPublicationManifest("2026-09-03", "liu-xueyi");
  manifest.publicRecord = {
    actorPath: "/admin/actors/liu-xueyi/",
    editionPath: "/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  };
  const key = gridManifestKey(manifest.publicationDate);
  await store.setJSON(key, manifest);
  omitStrongReadEtags(store);

  const originalMetadata = store.getMetadata.bind(store);
  let injected = false;
  store.getMetadata = async (readKey, options) => {
    if (readKey === key && !injected) {
      injected = true;
      await store.setJSON(key, {
        ...manifest,
        vibe: { ...manifest.vibe, subtitleEn: "Concurrent editorial revision" },
      });
    }
    return originalMetadata(readKey, options);
  };

  const result = await repairPublicationManifestPublicRecords(store);
  const authoritative = await store.get(key, { type: "json", consistency: "strong" });
  assert.equal(injected, true);
  assert.equal(result.repaired, 1);
  assert.equal(authoritative.vibe.subtitleEn, "Concurrent editorial revision");
  assert.deepEqual(authoritative.publicRecord, {
    actorPath: "/vibe-atlas/actors/liu-xueyi/",
    editionPath: "/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  });
  assert.equal((await repairPublicationManifestPublicRecords(store)).repaired, 0);
});

test("Netlify Blobs reader-link repair retries a conditional-write conflict with fresh manifest data", async t => {
  const store = await blobsTestStore(t, "publication-reader-link-conflict-contract");
  const manifest = storedPublicationManifest("2026-09-03", "liu-xueyi");
  manifest.publicRecord = {
    actorPath: "/admin/actors/liu-xueyi/",
    editionPath: "/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  };
  const key = gridManifestKey(manifest.publicationDate);
  await store.setJSON(key, manifest);
  omitStrongReadEtags(store);

  const originalSet = store.setJSON.bind(store);
  let injected = false;
  let conflicts = 0;
  store.setJSON = async (writeKey, value, options = {}) => {
    if (writeKey === key && options.onlyIfMatch && !injected) {
      injected = true;
      await originalSet(key, {
        ...manifest,
        vibe: { ...manifest.vibe, subtitleEn: "Intervening editorial revision" },
      });
    }
    const result = await originalSet(writeKey, value, options);
    if (writeKey === key && result?.modified === false) conflicts += 1;
    return result;
  };

  const result = await repairPublicationManifestPublicRecords(store);
  const authoritative = await store.get(key, { type: "json", consistency: "strong" });
  assert.equal(injected, true);
  assert.equal(conflicts, 1);
  assert.equal(result.repaired, 1);
  assert.equal(authoritative.vibe.subtitleEn, "Intervening editorial revision");
  assert.deepEqual(authoritative.publicRecord, {
    actorPath: "/vibe-atlas/actors/liu-xueyi/",
    editionPath: "/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  });
});

test("publication revalidates eligibility inside the shared correction lock", async () => {
  const store = memoryStore();
  const media = mediaHarness();
  await assert.rejects(
    materializePublicationManifest({
      store,
      ...publicationInput(),
      env: ENV,
      fetchImpl: media.fetchImpl,
      validateBeforeCommit: async () => {
        const error = new Error("Approval was invalidated.");
        error.status = 409;
        throw error;
      },
    }),
    error => error?.status === 409 && /invalidated/i.test(error.message),
  );
  assert.equal(store.records.has(gridManifestKey("2026-09-03")), false);
  assert.equal(store.records.has(publicationManifestCatalogKey()), false);
  assert.deepEqual(media.stats(), { sourceCalls: 0, mediaCalls: 0 });
});

test("publication revalidates eligibility after MEDIA work and before committing the manifest", async () => {
  const store = memoryStore();
  const media = mediaHarness();
  let validations = 0;
  await assert.rejects(
    materializePublicationManifest({
      store,
      ...publicationInput(),
      env: ENV,
      fetchImpl: media.fetchImpl,
      validateBeforeCommit: async () => {
        validations += 1;
        if (validations === 2) {
          const error = new Error("Approval changed during MEDIA materialization.");
          error.status = 409;
          throw error;
        }
      },
    }),
    error => error?.status === 409 && /during MEDIA materialization/i.test(error.message),
  );
  assert.equal(validations, 2);
  assert.deepEqual(media.stats(), { sourceCalls: 9, mediaCalls: 9 });
  assert.equal(store.records.has(gridManifestKey("2026-09-03")), false);
});

test("publication corrections are append-only notices over immutable manifests", async () => {
  const store = memoryStore();
  const manifest = storedPublicationManifest("2026-09-03", "liu-xueyi");
  const frozen = structuredClone(manifest);
  await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  const correction = {
    receiptId: "misprint-receipt-1",
    status: "active",
    futureExclusion: true,
    actorId: "liu-xueyi",
    vibeKey: "liu-xueyi:0",
    reason: "wrong_actor",
    correctionScope: "actor_identity",
    markedAt: "2026-09-04T04:00:00.000Z",
    candidate: {
      candidateId: manifest.cards[2].candidateId,
    },
  };
  const first = await recordPublicationCorrectionsForMisprint({
    store,
    correction,
    matchesCandidate: (_sourceCorrection, candidate) =>
      candidate.candidateId === correction.candidate.candidateId,
    now: () => "2026-09-04T04:01:00.000Z",
  });
  const second = await recordPublicationCorrectionsForMisprint({
    store,
    correction,
    matchesCandidate: (_sourceCorrection, candidate) =>
      candidate.candidateId === correction.candidate.candidateId,
    now: () => "2026-09-04T04:02:00.000Z",
  });

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].receiptId, second[0].receiptId);
  assert.deepEqual(first[0].affectedPositions, [2]);
  assert.equal(first[0].resolution, "requires_explicit_supersession");
  assert.deepEqual(store.records.get(gridManifestKey(manifest.publicationDate)), frozen);
  assert.equal(
    [...store.records.keys()]
      .filter(key => key.startsWith(gridCorrectionPrefix(manifest.publicationDate))).length,
    1,
  );
  assert.deepEqual(
    await readPublicationCorrections(store, manifest.publicationDate),
    [first[0]],
  );
});

test("publication corrections strongly read indexed manifests when blob listings lag", async () => {
  const store = memoryStore();
  const manifest = storedPublicationManifest("2026-08-04", "liu-xueyi");
  const newerManifest = storedPublicationManifest("2026-09-04", "liu-xueyi");
  newerManifest.cards[0] = {
    ...newerManifest.cards[0],
    candidateId: "newer-candidate-0",
  };
  await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  await store.setJSON(gridManifestKey(newerManifest.publicationDate), newerManifest);
  await rebuildPublicationActorIndex(store);
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: [manifest.publicationDate, newerManifest.publicationDate],
    updatedAt: "2026-09-04T12:00:00.000Z",
  });
  const list = store.list.bind(store);
  store.list = async options => options?.prefix === gridManifestKey("")
    ? { blobs: [] }
    : list(options);
  const correction = {
    receiptId: "listing-lag-misprint",
    status: "active",
    futureExclusion: true,
    actorId: manifest.actor.id,
    vibeKey: manifest.vibe.key,
    reason: "wrong_actor",
    correctionScope: "actor_identity",
    candidate: {
      candidateId: manifest.cards[0].candidateId,
    },
  };

  const receipts = await recordPublicationCorrectionsForMisprint({
    store,
    correction,
    matchesCandidate: (sourceCorrection, candidate) =>
      sourceCorrection.candidate.candidateId === candidate.candidateId,
  });

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].manifestId, manifest.manifestId);
});

test("vibe-local publication corrections do not annotate another vibe for the same actor", async () => {
  const store = memoryStore();
  const matchingVibe = storedPublicationManifest("2026-09-03", "liu-xueyi");
  const otherVibe = {
    ...storedPublicationManifest("2026-09-04", "liu-xueyi"),
    vibe: {
      ...matchingVibe.vibe,
      key: "liu-xueyi:1",
      idx: 1,
    },
  };
  otherVibe.cards[2] = {
    ...otherVibe.cards[2],
    candidateId: matchingVibe.cards[2].candidateId,
  };
  await store.setJSON(gridManifestKey(matchingVibe.publicationDate), matchingVibe);
  await store.setJSON(gridManifestKey(otherVibe.publicationDate), otherVibe);
  const correction = {
    receiptId: "vibe-local-misprint",
    status: "active",
    futureExclusion: true,
    actorId: "liu-xueyi",
    vibeKey: "liu-xueyi:0",
    reason: "wrong_vibe",
    correctionScope: "actor_vibe",
    markedAt: "2026-09-05T04:00:00.000Z",
    candidate: {
      candidateId: matchingVibe.cards[2].candidateId,
    },
  };

  const receipts = await recordPublicationCorrectionsForMisprint({
    store,
    correction,
    matchesCandidate: (_sourceCorrection, candidate) =>
      candidate.candidateId === correction.candidate.candidateId,
    now: () => "2026-09-05T04:01:00.000Z",
  });

  assert.deepEqual(
    receipts.map(receipt => receipt.publicationDate),
    [matchingVibe.publicationDate],
  );
  assert.deepEqual(
    await readPublicationCorrections(store, otherVibe.publicationDate),
    [],
  );
});

test("reads latest actor dates from the index and rebuilds missing or stale data from manifests", async () => {
  const store = memoryStore();
  const manifests = [
    storedPublicationManifest("2026-07-01", "actor-a"),
    storedPublicationManifest("2026-08-30", "actor-a"),
    storedPublicationManifest("2026-08-20", "actor-b"),
  ];
  for (const manifest of manifests) {
    await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  }

  const rebuilt = await rebuildPublicationActorIndex(store, {
    throughDate: "2026-08-31",
    now: () => "2026-08-31T04:00:00.000Z",
  });
  assert.equal(rebuilt.actors["actor-a"].latestPublicationDate, "2026-08-30");
  assert.equal(rebuilt.actors["actor-b"].latestPublicationDate, "2026-08-20");

  const indexed = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.deepEqual([...indexed], [
    ["actor-a", "2026-08-30"],
    ["actor-b", "2026-08-20"],
  ]);

  await store.setJSON(publicationActorIndexKey(), {
    ...rebuilt,
    actors: {
      ...rebuilt.actors,
      "actor-a": {
        ...rebuilt.actors["actor-a"],
        manifestId: "stale-manifest",
      },
    },
  });
  const repaired = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(repaired.get("actor-a"), "2026-08-30");
  assert.equal(
    store.records.get(publicationActorIndexKey()).actors["actor-a"].manifestId,
    "manifest-actor-a-2026-08-30",
  );
});

test("actor index repair health stays quiet once and warns on repeated or failed repairs", async () => {
  const store = memoryStore();
  const now = () => "2026-08-31T04:00:00.000Z";

  const first = await readLatestPublicationDatesByActorWithHealth(store, { now });
  assert.equal(first.repairHealth.warning, false);
  assert.equal(first.repairHealth.attemptCount, 1);

  store.records.delete(publicationActorIndexKey());
  const repeated = await readLatestPublicationDatesByActorWithHealth(store, { now });
  assert.equal(repeated.repairHealth.status, "repeated");
  assert.equal(repeated.repairHealth.warning, true);
  assert.equal(repeated.repairHealth.attemptCount, 2);

  const originalSetJSON = store.setJSON.bind(store);
  store.records.delete(publicationActorIndexKey());
  store.setJSON = async (key, value, options) => {
    if (key === publicationActorIndexKey()) throw new Error("index write unavailable");
    return originalSetJSON(key, value, options);
  };
  const fallback = await readLatestPublicationDatesByActorWithHealth(store, { now });
  assert.equal(fallback.repairHealth.status, "failed");
  assert.equal(fallback.repairHealth.failedAttemptCount, 1);
  assert.equal(store.records.get(publicationActorIndexRepairKey()).events.at(-1).outcome, "fallback_scan");
});

test("actor index repair health is unavailable for malformed stored events", async () => {
  const now = () => "2026-08-31T04:00:00.000Z";
  const malformedEvents = [
    { reason: "missing", outcome: "rebuilt" },
    { attemptedAt: 42, reason: "missing", outcome: "rebuilt" },
    { attemptedAt: "not-a-date", reason: "missing", outcome: "rebuilt" },
    { attemptedAt: "2026-08-31T03:00:00.000Z", reason: "missing" },
  ];

  for (const event of malformedEvents) {
    const store = memoryStore();
    await rebuildPublicationActorIndex(store, { now });
    await store.setJSON(publicationActorIndexRepairKey(), {
      schemaVersion: 1,
      kind: "vibe-atlas-publication-actor-index-repair-health",
      updatedAt: now(),
      events: [event],
    });

    const result = await readLatestPublicationDatesByActorWithHealth(store, { now });
    assert.deepEqual(result.repairHealth, {
      status: "unavailable",
      warning: true,
      windowHours: 24,
      attemptCount: 0,
      failedAttemptCount: 0,
      lastAttemptAt: null,
      lastOutcome: null,
    });
  }
});

test("actor index repair health is unavailable for invalid summary inputs", async () => {
  const store = memoryStore();
  await rebuildPublicationActorIndex(store);
  await store.setJSON(publicationActorIndexRepairKey(), {
    schemaVersion: 1,
    kind: "vibe-atlas-publication-actor-index-repair-health",
    updatedAt: "2026-08-31T04:00:00.000Z",
    events: [],
  });

  const result = await readLatestPublicationDatesByActorWithHealth(store, {
    now: () => "invalid-window-end",
  });
  assert.equal(result.repairHealth.status, "unavailable");
  assert.equal(result.repairHealth.warning, true);
  assert.equal(Number.isFinite(result.repairHealth.windowHours), true);
  assert.equal(result.repairHealth.windowHours >= 0, true);
  assert.equal(Number.isFinite(result.repairHealth.attemptCount), true);
  assert.equal(result.repairHealth.attemptCount >= 0, true);
  assert.equal(Number.isFinite(result.repairHealth.failedAttemptCount), true);
  assert.equal(result.repairHealth.failedAttemptCount >= 0, true);
});

test("a later complete listing repairs an older manifest omitted during bootstrap", async () => {
  const store = memoryStore();
  const manifest = storedPublicationManifest("2026-07-01", "actor-a");
  await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  const completeList = store.list;
  store.list = async () => ({ blobs: [] });

  const incomplete = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(incomplete.has("actor-a"), false);

  store.list = completeList;
  const repaired = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(repaired.get("actor-a"), "2026-07-01");
});

test("cutoff reads keep the latest actor date at or before the requested day", async () => {
  const store = memoryStore();
  await store.setJSON(
    gridManifestKey("2026-08-01"),
    storedPublicationManifest("2026-08-01", "actor-a"),
  );
  await store.setJSON(
    gridManifestKey("2026-09-01"),
    storedPublicationManifest("2026-09-01", "actor-a"),
  );

  const first = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(first.get("actor-a"), "2026-08-01");
  assert.equal(
    store.records.get(publicationActorIndexKey()).actorDateThrough,
    "2026-08-31",
  );

  const originalList = store.list;
  let listCalls = 0;
  store.list = async options => {
    listCalls += 1;
    return originalList(options);
  };
  const second = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(second.get("actor-a"), "2026-08-01");
  assert.equal(listCalls, 1);
});

test("rebuild uses strong recent-date reads when the manifest listing lags", async () => {
  const store = memoryStore();
  const manifest = storedPublicationManifest("2026-08-30", "actor-a");
  await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  store.list = async () => ({ blobs: [] });

  const dates = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });

  assert.equal(dates.get("actor-a"), "2026-08-30");
  assert.equal(
    store.records.get(publicationActorIndexKey()).actors["actor-a"].manifestId,
    manifest.manifestId,
  );
});

test("rebuild ignores malformed manifest-shaped blobs", async () => {
  const store = memoryStore();
  const verified = storedPublicationManifest("2026-08-20", "actor-a");
  await store.setJSON(gridManifestKey(verified.publicationDate), verified);
  await store.setJSON(gridManifestKey("2026-08-30"), {
    publicationDate: "2026-08-30",
    actor: { id: "actor-a" },
  });

  const rebuilt = await rebuildPublicationActorIndex(store, {
    throughDate: "2026-08-31",
  });

  assert.equal(rebuilt.actors["actor-a"].latestPublicationDate, "2026-08-20");
  const originalList = store.list;
  let listCalls = 0;
  store.list = async options => {
    listCalls += 1;
    return originalList(options);
  };
  const dates = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(dates.get("actor-a"), "2026-08-20");
  assert.equal(listCalls, 1);
});

test("a derived index write failure cannot fail an already committed publication", async () => {
  const store = memoryStore();
  const originalSetJSON = store.setJSON.bind(store);
  store.setJSON = async (key, value, options) => {
    if (key === publicationActorIndexKey()) {
      throw new Error("simulated index outage");
    }
    return originalSetJSON(key, value, options);
  };
  const media = mediaHarness();
  const input = publicationInput();

  const published = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
  });

  assert.equal(isGridManifest(published.manifest), true);
  assert.equal(store.records.has(gridManifestKey(input.date)), true);
  assert.equal(store.records.has(publicationActorIndexKey()), false);
});

test("partial MEDIA failure publishes no manifest and retries only unfinished cards", async () => {
  const store = memoryStore();
  const media = mediaHarness({ failSourcePosition: 3 });
  const input = publicationInput();

  await assert.rejects(
    materializePublicationManifest({
      store,
      ...input,
      env: ENV,
      fetchImpl: media.fetchImpl,
    }),
    /could not be reached/i,
  );
  assert.equal(store.records.has(gridManifestKey(input.date)), false);
  assert.equal(store.records.has(publicationManifestCatalogKey()), false);
  assert.equal(store.records.get(gridPendingKey(input.date)).assets.length, 8);
  assert.equal(store.records.get(gridPendingKey(input.date)).failedPosition, 3);

  media.clearFailure();
  const recovered = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
  });
  assert.equal(isGridManifest(recovered.manifest), true);
  assert.deepEqual(store.records.get(publicationManifestCatalogKey()).dates, [input.date]);
  assert.deepEqual(media.stats(), { sourceCalls: 10, mediaCalls: 9 });
});

test("a checksum mismatch or different board cannot replace a published date", async () => {
  const brokenStore = memoryStore();
  const brokenMedia = mediaHarness({ mismatchChecksum: true });
  const input = publicationInput();
  await assert.rejects(
    materializePublicationManifest({
      store: brokenStore,
      ...input,
      env: ENV,
      fetchImpl: brokenMedia.fetchImpl,
    }),
    /mismatched image descriptor/i,
  );
  assert.equal(brokenStore.records.has(gridManifestKey(input.date)), false);

  const store = memoryStore();
  const media = mediaHarness();
  const published = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
  });
  const changed = publicationInput({
    board: {
      ...input.board,
      candidates: input.board.candidates.map((candidate, position) =>
        position === 0 ? { ...candidate, candidateId: "different-candidate" } : candidate),
    },
  });
  await assert.rejects(
    materializePublicationManifest({
      store,
      ...changed,
      env: ENV,
      fetchImpl: media.fetchImpl,
    }),
    /different immutable board/i,
  );
  assert.equal(manifestPayload(store.records.get(gridManifestKey(input.date))).displayResults[0].title,
    published.payload.displayResults[0].title);
});

test("conditional writes are verified by strong read even when the Blob API returns undefined", async () => {
  const store = memoryStore();
  const originalSet = store.setJSON.bind(store);
  const input = publicationInput();
  store.setJSON = async (key, value, options = {}) => {
    if (key === gridManifestKey(input.date) && options.onlyIfNew) {
      store.records.set(key, {
        ...structuredClone(value),
        manifestId: "competing-manifest",
        boardHash: "b".repeat(64),
      });
      return undefined;
    }
    return originalSet(key, value, options);
  };
  const media = mediaHarness();
  await assert.rejects(
    materializePublicationManifest({
      store,
      ...input,
      env: ENV,
      fetchImpl: media.fetchImpl,
    }),
    /another board won/i,
  );
  assert.equal(store.records.get(gridManifestKey(input.date)).manifestId, "competing-manifest");
});

test("the publication lock serializes concurrent boards and source redirects cannot reach private hosts", async () => {
  const store = memoryStore();
  const media = mediaHarness();
  const first = publicationInput();
  const second = publicationInput({
    board: {
      ...first.board,
      candidates: first.board.candidates.map((candidate, position) =>
        position === 0 ? { ...candidate, candidateId: "competing-candidate" } : candidate),
    },
  });
  const outcomes = await Promise.allSettled([
    materializePublicationManifest({
      store,
      ...first,
      env: ENV,
      fetchImpl: media.fetchImpl,
    }),
    materializePublicationManifest({
      store,
      ...second,
      env: ENV,
      fetchImpl: media.fetchImpl,
    }),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(outcome => outcome.status === "rejected").length, 1);
  assert.equal(media.stats().mediaCalls, 9);

  let fetchCalls = 0;
  const redirectingFetch = async () => {
    fetchCalls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: "https://127.0.0.1/private-image.jpg" },
    });
  };
  await assert.rejects(
    materializePublicationManifest({
      store: memoryStore(),
      ...publicationInput({ date: "2026-09-04" }),
      env: ENV,
      fetchImpl: redirectingFetch,
    }),
    /host is not public/i,
  );
  assert.equal(fetchCalls, 9);
});

test("Netlify Blobs exact-key ETags keep existing publication locks and catalog updates conditional", async t => {
  const store = await blobsTestStore(t, "publication-etag-recovery-contract");
  const input = publicationInput({ date: "2026-09-04" });
  const correctionLockKey = "locks/misprint-publication";
  const publicationLockKey = `vibeAtlas:grid-lock:v1:${input.date}`;
  await store.setJSON(correctionLockKey, {
    schemaVersion: 1,
    token: "released-correction",
    startedAt: "2026-09-03T00:00:00.000Z",
    state: "released",
  });
  await store.setJSON(publicationLockKey, {
    schemaVersion: 1,
    token: "released-publication",
    date: input.date,
    boardHash: "0".repeat(64),
    startedAt: "2026-09-03T00:00:00.000Z",
    state: "released",
  });
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: ["2026-09-02"],
    updatedAt: "2026-09-02T04:00:00.000Z",
  });

  const originalSet = store.setJSON.bind(store);
  let injectedCatalogConflict = false;
  store.setJSON = async (key, value, options = {}) => {
    if (key === publicationManifestCatalogKey()
      && options.onlyIfMatch
      && !injectedCatalogConflict) {
      injectedCatalogConflict = true;
      await originalSet(key, {
        schemaVersion: 1,
        catalogVersion: "v1",
        kind: "vibe-atlas-publication-manifest-catalog",
        dates: ["2026-09-02", "2026-09-03"],
        updatedAt: "2026-09-03T04:00:00.000Z",
      });
    }
    return originalSet(key, value, options);
  };
  omitStrongReadEtags(store);

  const media = mediaHarness();
  const published = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
    now: () => "2026-09-04T04:00:00.000Z",
  });

  assert.equal(published.manifest.publicationDate, input.date);
  assert.equal(injectedCatalogConflict, true);
  assert.deepEqual(
    (await store.get(publicationManifestCatalogKey(), {
      type: "json",
      consistency: "strong",
    })).dates,
    ["2026-09-02", "2026-09-03", "2026-09-04"],
  );
});

test("Netlify Blobs correction locks recover exact-key ETags instead of replacing existing leases", async t => {
  const store = await blobsTestStore(t, "correction-lock-etag-recovery-contract");
  await store.setJSON("locks/misprint-publication", {
    schemaVersion: 1,
    token: "released-owner",
    startedAt: "2026-09-03T00:00:00.000Z",
    state: "released",
  });
  omitStrongReadEtags(store);

  const first = await acquireCorrectionPublicationLock(
    store,
    () => new Date("2026-09-04T04:00:00.000Z"),
  );
  const authoritative = await store.get("locks/misprint-publication", {
    type: "json",
    consistency: "strong",
  });
  assert.equal(authoritative.token, first.token);
  assert.notEqual(authoritative.token, "released-owner");

  await releaseCorrectionPublicationLock(store, first);
});

test("publication lock recovery never pairs a released lease with a concurrently active ETag", async t => {
  const store = await blobsTestStore(t, "publication-lock-coherent-etag-contract");
  const input = publicationInput({ date: "2026-09-05" });
  const lockKey = `vibeAtlas:grid-lock:v1:${input.date}`;
  await store.setJSON(lockKey, {
    schemaVersion: 1,
    token: "released-owner",
    date: input.date,
    boardHash: "0".repeat(64),
    startedAt: "2026-09-04T00:00:00.000Z",
    state: "released",
  });
  omitStrongReadEtags(store);
  const originalMetadata = store.getMetadata.bind(store);
  let injected = false;
  store.getMetadata = async (key, options) => {
    if (key === lockKey && !injected) {
      injected = true;
      await store.setJSON(lockKey, {
        schemaVersion: 1,
        token: "active-owner",
        date: input.date,
        boardHash: "1".repeat(64),
        startedAt: "2026-09-05T03:59:00.000Z",
      });
    }
    return originalMetadata(key, options);
  };

  await assert.rejects(
    materializePublicationManifest({
      store,
      ...input,
      publicationCorrectionLock: { token: "shared-owner" },
      env: ENV,
      fetchImpl: mediaHarness().fetchImpl,
      now: () => "2026-09-05T04:00:00.000Z",
    }),
    /already being materialized/i,
  );
  assert.equal(injected, true);
  assert.equal(
    (await store.get(lockKey, { type: "json", consistency: "strong" })).token,
    "active-owner",
  );
});

test("catalog recovery rereads data after a concurrent update changes the recovered ETag", async t => {
  const store = await blobsTestStore(t, "publication-catalog-coherent-etag-contract");
  const input = publicationInput({ date: "2026-09-05" });
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: ["2026-09-02"],
    updatedAt: "2026-09-02T04:00:00.000Z",
  });
  omitStrongReadEtags(store);
  const originalMetadata = store.getMetadata.bind(store);
  let injected = false;
  store.getMetadata = async (key, options) => {
    if (key === publicationManifestCatalogKey() && !injected) {
      injected = true;
      await store.setJSON(key, {
        schemaVersion: 1,
        catalogVersion: "v1",
        kind: "vibe-atlas-publication-manifest-catalog",
        dates: ["2026-09-02", "2026-09-03"],
        updatedAt: "2026-09-03T04:00:00.000Z",
      });
    }
    return originalMetadata(key, options);
  };

  await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: mediaHarness().fetchImpl,
    now: () => "2026-09-05T04:00:00.000Z",
  });

  assert.equal(injected, true);
  assert.deepEqual(
    (await store.get(publicationManifestCatalogKey(), {
      type: "json",
      consistency: "strong",
    })).dates,
    ["2026-09-02", "2026-09-03", "2026-09-05"],
  );
});

test("repair recovery catalog retains intervening receipts when Blob metadata omits ETags", async t => {
  const store = await blobsTestStore(t, "repair-recovery-catalog-etag-contract");
  const catalogKey = publicationActorIndexRepairRecoveryCatalogKey();
  const recover = (id, timestamp) => recoverPublicationActorIndexRepairHealth(store, {
    operator: "operator",
    createReceiptId: () => id,
    now: () => timestamp,
  });
  const first = await recover("first", "2026-09-01T04:00:00.000Z");

  omitStrongReadEtags(store);
  const originalMetadata = store.getMetadata.bind(store);
  store.getMetadata = async (key, options) => {
    const metadata = await originalMetadata(key, options);
    if (key !== catalogKey || !metadata) return metadata;
    const { etag: _etag, ...withoutEtag } = metadata;
    return withoutEtag;
  };

  const originalSet = store.setJSON.bind(store);
  let injected = false;
  let conditionalAttempts = 0;
  store.setJSON = async (key, value, options = {}) => {
    if (key === catalogKey && options.onlyIfMatch) {
      conditionalAttempts += 1;
      if (!injected) {
        injected = true;
        await recover("intervening", "2026-09-03T04:00:00.000Z");
      }
    }
    return originalSet(key, value, options);
  };

  const second = await recover("second", "2026-09-02T04:00:00.000Z");
  const history = await listPublicationActorIndexRepairRecoveryReceipts(store);

  assert.equal(injected, true);
  assert.equal(conditionalAttempts >= 3, true);
  assert.deepEqual(history.receipts.map(item => item.receiptId), [
    "repair-health-recovery-intervening",
    second.receiptId,
    first.receiptId,
  ]);
  assert.deepEqual(
    (await store.get(catalogKey, { type: "json", consistency: "strong" }))
      .receipts.map(item => item.receiptId),
    history.receipts.map(item => item.receiptId),
  );
});

test("actor index rebuild recovers an exact-key ETag and retains an intervening actor update", async t => {
  const store = await blobsTestStore(t, "actor-index-rebuild-etag-recovery-contract");
  const first = storedPublicationManifest("2026-09-01", "actor-a");
  const concurrent = storedPublicationManifest("2026-09-02", "actor-b");
  await store.setJSON(gridManifestKey(first.publicationDate), first);
  const initial = await rebuildPublicationActorIndex(store);
  await store.setJSON(gridManifestKey(concurrent.publicationDate), concurrent);
  const intervening = await rebuildPublicationActorIndex(store);
  await store.setJSON(publicationActorIndexKey(), initial);

  omitStrongReadEtags(store);
  const originalMetadata = store.getMetadata.bind(store);
  let injected = false;
  store.getMetadata = async (key, options) => {
    if (key === publicationActorIndexKey() && !injected) {
      injected = true;
      await store.setJSON(key, intervening);
    }
    return originalMetadata(key, options);
  };
  const originalList = store.list.bind(store);
  store.list = async options => options?.prefix === gridManifestKey("")
    ? { blobs: [{ key: gridManifestKey(first.publicationDate) }] }
    : originalList(options);

  const rebuilt = await rebuildPublicationActorIndex(store);

  assert.equal(injected, true);
  assert.equal(rebuilt.actors["actor-a"].latestPublicationDate, first.publicationDate);
  assert.equal(rebuilt.actors["actor-b"].latestPublicationDate, concurrent.publicationDate);
});

test("actor index updates retry recovered ETags instead of overwriting an intervening actor", async t => {
  const store = await blobsTestStore(t, "actor-index-update-etag-recovery-contract");
  const first = storedPublicationManifest("2026-09-01", "actor-a");
  const concurrent = storedPublicationManifest("2026-09-02", "actor-b");
  await store.setJSON(gridManifestKey(first.publicationDate), first);
  const initial = await rebuildPublicationActorIndex(store);
  await store.setJSON(gridManifestKey(concurrent.publicationDate), concurrent);
  const intervening = await rebuildPublicationActorIndex(store);
  await store.setJSON(publicationActorIndexKey(), initial);

  omitStrongReadEtags(store);
  const originalMetadata = store.getMetadata.bind(store);
  let injected = false;
  store.getMetadata = async (key, options) => {
    if (key === publicationActorIndexKey() && !injected) {
      injected = true;
      await store.setJSON(key, intervening);
    }
    return originalMetadata(key, options);
  };
  const originalList = store.list.bind(store);
  store.list = async options => options?.prefix === gridManifestKey("")
    ? { blobs: [{ key: gridManifestKey(first.publicationDate) }] }
    : originalList(options);

  await materializePublicationManifest({
    store,
    ...publicationInput({ date: "2026-09-03" }),
    env: ENV,
    fetchImpl: mediaHarness().fetchImpl,
    now: () => "2026-09-03T04:00:00.000Z",
  });

  const authoritative = await store.get(publicationActorIndexKey(), {
    type: "json",
    consistency: "strong",
  });
  assert.equal(injected, true);
  assert.equal(authoritative.actors["actor-b"].latestPublicationDate, concurrent.publicationDate);
  assert.equal(authoritative.actors["liu-xueyi"].latestPublicationDate, "2026-09-03");
});