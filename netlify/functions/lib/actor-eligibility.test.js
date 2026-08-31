import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { getRandomForDate } from "./date-seed.js";
import {
  AESTHETIC_CLUSTER_VERSION,
  IDENTITY_PROFILE_VERSION,
  VIBE_PROMISE_CONTRACT_VERSION,
} from "./actor-identity-profiles.js";
import { CURATION_VERSION } from "./grid-curation.js";
import {
  auditHeadKey,
  auditCalibrationKey,
  auditRunKey,
  auditVerdictKey,
  eligibilityKey,
  pairingFingerprintFor,
  selectEligiblePair,
} from "./actor-eligibility.js";

const packs = [
  { id: "actor-a", vibes: [{}, {}] },
  { id: "actor-b", vibes: [{}, {}] },
];
const PREVIOUS_CURATION_VERSION = 4;

function storeWith(entries = {}) {
  return {
    async get(key) {
      return entries[key] || null;
    },
    async list({ prefix } = {}) {
      return {
        blobs: Object.keys(entries)
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
  };
}

function approved(actor, vibeIdx) {
  const actorId = actor.id;
  const runId = `${actorId}-${vibeIdx}-run`;
  const vibeKey = `${actorId}:${vibeIdx}`;
  const pairingFingerprint = pairingFingerprintFor(actor, vibeIdx);
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
    finalSchedulingVerdict: "approved",
    finalSchedulingNotes: "Approved fixture.",
    finalSchedulingAt: decidedAt,
    finalSchedulingBy: "operator-1",
  };
  return {
    [eligibilityKey(actorId, vibeIdx)]: {
      eligible: true,
      verdict: "approved",
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
      verdict: "approved",
      notes: "Approved fixture.",
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

test("the legacy date pair stays selected when its current audit is approved", async () => {
  const date = "2026-08-31";
  const legacy = getRandomForDate(packs, date);
  const actor = packs[legacy.aIdx];
  const selected = await selectEligiblePair(
    packs,
    date,
    storeWith(approved(actor, legacy.vIdx)),
  );

  assert.deepEqual(
    { aIdx: selected.aIdx, vIdx: selected.vIdx, legacy: selected.legacy },
    { aIdx: legacy.aIdx, vIdx: legacy.vIdx, legacy: true },
  );
});

test("an unapproved pair is skipped without removing its actor's other packs", async () => {
  const date = "2026-08-31";
  const legacy = getRandomForDate(packs, date);
  const sameActorOtherVibe = legacy.vIdx === 0 ? 1 : 0;
  const actor = packs[legacy.aIdx];
  const selected = await selectEligiblePair(
    packs,
    date,
    storeWith(approved(actor, sameActorOtherVibe)),
  );

  assert.equal(selected.aIdx, legacy.aIdx);
  assert.equal(selected.vIdx, sameActorOtherVibe);
  assert.equal(selected.legacy, false);
});

test("selection is stable and fails closed when no current pair is approved", async () => {
  const date = "2026-09-01";
  const empty = storeWith();
  assert.equal(await selectEligiblePair(packs, date, empty), null);

  const entries = {
    ...approved(packs[0], 0),
    ...approved(packs[1], 1),
  };
  const first = await selectEligiblePair(packs, date, storeWith(entries));
  const second = await selectEligiblePair(packs, date, storeWith(entries));
  assert.deepEqual(first, second);
});

test("stale approval-shaped records without an eligible current run are rejected", async () => {
  const date = "2026-09-02";
  const legacy = getRandomForDate(packs, date);
  const actor = packs[legacy.aIdx];
  const key = eligibilityKey(actor.id, legacy.vIdx);
  assert.equal(await selectEligiblePair(packs, date, storeWith({
    [key]: { verdict: "approved", eligible: false, runId: "old-run" },
  })), null);
  assert.equal(await selectEligiblePair(packs, date, storeWith({
    [key]: { verdict: "approved", eligible: true, runId: "" },
  })), null);
});

test("an approval is stale after its identity profile or query fingerprint changes", async () => {
  const date = "2026-09-03";
  const legacy = getRandomForDate(packs, date);
  const originalActor = packs[legacy.aIdx];
  const entries = approved(originalActor, legacy.vIdx);
  const changedPacks = structuredClone(packs);
  changedPacks[legacy.aIdx].vibes[legacy.vIdx].queries = ["new query contract"];

  assert.equal(await selectEligiblePair(changedPacks, date, storeWith(entries)), null);
});

test("an approval fails closed after the curation algorithm version changes", async () => {
  assert.equal(CURATION_VERSION, PREVIOUS_CURATION_VERSION + 1);
  const date = "2026-09-04";
  const legacy = getRandomForDate(packs, date);
  const actor = packs[legacy.aIdx];
  const entries = approved(actor, legacy.vIdx);
  const runId = `${actor.id}-${legacy.vIdx}-run`;
  entries[auditRunKey(actor.id, legacy.vIdx, runId)].curationReceipt.curationVersion = PREVIOUS_CURATION_VERSION;

  assert.equal(await selectEligiblePair(packs, date, storeWith(entries)), null);
});