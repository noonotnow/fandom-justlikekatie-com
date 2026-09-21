import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_ACCESS_WINDOW_KEY,
  ARCHIVE_CATALOG_KEY,
  ARCHIVE_CATALOG_EDITION_PREFIX,
  ARCHIVE_FREE_EDITION_COUNT,
  ARCHIVE_SAFE_UPDATE_UNAVAILABLE,
  archiveAccessDecision,
  archiveAccessWindowDates,
  archiveReaderLinkDiagnostic,
  ensureArchiveAccessWindow,
  freeArchiveDates,
  listArchiveCatalogEditions,
  publicArchiveEdition,
  reconcileArchiveCatalogIndexes,
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

test("simultaneous access-window updates retry a conflict and preserve the four newest dates", async () => {
  const store = conditionalAccessWindowStore({
    initial: archiveAccessWindow([
      "2026-09-19",
      "2026-09-18",
      "2026-09-17",
      "2026-09-16",
    ]),
    synchronizeInitialReads: 2,
  });

  await Promise.all([
    ensureArchiveAccessWindow(store, ["2026-09-20"], () => "2026-09-20T04:00:00.000Z"),
    ensureArchiveAccessWindow(store, ["2026-09-21"], () => "2026-09-21T04:00:00.000Z"),
  ]);

  const window = await store.get(ARCHIVE_ACCESS_WINDOW_KEY, { type: "json" });
  assert.deepEqual(window.freeArchiveDates, [
    "2026-09-21",
    "2026-09-20",
    "2026-09-19",
    "2026-09-18",
  ]);
  assert.equal(store.stats().conflicts, 1);
});

test("simultaneous initial access-window updates retry only-if-new and preserve the four newest dates", async () => {
  const store = conditionalAccessWindowStore({
    synchronizeInitialReads: 2,
  });

  await Promise.all([
    ensureArchiveAccessWindow(
      store,
      ["2026-09-20", "2026-09-18", "2026-09-17", "2026-09-16"],
      () => "2026-09-20T04:00:00.000Z",
    ),
    ensureArchiveAccessWindow(
      store,
      ["2026-09-21", "2026-09-19", "2026-09-15", "2026-09-14"],
      () => "2026-09-21T04:00:00.000Z",
    ),
  ]);

  const window = await store.get(ARCHIVE_ACCESS_WINDOW_KEY, { type: "json" });
  assert.deepEqual(window.freeArchiveDates, [
    "2026-09-21",
    "2026-09-20",
    "2026-09-19",
    "2026-09-18",
  ]);
  assert.equal(window.freeArchiveDates.length, ARCHIVE_FREE_EDITION_COUNT);
  assert.deepEqual(store.stats(), {
    conflicts: 1,
    onlyIfNewConflicts: 1,
  });
});

test("simultaneous access-window updates without revision tags fail before replacing the authoritative window", async () => {
  const authoritative = archiveAccessWindow([
    "2026-09-19",
    "2026-09-18",
    "2026-09-17",
    "2026-09-16",
  ]);
  const store = conditionalAccessWindowStore({
    initial: authoritative,
    synchronizeInitialReads: 2,
    omitEtags: true,
  });

  const results = await Promise.allSettled([
    ensureArchiveAccessWindow(store, ["2026-09-20"], () => "2026-09-20T04:00:00.000Z"),
    ensureArchiveAccessWindow(store, ["2026-09-21"], () => "2026-09-21T04:00:00.000Z"),
  ]);

  assert.ok(results.every(result =>
    result.status === "rejected"
    && /storage did not provide a revision tag/.test(result.reason.message)));
  assert.deepEqual(
    await store.get(ARCHIVE_ACCESS_WINDOW_KEY, { type: "json" }),
    authoritative,
  );
  assert.deepEqual(store.stats(), {
    conflicts: 0,
    onlyIfNewConflicts: 0,
  });
});

test("exhausted access-window conflicts fail without replacing the authoritative window", async () => {
  const authoritative = archiveAccessWindow([
    "2026-09-20",
    "2026-09-19",
    "2026-09-18",
    "2026-09-17",
  ]);
  const store = conditionalAccessWindowStore({
    initial: authoritative,
    rejectAllWrites: true,
  });

  await assert.rejects(
    ensureArchiveAccessWindow(store, ["2026-09-21"]),
    /archive access window could not be updated safely/,
  );

  assert.equal(store.stats().conflicts, 8);
  assert.deepEqual(
    await store.get(ARCHIVE_ACCESS_WINDOW_KEY, { type: "json" }),
    authoritative,
  );
});

