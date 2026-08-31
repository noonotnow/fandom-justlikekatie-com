import test from "node:test";
import assert from "node:assert/strict";
import starOfDay, {
  buildPayloadForDate,
  cachedPairIsEligible,
} from "../star-of-day.js";
import {
  auditHeadKey,
  auditRunKey,
  auditVerdictKey,
  eligibilityKey,
  pairingFingerprintFor,
} from "./actor-eligibility.js";

function makeStore(entries = {}) {
  const values = new Map(Object.entries(entries));
  let listCalls = 0;
  let setCalls = 0;
  return {
    stats: () => ({ listCalls, setCalls }),
    async get(key, options) {
      const value = values.get(key);
      if (value === undefined) return null;
      return options?.type === "json" ? structuredClone(value) : value;
    },
    async list({ prefix } = {}) {
      listCalls += 1;
      return {
        blobs: [...values.keys()]
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
    async setJSON(key, value) {
      setCalls += 1;
      values.set(key, structuredClone(value));
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

function contextFor(store) {
  return { blobs: { getStore: () => store } };
}

function approvedEligibility(actor, vibeIdx) {
  const runId = `${actor.id}-${vibeIdx}-run`;
  const pairingFingerprint = pairingFingerprintFor(actor, vibeIdx);
  return {
    [eligibilityKey(actor.id, vibeIdx)]: {
      eligible: true,
      verdict: "approved",
      runId,
      profileVersion: 1,
      pairingFingerprint,
    },
    [auditHeadKey(actor.id, vibeIdx)]: { currentRunId: runId },
    [auditRunKey(actor.id, vibeIdx, runId)]: { runId, profileVersion: 1, pairingFingerprint },
    [auditVerdictKey(actor.id, vibeIdx, runId)]: { verdict: "approved" },
  };
}

function archivePayload(date, actorName = `Actor ${date}`) {
  return {
    version: "v6",
    date,
    actorName,
    actorShortNameEn: actorName,
    vibeEmoji: "✨",
    vibeLabel: "夜色",
    vibeLabelEn: "Night",
    vibeSubtitleEn: "A midnight assignment",
    rankedBatches: [{
      query: "archive query",
      results: [{ title: "Evidence", thumbnail: "https://images.test/evidence.jpg", link: "https://source.test", source: "Source" }],
      count: 1,
      distinctSources: 1,
      provider: "test",
    }],
  };
}

test("archive lists current and legacy payload dates with edition identity and excludes locks", async () => {
  const store = makeStore({
    "starOfDay:v6:2026-08-30": archivePayload("2026-08-30"),
    "starOfDay:v6:2026-08-29": archivePayload("2026-08-29"),
    "starOfDay:v6:2026-08-30:lock": { startedAt: Date.now() },
    "starOfDay:v5:2026-08-28": { ...archivePayload("2026-08-28"), version: "v5" },
    "starOfDay:v4:2026-08-27": { ...archivePayload("2026-08-27"), version: "v4" },
  });

  const response = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?archive=1" },
    contextFor(store),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.editions.map(edition => edition.date), [
    "2026-08-30",
    "2026-08-29",
    "2026-08-28",
  ]);
  assert.equal(body.editions[0].actorName, "Actor 2026-08-30");
});

test("historical date reads use the existing cache without starting a build", async () => {
  const archived = archivePayload("2026-08-29");
  const store = makeStore({ "starOfDay:v6:2026-08-29": archived });

  const response = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?date=2026-08-29" },
    contextFor(store),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), archived);
  assert.deepEqual(store.stats(), { listCalls: 0, setCalls: 0 });
});

test("historical date reads preserve legacy v5 editions after the curation upgrade", async () => {
  const archived = { ...archivePayload("2026-08-28"), version: "v5" };
  const store = makeStore({ "starOfDay:v5:2026-08-28": archived });

  const response = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?date=2026-08-28" },
    contextFor(store),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), archived);
  assert.deepEqual(store.stats(), { listCalls: 0, setCalls: 0 });
});

