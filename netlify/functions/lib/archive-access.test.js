import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_ACCESS_WINDOW_KEY,
  ARCHIVE_CATALOG_KEY,
  ARCHIVE_FREE_EDITION_COUNT,
  archiveAccessDecision,
  archiveCatalogEditions,
  archiveAccessWindowDates,
  ensureArchiveAccessWindow,
  freeArchiveDates,
  publicArchiveEdition,
  updateArchiveCatalog,
} from "./archive-access.js";
import { createStarOfDayHandler } from "../star-of-day.js";
import { publicArchiveRecord } from "../../../src/contracts/publicArchiveRecord.js";

const editions = [
  "2026-09-20",
  "2026-09-18",
  "2026-09-17",
  "2026-09-12",
  "2026-09-01",
].map(date => ({ date }));

test("the free archive window follows the four latest published editions, not calendar days", () => {
  assert.equal(ARCHIVE_FREE_EDITION_COUNT, 4);
  assert.deepEqual([...freeArchiveDates(editions)], [
    "2026-09-20",
    "2026-09-18",
    "2026-09-17",
    "2026-09-12",
  ]);
});

test("the compact archive access window validates strictly and fails closed", () => {
  const valid = {
    schemaVersion: 1,
    accessWindowVersion: 1,
    kind: "vibe-atlas-archive-access-window",
    freeArchiveDates: ["2026-09-20", "2026-09-18", "2026-09-17", "2026-09-12"],
  };
  assert.deepEqual([...archiveAccessWindowDates(valid)], valid.freeArchiveDates);
  assert.deepEqual([...archiveAccessWindowDates({ ...valid, freeArchiveDates: ["2026-09-18", "2026-09-20"] })], []);
  assert.deepEqual([...archiveAccessWindowDates({ ...valid, accessWindowVersion: 2 })], []);
});

test("archive access window storage stays fixed-size for a large catalogue", async () => {
  const store = memoryStore({});
  const dates = Array.from({ length: 10000 }, (_, index) =>
    new Date(Date.UTC(1990, 0, index + 1)).toISOString().slice(0, 10));
  await ensureArchiveAccessWindow(store, dates, () => "2026-09-20T00:00:00.000Z");
  const record = await store.get(ARCHIVE_ACCESS_WINDOW_KEY, { type: "json" });
  assert.equal(record.freeArchiveDates.length, ARCHIVE_FREE_EDITION_COUNT);
  assert.ok(JSON.stringify(record).length < 500);
  assert.deepEqual(record.freeArchiveDates, [...dates].sort().reverse().slice(0, 4));
});

test("publication safely merges archive metadata in newest-first order", async () => {
  const store = memoryStore({});
  const edition = date => ({
    date,
    actorName: `Actor ${date}`,
    vibeLabel: "氛围",
    previewThumbnails: [],
    access: "member",
  });

  await updateArchiveCatalog(store, edition("2026-09-18"), () => "2026-09-18T04:00:00.000Z");
  await updateArchiveCatalog(store, edition("2026-09-20"), () => "2026-09-20T04:00:00.000Z");
  await updateArchiveCatalog(store, {
    ...edition("2026-09-18"),
    actorName: "Corrected Actor",
  }, () => "2026-09-20T05:00:00.000Z");

  const catalog = await store.get(ARCHIVE_CATALOG_KEY, { type: "json" });
  assert.deepEqual(
    archiveCatalogEditions(catalog).map(item => [item.date, item.actorName]),
    [
      ["2026-09-20", "Actor 2026-09-20"],
      ["2026-09-18", "Corrected Actor"],
    ],
  );
});

test("simultaneous publications retry a catalogue conflict and preserve both editions", async () => {
  const store = conditionalCatalogStore({ synchronizeInitialReads: 2 });
  const edition = date => ({
    date,
    actorName: `Actor ${date}`,
    vibeLabel: "氛围",
    previewThumbnails: [],
    access: "member",
  });

  await Promise.all([
    updateArchiveCatalog(store, edition("2026-09-20"), () => "2026-09-20T04:00:00.000Z"),
    updateArchiveCatalog(store, edition("2026-09-21"), () => "2026-09-21T04:00:00.000Z"),
  ]);

  const catalog = await store.get(ARCHIVE_CATALOG_KEY, { type: "json" });
  assert.deepEqual(
    archiveCatalogEditions(catalog).map(item => item.date),
    ["2026-09-21", "2026-09-20"],
  );
  assert.equal(store.stats().conflicts, 1);
});

