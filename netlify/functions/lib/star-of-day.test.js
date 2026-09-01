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
  const store = makeStore(records);

  const response = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?date=2026-08-28" },
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
  const archived = { ...archivePayload("2026-08-28"), version: "v5" };
  const store = makeStore(records);

  const response = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?date=2026-08-28" },
    contextFor(store),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), archived);
  assert.deepEqual(store.stats(), { listCalls: 0, setCalls: 0 });
});

test("historical date reads preserve legacy v5 editions after the curation upgrade", async () => {
  const archived = { ...archivePayload("2026-08-28"), version: "v5" };
  const store = makeStore(records);

  const response = await starOfDay(
    { method: "GET", url: "https://example.test/star-of-day?date=2026-08-28" },
    contextFor(store),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), archived);
  assert.deepEqual(store.stats(), { listCalls: 0, setCalls: 0 });
});

test("historical reads reject missing and future dates without touching cache locks", async () => {
  const store = makeStore(records);
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
  const packs = [actor, cohortActor];
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

  assert.equal(await hasReleaseReadyCohort(packs, eligibilityStore), false);
  assert.equal(payload, null);
  assert.equal(searches, 0);
});

test("the production release cohort is specifically Liu Xueyi", async () => {
  const packs = [actor, cohortActor];
  const eligibilityStore = makeStore({
    ...approvedEligibility(packs[0], 0),
    ...approvedEligibility(packs[1], 0),
  });
  let searches = 0;
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

  assert.equal(await hasReleaseReadyCohort(packs, eligibilityStore), false);
  assert.equal(payload, null);
  assert.equal(searches, 0);
});

test("the production release cohort is specifically Liu Xueyi", async () => {
  const packs = [actor, cohortActor];
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
  assert.equal(searches, 0);
});

test("cached and fallback payloads stop qualifying when approval is revoked or inputs change", async () => {
  const actor = {
    id: "actor-a",
    name: "Actor A",
    vibes: [{ label: "Vibe", queries: ["query"] }],
  };
  const cohortActor = {
    id: "actor-b",
    vibes: [{ queries: ["second approved query"] }],
  };
  const packs = [actor, cohortActor];
  const records = approvedEligibility(actor, 0);
  const store = makeStore(records);
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

  assert.equal(await cachedPairIsEligible(payload, store, packs), true);

  records[eligibilityKey(cohortActor.id, 0)].eligible = false;
  assert.equal(
    await cachedPairIsEligible(payload, makeStore(records), packs),
    false,
    "revoking the other approved pair must invalidate an already-cached payload",
  );

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
