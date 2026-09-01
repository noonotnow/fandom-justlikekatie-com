import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import starOfDay, {
  buildPayloadForDate,
  cachedPairIsEligible,
  hasReleaseReadyCohort,
  RELEASE_COHORT_ACTOR_ID,
} from "../star-of-day.js";
import {
  auditHeadKey,
  auditCalibrationKey,
  auditRescueBoardKey,
  auditRunKey,
  auditVerdictKey,
  eligibilityKey,
  pairingFingerprintFor,
} from "./actor-eligibility.js";
import {
  AESTHETIC_CLUSTER_VERSION,
  IDENTITY_PROFILE_VERSION,
  VIBE_PROMISE_CONTRACT_VERSION,
} from "./actor-identity-profiles.js";
import { CURATION_VERSION } from "./grid-curation.js";

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

function approvedEligibility(actor, vibeIdx, verdict = "approved") {
  const runId = `${actor.id}-${vibeIdx}-run`;
  const pairingFingerprint = pairingFingerprintFor(actor, vibeIdx);
  const actorId = actor.id;
  const vibeKey = `${actorId}:${vibeIdx}`;
  const candidates = Array.from({ length: 9 }, (_, index) => ({
    thumbnail: `https://images.test/${actorId}-${vibeIdx}-${index}.jpg`,
    title: `Frame ${index}`,
    source: `source-${index}.test`,
    batchRank: index,
  }));
  const eventBoard = boardSnapshot({ candidates }, "event");
  const compiledBoard = boardSnapshot({ candidates: [...candidates].reverse() }, "compiled");
  const presentationOrder = ["event", "compiled"];
  const chosenAt = "2026-08-31T12:00:00.000Z";
  const decidedAt = "2026-08-31T12:01:00.000Z";
  const calibration = {
    schemaVersion: 1,
    runId,
    actorId,
    vibeKey,
    presentationOrder,
    choice: "compiled",
    chosenAt,
    chosenBy: "operator-1",
    systemWinner: "compiled",
    agreement: true,
    experiment: {
      auditRunId: runId,
      curationVersion: CURATION_VERSION,
      identityProfileVersion: IDENTITY_PROFILE_VERSION,
      aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
      promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
      eventBoard,
      compiledBoard,
    },
  };
  const finalCalibration = {
    schemaVersion: 1,
    auditRunId: runId,
    actorId,
    vibeKey,
    eventBoard,
    compiledBoard,
    presentationOrder,
    curationVersion: CURATION_VERSION,
    identityProfileVersion: IDENTITY_PROFILE_VERSION,
    aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
    promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
    humanChoice: "compiled",
    humanChoiceAt: chosenAt,
    humanChoiceBy: "operator-1",
    systemWinner: "compiled",
    agreement: true,
    reasonCodes: [],
    disagreementNote: "",
    disagreementAnnotatedAt: null,
    disagreementAnnotatedBy: null,
    finalSchedulingVerdict: verdict,
    finalSchedulingNotes: "Approved fixture.",
    vibeConfirmed: verdict === "approved",
    publishableConfirmed: verdict === "approved",
    finalSchedulingAt: decidedAt,
    finalSchedulingBy: "operator-1",
  };
  return {
    [eligibilityKey(actorId, vibeIdx)]: {
      eligible: true,
      verdict,
      vibeConfirmed: verdict === "approved",
      publishableConfirmed: verdict === "approved",
      runId,
      profileVersion: IDENTITY_PROFILE_VERSION,
      identityProfileVersion: IDENTITY_PROFILE_VERSION,
      aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
      promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
      curationVersion: CURATION_VERSION,
      pairingFingerprint,
      calibrationVersion: 1,
      calibrationHash: recordHash(finalCalibration),
    },
    [auditHeadKey(actorId, vibeIdx)]: { currentRunId: runId },
    [auditRunKey(actorId, vibeIdx, runId)]: {
      runId,
      profileVersion: IDENTITY_PROFILE_VERSION,
      identityProfileVersion: IDENTITY_PROFILE_VERSION,
      aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
      promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
      pairingFingerprint,
      strongestEvent: { candidates },
      strongestCompiled: { candidates: [...candidates].reverse() },
      winner: { mode: "compiled" },
      curationReceipt: { curationVersion: CURATION_VERSION },
    },
    [auditVerdictKey(actorId, vibeIdx, runId)]: {
      verdict,
      notes: "Approved fixture.",
      vibeConfirmed: verdict === "approved",
      publishableConfirmed: verdict === "approved",
      decidedAt,
      decidedBy: "operator-1",
      calibration: finalCalibration,
    },
    [auditCalibrationKey(actorId, vibeIdx, runId)]: calibration,
  };
}