test("exhausted catalogue conflicts fail without replacing the authoritative catalogue", async () => {
  const authoritative = {
    schemaVersion: 1,
    catalogVersion: 1,
    kind: "vibe-atlas-archive-catalog",
    editions: [{
      date: "2026-09-20",
      actorName: "Authoritative Actor",
      vibeLabel: "氛围",
      previewThumbnails: [],
      access: "member",
    }],
    updatedAt: "2026-09-20T04:00:00.000Z",
  };
  const store = conditionalCatalogStore({
    initial: authoritative,
    rejectAllWrites: true,
  });

  await assert.rejects(
    updateArchiveCatalog(store, {
      date: "2026-09-21",
      actorName: "Losing Actor",
      vibeLabel: "氛围",
      previewThumbnails: [],
      access: "member",
    }),
    /archive catalogue could not be updated safely/,
  );

  assert.equal(store.stats().conflicts, 8);
  assert.deepEqual(
    await store.get(ARCHIVE_CATALOG_KEY, { type: "json" }),
    authoritative,
  );
});

test("publication refuses to merge into invalid archive metadata", async () => {
  const store = memoryStore({
    [ARCHIVE_CATALOG_KEY]: {
      schemaVersion: 1,
      catalogVersion: 1,
      kind: "vibe-atlas-archive-catalog",
      editions: [{ date: "2026-09-20", actorName: "Incomplete" }],
    },
  });

  await assert.rejects(
    updateArchiveCatalog(store, {
      date: "2026-09-21",
      actorName: "Actor",
      vibeLabel: "氛围",
      previewThumbnails: [],
      access: "member",
    }),
    /archive catalogue is invalid/,
  );
});

test("archive policy distinguishes anonymous, free, active, billing-delay, and inactive access", () => {
  const base = { requestedDate: "2026-09-01", editions };
  assert.equal(archiveAccessDecision(base).reason, "sign_in");
  assert.equal(archiveAccessDecision({ ...base, session: { user: {} } }).reason, "upgrade");
  assert.equal(archiveAccessDecision({
    ...base,
    session: { user: {} },
    membership: { status: "active" },
  }).allowed, true);
  for (const status of ["past_due", "incomplete"]) {
    assert.equal(archiveAccessDecision({
      ...base,
      session: { user: {} },
      membership: { status },
    }).reason, "billing_delay");
  }
  for (const status of ["inactive", "cancelled"]) {
    assert.equal(archiveAccessDecision({
      ...base,
      session: { user: {} },
      membership: { status },
    }).reason, "upgrade");
  }
  assert.equal(archiveAccessDecision({
    requestedDate: "2026-09-12",
    editions,
  }).allowed, true);
});

test("locked previews omit full board, provider, and premium media fields", () => {
  const preview = publicArchiveEdition({
    date: "2026-09-01",
    actorName: "Actor",
    vibeLabel: "Vibe",
    displayResults: Array.from({ length: 9 }, (_, index) => ({
      thumbnail: `https://preview.test/${index}.jpg`,
      sourceUrl: `https://raw.test/${index}.jpg`,
      link: `https://provider.test/${index}`,
    })),
    rankedBatches: [{ provider: "private-provider", results: [] }],
    generationPrompt: "private prompt",
    publicRecord: {
      actorPath: "/vibe-atlas/actors/actor/",
      editionPath: "/vibe-atlas/editions/2026-09-01/actor/",
    },
  });
  assert.equal(preview.previewThumbnails.length, 3);
  assert.equal("displayResults" in preview, false);
  assert.equal("rankedBatches" in preview, false);
  assert.equal("generationPrompt" in preview, false);
  assert.equal(JSON.stringify(preview).includes("raw.test"), false);
  assert.deepEqual(preview.publicRecord, {
    actorPath: "/vibe-atlas/actors/actor/",
    editionPath: "/vibe-atlas/editions/2026-09-01/actor/",
  });
});

test("server projection and reader normalization share an all-or-nothing public-record contract", () => {
  const approved = {
    actorPath: "/vibe-atlas/actors/actor/",
    editionPath: "/vibe-atlas/editions/2026-09-01/actor/",
  };
  assert.deepEqual(publicArchiveRecord(approved), approved);

  for (const publicRecord of [
    { actorPath: approved.actorPath },
    { editionPath: approved.editionPath },
    { actorPath: "/admin/actors/actor", editionPath: approved.editionPath },
    { actorPath: approved.actorPath, editionPath: "https://example.test/edition" },
  ]) {
    assert.equal(publicArchiveRecord(publicRecord), undefined);
    assert.equal(publicArchiveEdition({
      date: "2026-09-01",
      actorName: "Actor",
      vibeLabel: "Vibe",
      publicRecord,
    }).publicRecord, undefined);
  }
});

