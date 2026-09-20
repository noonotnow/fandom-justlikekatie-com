import assert from "node:assert/strict";
import test from "node:test";
import { blindCalibrationEvidence } from "./blind-calibration-evidence.js";
import { BLIND_REVIEW_CANDIDATE_SHAPES } from "./blind-review-candidate-fixtures.js";

const expectedContract = {
  profileVersion: 4,
  identityProfileVersion: 4,
  aestheticClusterVersion: 3,
  promiseContractVersion: 2,
  curationVersion: 8,
  pairingFingerprint: "current-pair",
};

function evidenceFixture() {
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    candidateId: `candidate-${index}`,
    occurrenceId: `occurrence-${index}`,
    thumbnail: `https://example.com/${index}.jpg`,
    visualClass: "supporting",
    selected: false,
  }));
  return {
    run: {
      runId: "run-1",
      ...expectedContract,
      calibrationAnalysis: { candidates },
    },
    judgments: candidates.map((candidate, index) => ({
      receiptId: `judgment-${index}`,
      sourceOccurrenceId: candidate.occurrenceId,
      classification: index === 0 ? "core" : "supporting",
    })),
  };
}

test("blind calibration evidence has one stable identity and validity contract", () => {
  const { run, judgments } = evidenceFixture();
  const evidence = blindCalibrationEvidence(run, judgments, expectedContract);
  assert.match(evidence.sourceRescueReceiptId, /^blind-[a-f0-9]{24}$/);
  assert.equal(evidence.reviewedCount, 5);
  assert.deepEqual(evidence.receiptIds, ["judgment-0"]);
  assert.equal(evidence.disagreements[0].direction, "positive");
  assert.equal(
    blindCalibrationEvidence(run, [...judgments].reverse(), expectedContract)
      .sourceRescueReceiptId,
    evidence.sourceRescueReceiptId,
  );

  assert.equal(blindCalibrationEvidence(
    { ...run, pairingFingerprint: "legacy-pair" },
    judgments,
    expectedContract,
  ), null);
  assert.equal(blindCalibrationEvidence(
    { ...run, calibrationAnalysis: { candidates: run.calibrationAnalysis.candidates.slice(0, 4) } },
    judgments.slice(0, 4),
    expectedContract,
  ), null);
  assert.equal(blindCalibrationEvidence(
    run,
    [...judgments, { ...judgments[0], receiptId: "duplicate-judgment" }],
    expectedContract,
  ), null);

  const duplicateOccurrenceRun = structuredClone(run);
  duplicateOccurrenceRun.calibrationAnalysis.candidates[4].occurrenceId =
    duplicateOccurrenceRun.calibrationAnalysis.candidates[0].occurrenceId;
  assert.equal(blindCalibrationEvidence(
    duplicateOccurrenceRun,
    judgments,
    expectedContract,
  ), null);
});

test("blind calibration evidence excludes legacy implicitly unselected queue candidates", () => {
  const { run, judgments } = evidenceFixture();
  const implicitCandidate = {
    candidateId: "candidate-implicit",
    occurrenceId: "occurrence-implicit",
    thumbnail: "https://example.com/implicit.jpg",
    visualClass: "irrelevant",
  };
  run.calibrationAnalysis.candidates.push(implicitCandidate);
  judgments.push({
    receiptId: "judgment-implicit",
    sourceOccurrenceId: implicitCandidate.occurrenceId,
    classification: "core",
  });

  const evidence = blindCalibrationEvidence(run, judgments, expectedContract);

  assert.equal(evidence.reviewedCount, 5);
  assert.equal(evidence.disagreements.some(item =>
    item.occurrenceId === implicitCandidate.occurrenceId), false);
  assert.equal(evidence.receiptIds.includes("judgment-implicit"), false);
});

test("blind calibration evidence follows the shared candidate-shape contract", () => {
  const candidates = BLIND_REVIEW_CANDIDATE_SHAPES.map(({ candidate }) =>
    structuredClone(candidate));
  const evidenceCandidates = BLIND_REVIEW_CANDIDATE_SHAPES
    .filter(shape => shape.evidenceEligible);
  const judgments = evidenceCandidates.map(({ candidate }, index) => ({
    receiptId: `shape-judgment-${index}`,
    sourceOccurrenceId: candidate.occurrenceId,
    classification: "core",
  }));
  const evidence = blindCalibrationEvidence({
    runId: "shape-matrix",
    ...expectedContract,
    calibrationAnalysis: { candidates },
  }, judgments, expectedContract);

  assert.ok(evidence);
  assert.equal(evidence.reviewedCount, evidenceCandidates.length);
  assert.deepEqual(
    evidence.disagreements.map(item => item.occurrenceId).sort(),
    evidenceCandidates.map(shape => shape.candidate.occurrenceId).sort(),
  );
  assert.deepEqual(
    evidence.receiptIds,
    judgments.map(judgment => judgment.receiptId).sort(),
  );
});