test("publication writes only the current edition and lists metadata newest-first", async () => {
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

  assert.deepEqual(
    (await listArchiveCatalogEditions(store)).map(item => [item.date, item.actorName]),
    [
      ["2026-09-20", "Actor 2026-09-20"],
      ["2026-09-18", "Corrected Actor"],
    ],
  );
  assert.deepEqual(store.stats().writtenKeys.filter(key =>
    key.startsWith(ARCHIVE_CATALOG_EDITION_PREFIX)), [
    `${ARCHIVE_CATALOG_EDITION_PREFIX}2026-09-18`,
    `${ARCHIVE_CATALOG_EDITION_PREFIX}2026-09-20`,
    `${ARCHIVE_CATALOG_EDITION_PREFIX}2026-09-18`,
  ]);
  assert.equal(await store.get(ARCHIVE_CATALOG_KEY, { type: "json" }), null);
});

test("archive writes accept valid public reader links and reject malformed paths before storage", async () => {
  const validBase = {
    date: "2026-09-20",
    actorName: "Actor",
    vibeLabel: "氛围",
    previewThumbnails: [],
    access: "member",
  };
  for (const [date, editionPath] of [
    ["2026-09-20", "/vibe-atlas/editions/2026-09-20/"],
    ["2026-09-21", "/vibe-atlas/editions/2026-09-21/actor/"],
  ]) {
    const store = memoryStore({});
    await updateArchiveCatalog(store, {
      ...validBase,
      date,
      publicRecord: {
        actorPath: "/vibe-atlas/actors/actor/",
        editionPath,
      },
    });
    assert.equal(
      (await store.get(`${ARCHIVE_CATALOG_EDITION_PREFIX}${date}`, { type: "json" }))
        .publicRecord.editionPath,
      editionPath,
    );
  }

  for (const [publicRecord, message] of [
    [{
      actorPath: "/admin/actors/actor",
      editionPath: "/vibe-atlas/editions/2026-09-20/actor/",
    }, /actorPath must match/],
    [{
      actorPath: "/vibe-atlas/actors/actor/",
      editionPath: "/vibe-atlas/editions/not-a-date/actor/",
    }, /editionPath must match/],
    [{
      actorPath: "/vibe-atlas/actors/actor/",
      editionPath: "/vibe-atlas/editions/2026-09-20/other/",
    }, /editionPath actor must match/],
    [{
      actorPath: "/vibe-atlas/actors/other/",
      editionPath: "/vibe-atlas/editions/2026-09-19/other/",
    }, /editionPath date must match/],
    [{
      actorPath: "/vibe-atlas/actors/other/",
      editionPath: "/vibe-atlas/editions/2026-09-20/other/",
    }, /actorPath actor must match/],
    [null, /must include valid actorPath and editionPath/],
  ]) {
    const store = memoryStore({});
    await assert.rejects(
      updateArchiveCatalog(store, { ...validBase, publicRecord }),
      message,
    );
    assert.deepEqual(store.stats().writtenKeys, []);
  }
});

test("simultaneous publications use independent keys and preserve both editions", async () => {
  const store = memoryStore({});
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

  assert.deepEqual(
    (await listArchiveCatalogEditions(store)).map(item => item.date),
    ["2026-09-21", "2026-09-20"],
  );
});