test("historical reads reject missing and future dates without touching cache locks", async () => {
  const store = makeStore();
  const missing = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?date=2026-08-29" },
    contextFor(store),
  );
  const future = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?date=2026-09-01" },
    contextFor(store),
  );

  assert.equal(missing.status, 404);
  assert.equal(future.status, 400);
  assert.deepEqual(store.stats(), { listCalls: 0, setCalls: 0 });
});

test("the builder skips a failed approved pairing and preserves the public 3x3 payload contract", async () => {
  const packs = [
    {
      id: "actor-a", name: "Actor A", shortName_en: "A", accentColor: "#111",
      vibes: [{ label: "A0", label_en: "A0", queries: ["fails"] }],
    },
    {
      id: "actor-b", name: "Actor B", shortName_en: "B", accentColor: "#222",
      vibes: [{ label: "B0", label_en: "B0", queries: ["works"] }],
    },
  ];
  const eligibilityStore = makeStore({
    ...approvedEligibility(packs[0], 0),
    ...approvedEligibility(packs[1], 0),
  });
  const attempted = [];
  const displayResults = Array.from({ length: 9 }, (_, index) => ({
    title: `Frame ${index + 1}`,
    thumbnail: `https://images.test/${index + 1}.jpg`,
  }));
  const payload = await buildPayloadForDate("2026-08-31", eligibilityStore, {
    packs,
    evaluate: async queries => {
      attempted.push(queries[0]);
      return queries[0] === "fails" ? [] : [{ query: "works", results: displayResults }];
    },
    rank: candidates => candidates,
    curate: async () => ({
      displayResults,
      curation: { mode: "compiled", version: 1, rationale: "Varied evidence.", signals: [] },
    }),
    generatedAt: () => "2026-08-31T12:00:00.000Z",
  });

  assert.deepEqual(attempted, ["fails", "works"]);
  assert.equal(payload.actorId, "actor-b");
  assert.equal(payload.displayResults.length, 9);
  assert.equal(payload.curation.mode, "compiled");
  assert.equal("identityProfile" in payload, false);
  assert.equal("audit" in payload, false);
  assert.equal("eligibility" in payload, false);
});

test("the builder does not search when no pairing has a current approval", async () => {
  let searches = 0;
  const payload = await buildPayloadForDate("2026-08-31", makeStore(), {
    packs: [{ id: "actor-a", vibes: [{ queries: ["query"] }] }],
    evaluate: async () => {
      searches += 1;
      return [];
    },
  });
  assert.equal(payload, null);
  assert.equal(searches, 0);
});

test("cached and fallback payloads stop qualifying when approval is revoked or inputs change", async () => {
  const actor = {
    id: "actor-a",
    vibes: [{ queries: ["approved query"] }],
  };
  const records = approvedEligibility(actor, 0);
  const store = makeStore(records);
  const payload = { actorId: actor.id, vibeIdx: 0, displayResults: Array(9).fill({}) };

  assert.equal(await cachedPairIsEligible(payload, store, [actor]), true);

  records[eligibilityKey(actor.id, 0)].eligible = false;
  assert.equal(await cachedPairIsEligible(payload, makeStore(records), [actor]), false);

  const changedActor = {
    ...actor,
    vibes: [{ queries: ["changed query"] }],
  };
  assert.equal(await cachedPairIsEligible(payload, store, [changedActor]), false);
});

test("an in-flight build is discarded when its pairing is revoked during curation", async () => {
  const actor = {
    id: "actor-a",
    name: "Actor A",
    vibes: [{ label: "Vibe", queries: ["query"] }],
  };
  const records = approvedEligibility(actor, 0);
  const store = makeStore(records);
  const displayResults = Array.from({ length: 9 }, (_, index) => ({
    title: `Frame ${index}`,
    thumbnail: `https://images.test/${index}.jpg`,
  }));
  const payload = await buildPayloadForDate("2026-08-31", store, {
    packs: [actor],
    evaluate: async () => [{ query: "query", results: displayResults }],
    rank: candidates => candidates,
    curate: async () => {
      await store.setJSON(eligibilityKey(actor.id, 0), {
        ...records[eligibilityKey(actor.id, 0)],
        eligible: false,
      });
      return { displayResults, curation: { mode: "compiled" } };
    },
  });

  assert.equal(payload, null);
});