function archivePayload(date) {
  return {
    version: "v11",
    date,
    actorId: `actor-${date}`,
    actorName: `Actor ${date}`,
    actorShortNameEn: "Actor",
    vibeEmoji: "✨",
    vibeLabel: "氛围",
    vibeLabelEn: "Vibe",
    vibeSubtitle: "Subtitle",
    vibeSubtitleEn: "Subtitle",
    rankedBatches: [{
      provider: "private-provider",
      results: Array.from({ length: 9 }, (_, index) => ({
        title: `Frame ${index}`,
        thumbnail: `https://preview.test/${date}/${index}.jpg`,
        link: `https://provider.test/${index}`,
        source: "publisher",
      })),
    }],
    displayResults: Array.from({ length: 9 }, (_, index) => ({
      title: `Frame ${index}`,
      thumbnail: `https://preview.test/${date}/${index}.jpg`,
      link: `https://provider.test/${index}`,
      source: "publisher",
    })),
  };
}

function memoryStore(entries) {
  const values = new Map(Object.entries(entries));
  let listCalls = 0;
  return {
    stats: () => ({ listCalls }),
    async get(key, options) {
      const value = values.get(key);
      return options?.type === "json" && value ? structuredClone(value) : value || null;
    },
    async list({ prefix } = {}) {
      listCalls += 1;
      return {
        blobs: [...values.keys()]
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
    async setJSON(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
  };
}

function conditionalCatalogStore({
  initial = null,
  synchronizeInitialReads = 0,
  rejectAllWrites = false,
} = {}) {
  let value = initial ? structuredClone(initial) : null;
  let revision = initial ? 1 : 0;
  let initialReads = 0;
  let releaseInitialReads;
  const initialReadBarrier = synchronizeInitialReads > 0
    ? new Promise(resolve => { releaseInitialReads = resolve; })
    : null;
  let conflicts = 0;

  return {
    stats: () => ({ conflicts }),
    async get(key, options) {
      if (key !== ARCHIVE_CATALOG_KEY) return null;
      return options?.type === "json" && value ? structuredClone(value) : value;
    },
    async getWithMetadata(key) {
      if (key !== ARCHIVE_CATALOG_KEY) return { data: null };
      const snapshot = {
        data: value ? structuredClone(value) : null,
        ...(revision ? { etag: `revision-${revision}` } : {}),
      };
      if (initialReadBarrier && initialReads < synchronizeInitialReads) {
        initialReads += 1;
        if (initialReads === synchronizeInitialReads) releaseInitialReads();
        await initialReadBarrier;
      }
      return snapshot;
    },
    async setJSON(key, next, options = {}) {
      assert.equal(key, ARCHIVE_CATALOG_KEY);
      const matches = options.onlyIfMatch
        ? options.onlyIfMatch === `revision-${revision}`
        : options.onlyIfNew
          ? value === null
          : true;
      if (rejectAllWrites || !matches) {
        conflicts += 1;
        return { modified: false };
      }
      value = structuredClone(next);
      revision += 1;
      return { modified: true, etag: `revision-${revision}` };
    },
  };
}

function endpointFixture({
  authResult = null,
  membershipStatus = "inactive",
  membershipProduct = null,
  env = {},
  rejectListings = false,
  rejectCatalogueReads = false,
  omitAccessWindow = false,
} = {}) {
  const dates = ["2026-09-20", "2026-09-18", "2026-09-17", "2026-09-12", "2026-09-01"];
  const publicationEntries = {
    ...Object.fromEntries(dates.map(date => [`starOfDay:v11:${date}`, archivePayload(date)])),
    "vibeAtlas:grid-manifest-catalog:v1:dates": {
      schemaVersion: 1,
      catalogVersion: "v1",
      kind: "vibe-atlas-publication-manifest-catalog",
      dates: Array.from({ length: 10000 }, (_, index) =>
        new Date(Date.UTC(1990, 0, index + 1)).toISOString().slice(0, 10)),
    },
    ...(omitAccessWindow ? {} : { [ARCHIVE_ACCESS_WINDOW_KEY]: {
      schemaVersion: 1,
      accessWindowVersion: 1,
      kind: "vibe-atlas-archive-access-window",
      freeArchiveDates: dates.slice(0, 4),
      updatedAt: "2026-09-20T00:00:00.000Z",
    } }),
  };
  const publication = memoryStore(publicationEntries);
  if (rejectCatalogueReads) {
    const get = publication.get;
    publication.get = async (key, options) => {
      if (String(key).includes("grid-manifest-catalog")) {
        throw new Error("protected archive access must not read the full catalogue");
      }
      return get(key, options);
    };
  }
  if (rejectListings) {
    publication.list = async () => {
      throw new Error("protected archive access must not list catalogue blobs");
    };
  }
  const eligibility = memoryStore({});
  const auth = {
    authenticate: async () => {
      if (authResult instanceof Error) throw authResult;
      if (!authResult) {
        const error = new Error("Sign in is required.");
        error.status = 401;
        throw error;
      }
      return authResult;
    },
  };
  const billing = {
    initialize: async () => {},
    repository: () => ({
      membershipForAccount: async () => ({
        status: membershipStatus,
        ...(membershipProduct ? { product: membershipProduct } : {}),
      }),
    }),
  };
  const handler = createStarOfDayHandler({
    env,
    auth,
    billing,
    getStore: name => name === "star-of-day" ? publication : eligibility,
    today: () => "2026-09-20",
  });
  handler.publicationStore = publication;
  return handler;
}

test("historical endpoint keeps free editions public and gates older direct URLs", async () => {
  const handler = endpointFixture({ omitAccessWindow: true });
  const free = await handler(new Request("https://example.test/star-of-day?date=2026-09-12"), {});
  assert.equal(free.status, 200);
  assert.equal(free.headers.get("cache-control"), "public, max-age=300");
  assert.equal((await free.json()).displayResults.length, 9);

  const locked = await handler(new Request("https://example.test/star-of-day?date=2026-09-01"), {});
  assert.equal(locked.status, 401);
  assert.equal(locked.headers.get("cache-control"), "no-store");
  const body = await locked.json();
  assert.equal(body.access, "sign_in");
  assert.equal(body.edition.previewThumbnails.length, 3);
  assert.equal("displayResults" in body, false);
  assert.equal(JSON.stringify(body).includes("private-provider"), false);
});

test("historical access uses the compact window without listing the catalogue", async () => {
  const handler = endpointFixture({ omitAccessWindow: true });
  const response = await endpointFixture({
    env: { FANDOM_ARCHIVE_GATE_ENABLED: "false" },
  })(new Request("https://example.test/star-of-day?date=2026-09-01"), {});
  assert.equal(response.status, 200);
});

test("a direct historical request backfills a missing compact window only once", async () => {
  const handler = endpointFixture({ omitAccessWindow: true });
  const first = await handler(
    new Request("https://example.test/star-of-day?date=2026-09-12"),
    {},
  );
  assert.equal(first.status, 200);
  assert.equal(handler.publicationStore.stats().listCalls, 2);
  const stored = await handler.publicationStore.get(ARCHIVE_ACCESS_WINDOW_KEY, { type: "json" });
  assert.deepEqual(stored.freeArchiveDates, [
    "2026-09-20",
    "2026-09-18",
    "2026-09-17",
    "2026-09-12",
  ]);

  const second = await handler(
    new Request("https://example.test/star-of-day?date=2026-09-12"),
    {},
  );
  assert.equal(second.status, 200);
  assert.equal(handler.publicationStore.stats().listCalls, 2);
});

test("historical endpoint treats stale sessions as signed out and separates active member caches", async () => {
  const stale = new Error("Sign in is required.");
  stale.status = 401;
  const staleResponse = await endpointFixture({ authResult: stale })(
    new Request("https://example.test/star-of-day?date=2026-09-01"),
    {},
  );
  assert.equal(staleResponse.status, 401);
  assert.equal((await staleResponse.json()).access, "sign_in");

  const memberResponse = await endpointFixture({
    authResult: { user: { accountId: "account-1" } },
    membershipStatus: "active",
    membershipProduct: "fandom_collector",
  })(new Request("https://example.test/star-of-day?date=2026-09-01"), {});
  assert.equal(memberResponse.status, 200);
  assert.equal(memberResponse.headers.get("cache-control"), "private, no-store");
  assert.equal(memberResponse.headers.get("vary"), "Cookie");
  assert.equal(memberResponse.headers.get("x-archive-access"), "active_member");
});

test("historical endpoint returns explicit inactive and temporary billing states", async () => {
  for (const [status, expectedAccess] of [
    ["inactive", "upgrade"],
    ["cancelled", "upgrade"],
    ["past_due", "billing_delay"],
  ]) {
    const response = await endpointFixture({
      authResult: { user: { accountId: "account-1" } },
      membershipStatus: status,
    })(new Request("https://example.test/star-of-day?date=2026-09-01"), {});
    assert.equal(response.status, 403);
    assert.equal((await response.json()).access, expectedAccess);
  }
});

test("archive enforcement can be disabled for controlled rollout validation", async () => {
  const response = await endpointFixture({
    env: { FANDOM_ARCHIVE_GATE_ENABLED: "false" },
  })(new Request("https://example.test/star-of-day?date=2026-09-01"), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-archive-access"), "free_window");
});