test("same-edition updates without revision tags signal lost safe-update support and preserve authoritative metadata", async t => {
  const authoritative = {
    date: "2026-09-20",
    actorName: "Authoritative Actor",
    vibeLabel: "氛围",
    previewThumbnails: [],
    access: "member",
  };
  const store = conditionalCatalogStore({
    date: authoritative.date,
    initial: authoritative,
    synchronizeInitialReads: 2,
    omitEtags: true,
  });
  const signals = [];
  t.mock.method(console, "error", (...args) => signals.push(args));

  const results = await Promise.allSettled([
    updateArchiveCatalog(store, { ...authoritative, actorName: "First Actor" }),
    updateArchiveCatalog(store, { ...authoritative, actorName: "Second Actor" }),
  ]);

  assert.ok(results.every(result =>
    result.status === "rejected"
    && result.reason.code === ARCHIVE_SAFE_UPDATE_UNAVAILABLE
    && /storage did not provide a revision tag/.test(result.reason.message)));
  assert.deepEqual(signals, [
    [
      "[archive-publication] safe-update support unavailable",
      {
        code: ARCHIVE_SAFE_UPDATE_UNAVAILABLE,
        resource: "archive catalogue edition",
        key: `${ARCHIVE_CATALOG_EDITION_PREFIX}${authoritative.date}`,
      },
    ],
    [
      "[archive-publication] safe-update support unavailable",
      {
        code: ARCHIVE_SAFE_UPDATE_UNAVAILABLE,
        resource: "archive catalogue edition",
        key: `${ARCHIVE_CATALOG_EDITION_PREFIX}${authoritative.date}`,
      },
    ],
  ]);
  assert.deepEqual(
    await store.get(
      `${ARCHIVE_CATALOG_EDITION_PREFIX}${authoritative.date}`,
      { type: "json" },
    ),
    authoritative,
  );
  assert.deepEqual(store.stats(), {
    conflicts: 0,
    onlyIfNewConflicts: 0,
  });
});

test("exhausted same-edition conflicts preserve the authoritative metadata", async () => {
  const authoritative = {
    date: "2026-09-20",
    actorName: "Authoritative Actor",
    vibeLabel: "氛围",
    previewThumbnails: [],
    access: "member",
  };
  const store = conditionalCatalogStore({
    date: authoritative.date,
    initial: authoritative,
    rejectAllWrites: true,
  });

  await assert.rejects(
    updateArchiveCatalog(store, {
      date: "2026-09-20",
      actorName: "Losing Actor",
      vibeLabel: "氛围",
      previewThumbnails: [],
      access: "member",
    }),
    /archive catalogue edition could not be updated safely/,
  );

  assert.equal(store.stats().conflicts, 8);
  assert.deepEqual(
    await store.get(`${ARCHIVE_CATALOG_EDITION_PREFIX}${authoritative.date}`, { type: "json" }),
    authoritative,
  );
});

test("publication refuses to replace invalid per-edition metadata", async () => {
  const store = memoryStore({
    [`${ARCHIVE_CATALOG_EDITION_PREFIX}2026-09-20`]:
      { date: "2026-09-20", actorName: "Incomplete" },
  });

  await assert.rejects(
    updateArchiveCatalog(store, {
      date: "2026-09-20",
      actorName: "Actor",
      vibeLabel: "氛围",
      previewThumbnails: [],
      access: "member",
    }),
    /archive catalogue edition is invalid/,
  );
});

test("reconciliation repairs verified editions missing from bounded indexes", async () => {
  const hidden = {
    date: "2026-09-19",
    actorName: "Hidden Actor",
    vibeLabel: "氛围",
    previewThumbnails: [],
    access: "member",
  };
  const store = memoryStore({
    [`${ARCHIVE_CATALOG_EDITION_PREFIX}${hidden.date}`]: hidden,
  });

  const first = await reconcileArchiveCatalogIndexes(store, {
    throughDate: "2026-09-19",
    limit: 1,
  });
  assert.deepEqual(first, {
    scanned: 1,
    verified: 1,
    missingDates: ["2026-09-19"],
    repaired: 1,
    nextCursor: "2026-09-18",
  });
  assert.deepEqual(
    (await listArchiveCatalogEditions(store)).map(edition => edition.date),
    ["2026-09-19"],
  );
  const repeated = await reconcileArchiveCatalogIndexes(store, {
    throughDate: "2026-09-19",
    limit: 1,
  });
  assert.equal(repeated.repaired, 0);
  assert.deepEqual(repeated.missingDates, []);
});

