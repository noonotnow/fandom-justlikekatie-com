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
import { blindCalibrationEvidence } from "./blind-calibration-evidence.js";
import { BLIND_REVIEW_CANDIDATE_SHAPES } from "./blind-review-candidate-fixtures.js";
import {
  auditRescueCalibrationApprovalKey,
  auditRescueCalibrationAuthorityKey,
  auditHeadKey,
  auditCalibrationKey,
  auditRunKey,
  auditRescueCalibrationKey,
  auditVerdictKey,
  auditVisualJudgmentIndexKey,
  auditVisualJudgmentKey,
  eligibilityKey,
  pairingFingerprintFor,
  selectEligiblePair,
} from "./actor-eligibility.js";

const packs = [
  { id: "actor-a", vibes: [{}, {}] },
  { id: "actor-b", vibes: [{}, {}] },
];
const PREVIOUS_CURATION_VERSION = 7;

function storeWith(entries = {}, { hiddenFromList = new Set() } = {}) {
  return {
    async get(key) {
      return entries[key] || null;
    },
    async list({ prefix } = {}) {
      return {
        blobs: Object.keys(entries)
          .filter(key => !prefix || key.startsWith(prefix))
          .filter(key => !hiddenFromList.has(key))
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
    vibeConfirmed: true,
    publishableConfirmed: true,
    finalSchedulingAt: decidedAt,
    finalSchedulingBy: "operator-1",
  };
  return {
    [eligibilityKey(actorId, vibeIdx)]: {
      eligible: true,
      verdict: "approved",
      vibeConfirmed: true,
      publishableConfirmed: true,
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
      vibeConfirmed: true,
      publishableConfirmed: true,
      decidedAt,
      decidedBy: "operator-1",
      calibration: finalCalibration,
    },
    [auditCalibrationKey(actorId, vibeIdx, runId)]: calibration,
  };
}

function rescueContract(actor, vibeIdx) {
  return {
    curationVersion: CURATION_VERSION,
    identityProfileVersion: IDENTITY_PROFILE_VERSION,
    aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
    promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
    pairingFingerprint: pairingFingerprintFor(actor, vibeIdx),
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

function approvedWithBlindCandidateShapes(actor, vibeIdx) {
  const entries = approved(actor, vibeIdx);
  const runId = `${actor.id}-${vibeIdx}-run`;
  const runKey = auditRunKey(actor.id, vibeIdx, runId);
  const run = entries[runKey];
  const candidates = BLIND_REVIEW_CANDIDATE_SHAPES.map(({ candidate }) =>
    structuredClone(candidate));
  const judgments = BLIND_REVIEW_CANDIDATE_SHAPES.map(({ candidate }, index) => ({
    receiptId: `shape-judgment-${index}`,
    sourceOccurrenceId: candidate.occurrenceId,
    classification: "core",
    judgedAt: `2026-09-05T10:00:${String(index).padStart(2, "0")}.000Z`,
  }));
  run.calibrationAnalysis = { candidates };
  const evidence = blindCalibrationEvidence(run, judgments, {
    profileVersion: IDENTITY_PROFILE_VERSION,
    identityProfileVersion: IDENTITY_PROFILE_VERSION,
    aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
    promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
    curationVersion: CURATION_VERSION,
    pairingFingerprint: pairingFingerprintFor(actor, vibeIdx),
  });
  assert.ok(evidence);

  entries[auditVisualJudgmentIndexKey(actor.id, vibeIdx, runId)] = {
    receiptIds: judgments.map(judgment => judgment.receiptId),
  };
  for (const judgment of judgments) {
    entries[auditVisualJudgmentKey(
      actor.id,
      vibeIdx,
      runId,
      judgment.receiptId,
    )] = judgment;
  }

  const approvalId = "blind-shape-approval";
  const evidenceReceiptIds = [evidence.sourceRescueReceiptId];
  const aggregateEvidenceHash = recordHash({
    calibrationVersion: 1,
    evidenceReceiptIds,
    retirementHash: null,
    signalFamily: null,
    direction: null,
    signalValues: [],
  });
  entries[auditRescueCalibrationApprovalKey(actor.id, vibeIdx, approvalId)] = {
    status: "approved",
    approvalId,
    actorId: actor.id,
    vibeKey: `${actor.id}:${vibeIdx}`,
    evidenceReceiptIds,
    aggregateEvidenceHash,
    sourceRunIds: [runId],
    adjustment: {},
    approvedAt: "2026-09-05T11:00:00.000Z",
  };
  entries[auditRescueCalibrationAuthorityKey(actor.id, vibeIdx)] = {
    status: "approved",
    approvalId,
    aggregateEvidenceHash,
  };
  Object.assign(entries[eligibilityKey(actor.id, vibeIdx)], {
    calibrationProfile: { sourceRunIds: [runId] },
    rescueCalibrationApprovalId: approvalId,
    rescueCalibrationApprovalEvidenceHash: aggregateEvidenceHash,
  });
  return { entries, runKey, evidence };
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
  const date = "2026-09-05";
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

test("advisory rescue calibration does not invalidate Daily Drop eligibility", async () => {
  const date = "2026-09-05";
  const legacy = getRandomForDate(packs, date);
  const actor = packs[legacy.aIdx];
  const entries = approved(actor, legacy.vIdx);
  const runId = `${actor.id}-${legacy.vIdx}-run`;
  const receiptId = "rescue-evidence-1";
  entries[auditRescueCalibrationKey(actor.id, legacy.vIdx, receiptId)] = {
    schemaVersion: 1,
    calibrationVersion: 1,
    status: "confirmed",
    sourceRescueReceiptId: receiptId,
    confirmedAt: "2026-09-05T10:00:00.000Z",
    contract: rescueContract(actor, legacy.vIdx),
  };

  const initiallySelected = await selectEligiblePair(packs, date, storeWith(entries));
  assert.equal(initiallySelected.aIdx, legacy.aIdx);
  assert.equal(initiallySelected.vIdx, legacy.vIdx);

  const proofStatus = "reproduced_beyond_saved_nine";

  entries[auditRunKey(actor.id, legacy.vIdx, runId)].calibrationProof = {
    calibrationVersion: 1,
    sourceReceiptIds: [receiptId],
    ready: true,
    status: proofStatus,
  };
  Object.assign(entries[eligibilityKey(actor.id, legacy.vIdx)], {
    rescueCalibrationVersion: 1,
    rescueCalibrationEvidenceCount: 1,
    rescueCalibrationHash: recordHash({
      sourceReceiptIds: [receiptId],
      proofStatus,
    }),
  });
  const selected = await selectEligiblePair(packs, date, storeWith(entries));
  assert.equal(selected.aIdx, legacy.aIdx);
  assert.equal(selected.vIdx, legacy.vIdx);

  entries[auditRescueCalibrationKey(actor.id, legacy.vIdx, "rescue-evidence-2")] = {
    schemaVersion: 1,
    calibrationVersion: 1,
    status: "confirmed",
    sourceRescueReceiptId: "rescue-evidence-2",
    confirmedAt: "2026-09-05T11:00:00.000Z",
    contract: rescueContract(actor, legacy.vIdx),
  };
  const selectedWithNewEvidence = await selectEligiblePair(packs, date, storeWith(entries));
  assert.equal(selectedWithNewEvidence.aIdx, legacy.aIdx);
  assert.equal(selectedWithNewEvidence.vIdx, legacy.vIdx);
});

test("superseded rescue calibration contracts are records-only for Daily Drop eligibility", async () => {
  const date = "2026-09-05";
  const legacy = getRandomForDate(packs, date);
  const actor = packs[legacy.aIdx];
  const mismatches = {
    curationVersion: PREVIOUS_CURATION_VERSION,
    identityProfileVersion: IDENTITY_PROFILE_VERSION - 1,
    aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION - 1,
    promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION - 1,
    pairingFingerprint: "superseded-pairing-fingerprint",
  };

  for (const [field, staleValue] of Object.entries(mismatches)) {
    const entries = approved(actor, legacy.vIdx);
    entries[auditRescueCalibrationKey(actor.id, legacy.vIdx, `stale-${field}`)] = {
      schemaVersion: 1,
      calibrationVersion: 1,
      status: "confirmed",
      sourceRescueReceiptId: `stale-${field}`,
      confirmedAt: "2026-09-05T10:00:00.000Z",
      contract: {
        ...rescueContract(actor, legacy.vIdx),
        [field]: staleValue,
      },
    };

    const selected = await selectEligiblePair(packs, date, storeWith(entries));
    assert.equal(selected?.aIdx, legacy.aIdx, field);
    assert.equal(selected?.vIdx, legacy.vIdx, field);
  }
});

test("eligibility and recovered runs share the blind-review candidate-shape contract", async () => {
  const date = "2026-09-05";
  const legacy = getRandomForDate(packs, date);
  const actor = packs[legacy.aIdx];
  const { entries, runKey, evidence } = approvedWithBlindCandidateShapes(
    actor,
    legacy.vIdx,
  );
  const evidenceEligible = BLIND_REVIEW_CANDIDATE_SHAPES
    .filter(shape => shape.evidenceEligible);

  assert.equal(evidence.reviewedCount, evidenceEligible.length);
  assert.deepEqual(
    evidence.disagreements.map(item => item.occurrenceId).sort(),
    evidenceEligible.map(shape => shape.candidate.occurrenceId).sort(),
  );

  for (const hiddenFromList of [new Set(), new Set([runKey])]) {
    const selected = await selectEligiblePair(
      packs,
      date,
      storeWith(entries, { hiddenFromList }),
    );
    assert.equal(selected?.aIdx, legacy.aIdx);
    assert.equal(selected?.vIdx, legacy.vIdx);
  }

  entries[runKey].calibrationAnalysis.candidates = evidenceEligible
    .slice(0, 4)
    .map(({ candidate }) => structuredClone(candidate));
  assert.equal(await selectEligiblePair(
    packs,
    date,
    storeWith(entries, { hiddenFromList: new Set([runKey]) }),
  ), null);
});
