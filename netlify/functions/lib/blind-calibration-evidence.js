import { createHash } from "node:crypto";
import { isBlindReviewEvidenceCandidate } from "./blind-review-candidate.js";

export {
  blindReviewCandidateEligibility,
  isBlindReviewEvidenceCandidate,
  isBlindReviewQueueCandidate,
} from "./blind-review-candidate.js";

const CLASS_WEIGHT = new Map([
  ["contradictory", -1],
  ["irrelevant", 0],
  ["connective", 1],
  ["supporting", 2],
  ["core", 3],
]);

export const MIN_BLIND_CALIBRATION_SAMPLE = 5;

function recordHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function runContract(run) {
  return {
    profileVersion: run?.profileVersion ?? null,
    identityProfileVersion: run?.identityProfileVersion ?? null,
    aestheticClusterVersion: run?.aestheticClusterVersion ?? null,
    promiseContractVersion: run?.promiseContractVersion ?? null,
    curationVersion: run?.curationVersion
      ?? run?.curationReceipt?.curationVersion
      ?? run?.curationReceipt?.version
      ?? null,
    pairingFingerprint: run?.pairingFingerprint ?? null,
  };
}

export function blindCalibrationEvidence(run, judgments = [], expectedContract = {}) {
  const contract = runContract(run);
  if (Object.entries(expectedContract).some(([key, value]) => contract[key] !== value)) {
    return null;
  }

  const candidates = (run?.calibrationAnalysis?.candidates || []).filter(candidate =>
    isBlindReviewEvidenceCandidate(candidate));
  const occurrenceIds = new Set(candidates.map(candidate => candidate.occurrenceId));
  const judgmentsByOccurrence = new Map();
  for (const judgment of judgments) {
    if (!judgment?.sourceOccurrenceId) continue;
    const receipts = judgmentsByOccurrence.get(judgment.sourceOccurrenceId) || [];
    receipts.push(judgment);
    judgmentsByOccurrence.set(judgment.sourceOccurrenceId, receipts);
  }
  if (
    candidates.length < MIN_BLIND_CALIBRATION_SAMPLE
    || occurrenceIds.size !== candidates.length
    || candidates.some(candidate =>
      (judgmentsByOccurrence.get(candidate.occurrenceId) || []).length !== 1)
  ) return null;

  const disagreements = candidates.flatMap(candidate => {
    const judgment = judgmentsByOccurrence.get(candidate.occurrenceId)[0];
    const proxyWeight = CLASS_WEIGHT.get(candidate.visualClass);
    const humanWeight = CLASS_WEIGHT.get(judgment.classification);
    if (proxyWeight === undefined || humanWeight === undefined || proxyWeight === humanWeight) {
      return [];
    }
    return [{
      candidate,
      judgment,
      occurrenceId: candidate.occurrenceId,
      judgmentReceiptId: judgment.receiptId,
      direction: humanWeight > proxyWeight ? "positive" : "negative",
      transition: `${candidate.visualClass} → ${judgment.classification}`,
    }];
  });
  if (!disagreements.length) return null;

  const receiptIds = [...new Set(disagreements
    .map(item => item.judgmentReceiptId)
    .filter(Boolean))].sort();
  return {
    sourceRescueReceiptId: `blind-${recordHash({
      runId: run.runId,
      receiptIds,
    }).slice(0, 24)}`,
    sourceRunId: run.runId,
    receiptIds,
    disagreements,
    reviewedCount: candidates.length,
    occurrenceCount: candidates.length,
    contract,
  };
}