test("reconciliation validates the whole bounded batch before indexing any edition", async () => {
  const store = memoryStore({
    [`${ARCHIVE_CATALOG_EDITION_PREFIX}2026-09-20`]: {
      date: "2026-09-20",
      actorName: "Valid Actor",
      vibeLabel: "氛围",
    },
    [`${ARCHIVE_CATALOG_EDITION_PREFIX}2026-09-19`]: {
      date: "2026-09-18",
      actorName: "Wrong Date",
      vibeLabel: "氛围",
    },
  });

  await assert.rejects(
    reconcileArchiveCatalogIndexes(store, {
      throughDate: "2026-09-20",
      limit: 2,
    }),
    /archive catalogue edition is invalid/,
  );
  assert.deepEqual(await listArchiveCatalogEditions(store), []);
});

test("concurrent reconciliation and publication preserve newest-first indexes", async () => {
  const store = memoryStore({
    [`${ARCHIVE_CATALOG_EDITION_PREFIX}2026-09-20`]: {
      date: "2026-09-20",
      actorName: "Existing Actor",
      vibeLabel: "氛围",
    },
  });
  await Promise.all([
    reconcileArchiveCatalogIndexes(store, {
      throughDate: "2026-09-20",
      limit: 1,
    }),
    updateArchiveCatalog(store, {
      date: "2026-09-21",
      actorName: "New Actor",
      vibeLabel: "氛围",
    }),
  ]);
  assert.deepEqual(
    (await listArchiveCatalogEditions(store)).map(edition => edition.date),
    ["2026-09-21", "2026-09-20"],
  );
});

test("reconciliation resumes across bounded calendar windows and terminates at the schema boundary", async () => {
  const edition = date => ({
    date,
    actorName: `Actor ${date}`,
    vibeLabel: "氛围",
  });
  const store = memoryStore({
    [`${ARCHIVE_CATALOG_EDITION_PREFIX}2026-01-05`]: edition("2026-01-05"),
    [`${ARCHIVE_CATALOG_EDITION_PREFIX}2026-01-02`]: edition("2026-01-02"),
  });

  const first = await reconcileArchiveCatalogIndexes(store, {
    throughDate: "2026-01-06",
    limit: 3,
  });
  assert.equal(first.scanned, 3);
  assert.equal(first.nextCursor, "2026-01-03");
  assert.deepEqual(first.missingDates, ["2026-01-05"]);

  const second = await reconcileArchiveCatalogIndexes(store, {
    throughDate: "2026-01-06",
    cursor: first.nextCursor,
    limit: 3,
  });
  assert.equal(second.scanned, 3);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(second.missingDates, ["2026-01-02"]);
  assert.deepEqual(
    (await listArchiveCatalogEditions(store)).map(item => item.date),
    ["2026-01-05", "2026-01-02"],
  );
  assert.equal(store.stats().listCalls, 0);
});

test("reconciliation coalesces more than eight same-year repairs into one bucket update", async () => {
  const dates = Array.from({ length: 20 }, (_, index) =>
    `2026-01-${String(index + 1).padStart(2, "0")}`);
  const store = memoryStore(Object.fromEntries(dates.map(date => [
    `${ARCHIVE_CATALOG_EDITION_PREFIX}${date}`,
    { date, actorName: `Actor ${date}`, vibeLabel: "氛围" },
  ])));

  const result = await reconcileArchiveCatalogIndexes(store, {
    throughDate: "2026-01-20",
    limit: 20,
  });
  assert.equal(result.repaired, 20);
  assert.equal(result.nextCursor, null);
  assert.equal(store.stats().writtenKeys.filter(key =>
    key === "vibeAtlas:archive-catalog:v2:year:2026").length, 1);
  assert.deepEqual(
    (await listArchiveCatalogEditions(store)).map(item => item.date),
    [...dates].reverse(),
  );
});