function operatorBoardEligibility(actor, vibeIdx) {
  const entries = approvedEligibility(actor, vibeIdx);
  const actorId = actor.id;
  const runId = `${actorId}-${vibeIdx}-run`;
  const vibeKey = `${actorId}:${vibeIdx}`;
  const candidates = Array.from({ length: 9 }, (_, index) => ({
    candidateId: `${actorId}-${vibeIdx}-manual-${index}`,
    query: `manual query ${index}`,
    thumbnail: `https://images.test/${actorId}-${vibeIdx}-manual-${index}.jpg`,
    title: `Manual frame ${index}`,
    source: `manual-${index}.test`,
    batchRank: index,
  }));
  const receiptId = `${actorId}-${vibeIdx}-rescue`;
  const board = { mode: "operator_rescue", candidates };
  const publicationSource = {
    type: "operator_rescue",
    rescueReceiptId: receiptId,
    boardHash: boardSnapshot(board, "operator_rescue").boardHash,
    feedbackHash: "feedback-hash",
  };
  entries[eligibilityKey(actorId, vibeIdx)].publicationSource = publicationSource;
  entries[auditRunKey(actorId, vibeIdx, runId)].strongestEvent = null;
  entries[auditRunKey(actorId, vibeIdx, runId)].strongestCompiled = null;
  entries[auditRunKey(actorId, vibeIdx, runId)].winner = null;
  entries[auditVerdictKey(actorId, vibeIdx, runId)].publicationSource = publicationSource;
  entries[auditVerdictKey(actorId, vibeIdx, runId)].calibration = null;
  delete entries[auditCalibrationKey(actorId, vibeIdx, runId)];
  entries[auditRescueBoardKey(actorId, vibeIdx, runId, receiptId)] = {
    receiptId,
    runId,
    actorId,
    vibeKey,
    feedbackHash: "feedback-hash",
    board,
  };
  return entries;
}

function boardSnapshot(board, mode) {
  const boardHash = createHash("sha256").update(JSON.stringify(
    board.candidates.map(candidate => ({
      thumbnail: candidate.thumbnail || "",
      title: candidate.title || "",
      source: candidate.source || "",
      batchRank: candidate.batchRank ?? null,
    })),
  )).digest("hex");
  return { mode, boardId: `${mode}-${boardHash.slice(0, 16)}`, boardHash };
}

function recordHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
    vibeSupportingCopyEn: "A supporting archive line",
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
    { method: "GET", url: "https://example.test/star-of-day?date=2099-01-01" },
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
  assert.equal(await hasReleaseReadyCohort(packs, eligibilityStore), true);
  assert.equal(await hasReleaseReadyCohort(packs, eligibilityStore, 2, packs[0].id), false);
  const attempted = [];
  const displayResults = Array.from({ length: 9 }, (_, index) => ({
    title: `Frame ${index}`,
    thumbnail: `https://images.test/${index}.jpg`,
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

test("the builder publishes the exact human-approved retained-evidence board without searching", async () => {
  const packs = [
    {
      id: "actor-a", name: "Actor A", shortName_en: "A", accentColor: "#111",
      vibes: [{ label: "A0", label_en: "A0", queries: ["unused-a"] }],
    },
    {
      id: "actor-b", name: "Actor B", shortName_en: "B", accentColor: "#222",
      vibes: [{ label: "B0", label_en: "B0", queries: ["unused-b"] }],
    },
  ];
  const eligibilityStore = makeStore({
    ...operatorBoardEligibility(packs[0], 0),
    ...operatorBoardEligibility(packs[1], 0),
  });
  let searches = 0;
  const payload = await buildPayloadForDate("2026-09-01", eligibilityStore, {
    packs,
    evaluate: async () => {
      searches += 1;
      return [];
    },
    generatedAt: () => "2026-09-01T12:00:00.000Z",
  });

  assert.equal(searches, 0);
  assert.equal(payload.displayResults.length, 9);
  assert.equal("curation" in payload, false);
  assert.equal(JSON.stringify(payload).includes("0/9"), false);
  assert.equal(JSON.stringify(payload).includes("coreCount"), false);
  assert.equal(JSON.stringify(payload).includes("boardHash"), false);
  assert.equal(payload.rankedBatches[0].query, "editorial-board");
  assert.ok(payload.displayResults.every(candidate =>
    candidate.thumbnail.includes(`${payload.actorId}-0-manual-`)));
  assert.ok(payload.displayResults.every(candidate => !("candidateId" in candidate)));
});

test("a changed retained-evidence receipt fails closed after human approval", async () => {
  const actor = {
    id: "actor-a", name: "Actor A", shortName_en: "A",
    vibes: [{ label: "A0", label_en: "A0", queries: ["unused"] }],
  };
  const entries = operatorBoardEligibility(actor, 0);
  const runId = `${actor.id}-0-run`;
  const receiptId = `${actor.id}-0-rescue`;
  entries[auditRescueBoardKey(actor.id, 0, runId, receiptId)].board.candidates[0].thumbnail =
    "https://images.test/tampered.jpg";
  const store = makeStore(entries);

  assert.equal(await hasReleaseReadyCohort([actor], store, 1), false);
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

test("Star of the Day waits for two plain operator approvals", async () => {
  const packs = [
    { id: "actor-a", name: "Actor A", shortName_en: "A", vibes: [{ label: "A0", label_en: "A0", queries: ["a"] }] },
    { id: "actor-b", name: "Actor B", shortName_en: "B", vibes: [{ label: "B0", label_en: "B0", queries: ["b"] }] },
  ];
  const eligibilityStore = makeStore({
    ...approvedEligibility(packs[0], 0, "approved"),
    ...approvedEligibility(packs[1], 0, "approved_override"),
  });
  let searches = 0;
  const payload = await buildPayloadForDate("2026-08-31", eligibilityStore, {
    packs,
    evaluate: async () => {
      searches += 1;
      return [];
    },
  });

  assert.equal(await hasReleaseReadyCohort(packs, eligibilityStore), false);
  assert.equal(payload, null);
  assert.equal(searches, 0);
});

test("the production release cohort is specifically Liu Xueyi", async () => {
  const packs = [
    { id: RELEASE_COHORT_ACTOR_ID, name: "Liu Xueyi", vibes: [{ label: "A0", queries: ["a"] }, { label: "A1", queries: ["a1"] }] },
    { id: "actor-b", name: "Actor B", vibes: [{ label: "B0", queries: ["b"] }] },
  ];
  const eligibilityStore = makeStore({
    ...approvedEligibility(packs[0], 0),
    ...approvedEligibility(packs[1], 0),
  });

  assert.equal(await hasReleaseReadyCohort(packs, eligibilityStore, 2, RELEASE_COHORT_ACTOR_ID), false);
  assert.equal(await hasReleaseReadyCohort(packs, eligibilityStore), true);
  assert.equal(await cachedPairIsEligible(
    { actorId: packs[1].id, vibeIdx: 0 },
    eligibilityStore,
    packs,
    RELEASE_COHORT_ACTOR_ID,
  ), false);

  let searches = 0;
  const payload = await buildPayloadForDate("2026-08-31", eligibilityStore, {
    packs,
    releaseActorId: RELEASE_COHORT_ACTOR_ID,
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
  const cohortActor = {
    id: "actor-b",
    vibes: [{ queries: ["second approved query"] }],
  };
  const packs = [actor, cohortActor];
  const records = {
    ...approvedEligibility(actor, 0),
    ...approvedEligibility(cohortActor, 0),
  };
  const store = makeStore(records);
  const payload = { actorId: actor.id, vibeIdx: 0, displayResults: Array(9).fill({}) };

  assert.equal(await cachedPairIsEligible(payload, store, packs), true);

  records[eligibilityKey(actor.id, 0)].eligible = false;
  assert.equal(await cachedPairIsEligible(payload, makeStore(records), packs), false);

  const changedActor = {
    ...actor,
    vibes: [{ queries: ["changed query"] }],
  };
  assert.equal(await cachedPairIsEligible(payload, store, [changedActor, cohortActor]), false);
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