test("the operator repair endpoint requires admin access and reports repaired dates", async () => {
  const hidden = {
    date: "2026-09-19",
    actorName: "Hidden Actor",
    vibeLabel: "氛围",
  };
  const publication = memoryStore({
    [`${ARCHIVE_CATALOG_EDITION_PREFIX}${hidden.date}`]: hidden,
  });
  let adminChecks = 0;
  const handler = createStarOfDayHandler({
    auth: {
      authenticateAdmin: async () => {
        adminChecks += 1;
        return { user: { accountId: "admin-1" } };
      },
    },
    getStore: () => publication,
    today: () => "2026-09-20",
  });

  const response = await handler(
    new Request("https://example.test/star-of-day?archiveRepair=1"),
    {},
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(adminChecks, 1);
  const reconciliation = (await response.json()).reconciliation;
  assert.equal(reconciliation.scanned, 100);
  assert.equal(reconciliation.verified, 1);
  assert.deepEqual(reconciliation.missingDates, ["2026-09-19"]);
  assert.equal(reconciliation.repaired, 1);
  assert.match(reconciliation.nextCursor, /^\d{4}-\d{2}-\d{2}$/);
});

test("the operator repair endpoint fails closed when admin authentication fails", async () => {
  const error = new Error("Admin access is required.");
  error.status = 403;
  const handler = createStarOfDayHandler({
    auth: { authenticateAdmin: async () => { throw error; } },
    getStore: () => memoryStore({}),
    today: () => "2026-09-20",
  });
  const response = await handler(
    new Request("https://example.test/star-of-day?archiveRepair=1"),
    {},
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Admin access is required.",
  });
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
  const approvedRecords = [
    {
      actorPath: "/vibe-atlas/actors/actor",
      editionPath: "/vibe-atlas/editions/2026-09-01",
    },
    {
      actorPath: "/vibe-atlas/actors/actor/",
      editionPath: "/vibe-atlas/editions/2026-09-01/",
    },
    {
      actorPath: "/vibe-atlas/actors/actor",
      editionPath: "/vibe-atlas/editions/2026-09-01/actor",
    },
    {
      actorPath: "/vibe-atlas/actors/actor/",
      editionPath: "/vibe-atlas/editions/2026-09-01/actor/",
    },
  ];
  for (const approved of approvedRecords) {
    assert.deepEqual(publicArchiveRecord(approved), approved);
  }

  const approved = approvedRecords[1];
  for (const publicRecord of [
    { actorPath: approved.actorPath },
    { editionPath: approved.editionPath },
    { actorPath: "/admin/actors/actor", editionPath: approved.editionPath },
    { actorPath: approved.actorPath, editionPath: "https://example.test/edition" },
    { actorPath: "/vibe-atlas/actors/", editionPath: approved.editionPath },
    { actorPath: "/vibe-atlas/actors//actor", editionPath: approved.editionPath },
    { actorPath: "/vibe-atlas/actors/../admin", editionPath: approved.editionPath },
    { actorPath: "/vibe-atlas/actors/actor?preview=1", editionPath: approved.editionPath },
    { actorPath: "/vibe-atlas/actors/actor#preview", editionPath: approved.editionPath },
    { actorPath: approved.actorPath, editionPath: "/vibe-atlas/editions/" },
    { actorPath: approved.actorPath, editionPath: "/vibe-atlas/editions/2026-09-01/other-actor" },
    { actorPath: approved.actorPath, editionPath: "/vibe-atlas/editions//2026-09-01" },
    { actorPath: approved.actorPath, editionPath: "/vibe-atlas/editions/../actors/actor" },
    { actorPath: approved.actorPath, editionPath: "/vibe-atlas/editions/2026-09-01/other-actor" },
    { actorPath: approved.actorPath, editionPath: "/vibe-atlas/editions/2026-02-29/actor" },
    { actorPath: approved.actorPath, editionPath: "/vibe-atlas/editions/9999-99-99/actor" },
    { actorPath: approved.actorPath, editionPath: "/vibe-atlas/editions/2026-09-01/actor?preview=1" },
    { actorPath: approved.actorPath, editionPath: "/vibe-atlas/editions/2026-09-01/actor#preview" },
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

test("operator reader-link diagnostics distinguish missing, actor, and edition metadata failures", () => {
  assert.deepEqual(archiveReaderLinkDiagnostic({
    publicRecord: {
      actorPath: "/vibe-atlas/actors/actor/",
      editionPath: "/vibe-atlas/editions/2026-09-01/actor/",
    },
  }), { status: "valid" });
  assert.deepEqual(archiveReaderLinkDiagnostic({}), { status: "missing_metadata" });
  assert.deepEqual(archiveReaderLinkDiagnostic({
    publicRecord: {
      actorPath: "/admin/actors/actor",
      editionPath: "/vibe-atlas/editions/2026-09-01/actor/",
    },
  }), { status: "malformed_actor_path" });
  assert.deepEqual(archiveReaderLinkDiagnostic({
    publicRecord: {
      actorPath: "/vibe-atlas/actors/actor/",
      editionPath: "javascript:alert(1)",
    },
  }), { status: "malformed_edition_path" });
  assert.deepEqual(archiveReaderLinkDiagnostic({
    publicRecord: {
      actorPath: "/vibe-atlas/actors/actor/",
      editionPath: "/vibe-atlas/editions/2026-09-01/other-actor/",
    },
  }), { status: "malformed_edition_path" });
  assert.equal(
    JSON.stringify(archiveReaderLinkDiagnostic({
      publicRecord: {
        actorPath: "javascript:alert(1)",
        editionPath: "https://unsafe.example/edition",
      },
    })).includes("javascript:"),
    false,
  );
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
  const revisions = new Map([...values.keys()].map(key => [key, 1]));
  let listCalls = 0;
  const writtenKeys = [];
  return {
    stats: () => ({ listCalls, writtenKeys }),
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
    async getWithMetadata(key, options) {
      const value = values.get(key);
      return {
        data: options?.type === "json" && value ? structuredClone(value) : value || null,
        ...(value ? { etag: `revision-${revisions.get(key)}` } : {}),
      };
    },
    async setJSON(key, value, options = {}) {
      const revision = revisions.get(key) || 0;
      if (options.onlyIfNew && values.has(key)) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== `revision-${revision}`) {
        return { modified: false };
      }
      values.set(key, structuredClone(value));
      revisions.set(key, revision + 1);
      writtenKeys.push(key);
      return { modified: true, etag: `revision-${revision + 1}` };
    },
    async delete(key) { values.delete(key); },
  };
}

function archiveAccessWindow(freeArchiveDates) {
  return {
    schemaVersion: 1,
    accessWindowVersion: 1,
    kind: "vibe-atlas-archive-access-window",
    freeArchiveDates,
    updatedAt: "2026-09-19T04:00:00.000Z",
  };
}

function conditionalAccessWindowStore(options = {}) {
  return conditionalRevisionStore(ARCHIVE_ACCESS_WINDOW_KEY, options);
}

function conditionalCatalogStore({
  date,
  initial = null,
  synchronizeInitialReads = 0,
  rejectAllWrites = false,
  omitEtags = false,
} = {}) {
  return conditionalRevisionStore(`${ARCHIVE_CATALOG_EDITION_PREFIX}${date}`, {
    initial,
    synchronizeInitialReads,
    rejectAllWrites,
    omitEtags,
  });
}

function conditionalRevisionStore(key, {
  initial = null,
  synchronizeInitialReads = 0,
  rejectAllWrites = false,
  omitEtags = false,
} = {}) {
  let value = initial ? structuredClone(initial) : null;
  let revision = initial ? 1 : 0;
  let initialReads = 0;
  let releaseInitialReads;
  const initialReadBarrier = synchronizeInitialReads > 0
    ? new Promise(resolve => { releaseInitialReads = resolve; })
    : null;
  let conflicts = 0;
  let onlyIfNewConflicts = 0;

  return {
    stats: () => ({ conflicts, onlyIfNewConflicts }),
    async get(requestedKey, options) {
      if (requestedKey !== key) return null;
      return options?.type === "json" && value ? structuredClone(value) : value;
    },
    async getWithMetadata(requestedKey) {
      if (requestedKey !== key) return { data: null };
      const snapshot = {
        data: value ? structuredClone(value) : null,
        ...(revision && !omitEtags ? { etag: `revision-${revision}` } : {}),
      };
      if (initialReadBarrier && initialReads < synchronizeInitialReads) {
        initialReads += 1;
        if (initialReads === synchronizeInitialReads) releaseInitialReads();
        await initialReadBarrier;
      }
      return snapshot;
    },
    async setJSON(requestedKey, next, options = {}) {
      assert.equal(requestedKey, key);
      const matches = options.onlyIfMatch
        ? options.onlyIfMatch === `revision-${revision}`
        : options.onlyIfNew
          ? value === null
          : true;
      if (rejectAllWrites || !matches) {
        conflicts += 1;
        if (options.onlyIfNew) onlyIfNewConflicts += 1;
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
