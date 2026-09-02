import { createHash } from "node:crypto";
import { getRandomForDate, hashDateString } from "./date-seed.js";
import {
  AESTHETIC_CLUSTER_VERSION,
  IDENTITY_PROFILE_VERSION,
  VIBE_PROMISE_CONTRACT_VERSION,
  vibePromiseFor,
} from "./actor-identity-profiles.js";
import { CURATION_VERSION } from "./grid-curation.js";

export const ELIGIBILITY_STORE = "actor-audit";
export const APPROVED_VERDICTS = new Set(["approved", "approved_override"]);
export const eligibilityKey = (actorId, vibeIdx) => `eligibility/${actorId}/${vibeIdx}`;
export const auditEligibilityDecisionPrefix = (actorId, vibeIdx) => `eligibility-decisions/${actorId}/${vibeIdx}/`;
export const auditEligibilityDecisionKey = (actorId, vibeIdx, runId, decisionId) =>
  `${auditEligibilityDecisionPrefix(actorId, vibeIdx)}${encodeURIComponent(runId)}/${encodeURIComponent(decisionId)}`;
export const auditVibeKey = (actorId, vibeIdx) => `${actorId}:${vibeIdx}`;
export const auditHeadKey = (actorId, vibeIdx) => `heads/${actorId}/${vibeIdx}`;
export const auditRunPrefix = (actorId, vibeIdx) => `runs/${actorId}/${vibeIdx}/`;
export const auditRunKey = (actorId, vibeIdx, runId) => `${auditRunPrefix(actorId, vibeIdx)}${encodeURIComponent(runId)}`;
export const auditVerdictPrefix = (actorId, vibeIdx, runId) => `verdicts/${actorId}/${vibeIdx}/${encodeURIComponent(runId)}/`;
export const auditVerdictKey = (actorId, vibeIdx, runId, receiptId = "canonical") => `${auditVerdictPrefix(actorId, vibeIdx, runId)}${encodeURIComponent(receiptId)}`;
export const auditCalibrationPrefix = (actorId, vibeIdx, runId) => `calibrations/${actorId}/${vibeIdx}/${encodeURIComponent(runId)}/`;
export const auditCalibrationKey = (actorId, vibeIdx, runId, receiptId = "canonical") => `${auditCalibrationPrefix(actorId, vibeIdx, runId)}${encodeURIComponent(receiptId)}`;
export const auditCalibrationReasonsPrefix = (actorId, vibeIdx, runId) => `calibration-reasons/${actorId}/${vibeIdx}/${encodeURIComponent(runId)}/`;
export const auditCalibrationReasonsKey = (actorId, vibeIdx, runId, receiptId = "canonical") => `${auditCalibrationReasonsPrefix(actorId, vibeIdx, runId)}${encodeURIComponent(receiptId)}`;
export const auditFeedbackPrefix = (actorId, vibeIdx, runId) => `feedback/${actorId}/${vibeIdx}/${encodeURIComponent(runId)}/`;
export const auditFeedbackKey = (actorId, vibeIdx, runId, receiptId) => `${auditFeedbackPrefix(actorId, vibeIdx, runId)}${encodeURIComponent(receiptId)}`;
export const auditRequestedReviewPrefix = (actorId, vibeIdx, runId) => `requested-reviews/${actorId}/${vibeIdx}/${encodeURIComponent(runId)}/`;
export const auditRequestedReviewKey = (actorId, vibeIdx, runId, feedbackHash) => `${auditRequestedReviewPrefix(actorId, vibeIdx, runId)}${encodeURIComponent(feedbackHash)}`;
export const auditRescueBoardPrefix = (actorId, vibeIdx, runId) => `rescue-boards/${actorId}/${vibeIdx}/${encodeURIComponent(runId)}/`;
export const auditRescueBoardKey = (actorId, vibeIdx, runId, receiptId) => `${auditRescueBoardPrefix(actorId, vibeIdx, runId)}${encodeURIComponent(receiptId)}`;
export const auditRescuePreferencePrefix = (actorId, vibeIdx, runId) => `rescue-preferences/${actorId}/${vibeIdx}/${encodeURIComponent(runId)}/`;
export const auditRescuePreferenceKey = (actorId, vibeIdx, runId, receiptId = "canonical") =>
  `${auditRescuePreferencePrefix(actorId, vibeIdx, runId)}${encodeURIComponent(receiptId)}`;
export const auditRescueCalibrationPrefix = (actorId, vibeIdx) => `rescue-calibrations/${actorId}/${vibeIdx}/`;
export const auditRescueCalibrationKey = (actorId, vibeIdx, receiptId) => `${auditRescueCalibrationPrefix(actorId, vibeIdx)}${encodeURIComponent(receiptId)}`;
export const auditRescueCalibrationRetirementPrefix = (actorId, vibeIdx) => `rescue-calibration-retirements/${actorId}/${vibeIdx}/`;
export const auditRescueCalibrationRetirementKey = (actorId, vibeIdx, receiptId) =>
  `${auditRescueCalibrationRetirementPrefix(actorId, vibeIdx)}${encodeURIComponent(receiptId)}`;

export function rescueCalibrationRetirementHash(retirements = []) {
  return createHash("sha256").update(JSON.stringify(
    retirements
      .filter(retirement => retirement?.status === "retired"
        && typeof retirement?.sourceRescueReceiptId === "string")
      .map(retirement => ({
        retirementId: retirement.retirementId || null,
        sourceRescueReceiptId: retirement.sourceRescueReceiptId,
        retiredAt: retirement.retiredAt || null,
      }))
      .sort((left, right) =>
        left.sourceRescueReceiptId.localeCompare(right.sourceRescueReceiptId)
        || String(left.retirementId).localeCompare(String(right.retirementId))),
  )).digest("hex");
}

export function pairingFingerprintFor(actor, vibeIdx) {
  return createHash("sha256").update(JSON.stringify({
    profileVersion: IDENTITY_PROFILE_VERSION,
    identityProfileVersion: IDENTITY_PROFILE_VERSION,
    aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
    promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
    curationVersion: CURATION_VERSION,
    actorId: actor.id,
    vibeKey: auditVibeKey(actor.id, vibeIdx),
    queries: actor.vibes?.[vibeIdx]?.queries || [],
    promise: vibePromiseFor(actor, vibeIdx),
  })).digest("hex").slice(0, 20);
}

export async function getEligibility(store, actor, vibeIdx) {
  const actorId = actor.id;
  const [snapshot, head] = await Promise.all([
    store.get(eligibilityKey(actorId, vibeIdx), { type: "json", consistency: "strong" }),
    store.get(auditHeadKey(actorId, vibeIdx), { type: "json", consistency: "strong" }),
  ]);
  if (!snapshot || !head?.currentRunId || snapshot.runId !== head.currentRunId) return null;

  const [run, verdict, calibration, reasons, publicationReceipt] = await Promise.all([
    store.get(auditRunKey(actorId, vibeIdx, head.currentRunId), { type: "json", consistency: "strong" }),
    readCanonicalReceipt(
      store,
      auditVerdictKey(actorId, vibeIdx, head.currentRunId),
      auditVerdictPrefix(actorId, vibeIdx, head.currentRunId),
      "decidedAt",
    ),
    readFirstReceipt(store, auditCalibrationPrefix(actorId, vibeIdx, head.currentRunId), "chosenAt"),
    readFirstReceipt(store, auditCalibrationReasonsPrefix(actorId, vibeIdx, head.currentRunId), "annotatedAt"),
    snapshot.publicationSource?.type === "operator_rescue"
      ? store.get(
        auditRescueBoardKey(
          actorId,
          vibeIdx,
          head.currentRunId,
          snapshot.publicationSource.rescueReceiptId,
        ),
        { type: "json", consistency: "strong" },
      )
      : null,
  ]);
  const operatorPublication = snapshot.publicationSource?.type === "operator_rescue";
  const curatedPublication = snapshot.publicationSource?.type === "curated_board";
  const disagreement = calibration?.choice !== run?.winner?.mode;
  const expectedFingerprint = pairingFingerprintFor(actor, vibeIdx);
  if (
    !run
    || !verdict
    || (operatorPublication
      ? !validOperatorPublication({
        actor,
        vibeIdx,
        run,
        verdict,
        snapshot,
        publicationReceipt,
      })
      : curatedPublication
        ? !validCuratedPublication({
          actor,
          vibeIdx,
          run,
          verdict,
          snapshot,
        })
      : (
        !calibration
        || calibration.runId !== run.runId
        || !["event", "compiled", "neither"].includes(calibration.choice)
        || (disagreement && !reasons?.reasonCodes?.length)
        || !validFinalCalibration({
          actor,
          vibeIdx,
          run,
          verdict,
          calibration,
          reasons,
          snapshot,
        })
        || snapshot.calibrationVersion !== 1
      ))
    || run.profileVersion !== IDENTITY_PROFILE_VERSION
    || run.identityProfileVersion !== IDENTITY_PROFILE_VERSION
    || run.aestheticClusterVersion !== AESTHETIC_CLUSTER_VERSION
    || run.promiseContractVersion !== VIBE_PROMISE_CONTRACT_VERSION
    || run.curationReceipt?.curationVersion !== CURATION_VERSION
    || run.pairingFingerprint !== expectedFingerprint
    || snapshot.profileVersion !== IDENTITY_PROFILE_VERSION
    || snapshot.identityProfileVersion !== IDENTITY_PROFILE_VERSION
    || snapshot.aestheticClusterVersion !== AESTHETIC_CLUSTER_VERSION
    || snapshot.promiseContractVersion !== VIBE_PROMISE_CONTRACT_VERSION
    || snapshot.curationVersion !== CURATION_VERSION
    || snapshot.pairingFingerprint !== expectedFingerprint
    || snapshot.verdict !== verdict.verdict
    || snapshot.vibeConfirmed !== verdict.vibeConfirmed
    || snapshot.publishableConfirmed !== verdict.publishableConfirmed
    || (snapshot.verdict === "approved"
      && (snapshot.vibeConfirmed !== true || snapshot.publishableConfirmed !== true))
  ) return null;
  if (operatorPublication) return { ...snapshot, publicationBoard: publicationReceipt.board };
  if (curatedPublication) {
    const publicationBoard = run[snapshot.publicationSource.mode === "event"
      ? "strongestEvent"
      : "strongestCompiled"];
    return { ...snapshot, publicationBoard };
  }
  return snapshot;
}

function validOperatorPublication({
  actor,
  vibeIdx,
  run,
  verdict,
  snapshot,
  publicationReceipt,
}) {
  const source = snapshot.publicationSource;
  const verdictSource = verdict?.publicationSource;
  const candidates = publicationReceipt?.board?.candidates;
  return Boolean(
    snapshot.verdict === "approved"
    && snapshot.vibeConfirmed === true
    && snapshot.publishableConfirmed === true
    && source?.type === "operator_rescue"
    && typeof source.rescueReceiptId === "string"
    && source.rescueReceiptId.length > 0
    && verdictSource?.type === source.type
    && verdictSource.rescueReceiptId === source.rescueReceiptId
    && verdictSource.boardHash === source.boardHash
    && verdictSource.feedbackHash === source.feedbackHash
    && publicationReceipt
    && publicationReceipt.receiptId === source.rescueReceiptId
    && publicationReceipt.runId === run.runId
    && publicationReceipt.actorId === actor.id
    && publicationReceipt.vibeKey === auditVibeKey(actor.id, vibeIdx)
    && publicationReceipt.feedbackHash === source.feedbackHash
    && Array.isArray(candidates)
    && candidates.length === 9
    && new Set(candidates.map(candidate => candidate?.candidateId)).size === 9
    && candidates.every(candidate =>
      typeof candidate?.candidateId === "string"
      && typeof candidate?.thumbnail === "string"
      && candidate.thumbnail.length > 0)
    && boardHash(publicationReceipt.board) === source.boardHash
  );
}

function validCuratedPublication({
  actor,
  vibeIdx,
  run,
  verdict,
  snapshot,
}) {
  const source = snapshot.publicationSource;
  const verdictSource = verdict?.publicationSource;
  const board = source?.mode === "event"
    ? run?.strongestEvent
    : source?.mode === "compiled"
      ? run?.strongestCompiled
      : null;
  const candidates = board?.candidates;
  return Boolean(
    snapshot.verdict === "approved"
    && snapshot.vibeConfirmed === true
    && snapshot.publishableConfirmed === true
    && source?.type === "curated_board"
    && (source.mode === "event" || source.mode === "compiled")
    && verdictSource?.type === source.type
    && verdictSource.mode === source.mode
    && verdictSource.boardHash === source.boardHash
    && board
    && boardHash(board) === source.boardHash
    && Array.isArray(candidates)
    && candidates.length === 9
    && new Set(candidates.map(candidate => candidate?.candidateId)).size === 9
    && candidates.every(candidate =>
      typeof candidate?.candidateId === "string"
      && typeof candidate?.thumbnail === "string"
      && candidate.thumbnail.length > 0)
    && actor?.id
    && Number.isInteger(vibeIdx)
  );
}

function validFinalCalibration({ actor, vibeIdx, run, verdict, calibration, reasons, snapshot }) {
  const final = verdict?.calibration;
  const winner = run?.winner?.mode || null;
  const expectedAgreement = calibration?.choice !== "neither" && calibration?.choice === winner;
  const expectedVersion = run?.curationReceipt?.curationVersion
    ?? run?.curationReceipt?.version
    ?? null;
  const eventBoard = boardSnapshot(run?.strongestEvent, "event");
  const compiledBoard = boardSnapshot(run?.strongestCompiled, "compiled");
  const expectedReasons = reasons?.reasonCodes || [];
  const expectedNote = reasons?.note || "";
  return Boolean(
    comparableBoards(run)
    && final
    && calibration.schemaVersion === 1
    && calibration.actorId === actor.id
    && calibration.vibeKey === auditVibeKey(actor.id, vibeIdx)
    && calibration.systemWinner === winner
    && calibration.agreement === expectedAgreement
    && calibration.experiment?.auditRunId === run.runId
    && calibration.experiment?.curationVersion === expectedVersion
    && calibration.experiment?.identityProfileVersion === IDENTITY_PROFILE_VERSION
    && calibration.experiment?.aestheticClusterVersion === AESTHETIC_CLUSTER_VERSION
    && calibration.experiment?.promiseContractVersion === VIBE_PROMISE_CONTRACT_VERSION
    && expectedVersion !== null
    && expectedVersion === CURATION_VERSION
    && sameRecord(calibration.experiment?.eventBoard, eventBoard)
    && sameRecord(calibration.experiment?.compiledBoard, compiledBoard)
    && validPresentationOrder(calibration.presentationOrder)
    && (!reasons || reasons.runId === run.runId)
    && final.schemaVersion === 1
    && final.auditRunId === run.runId
    && final.actorId === actor.id
    && final.vibeKey === auditVibeKey(actor.id, vibeIdx)
    && sameRecord(final.eventBoard, eventBoard)
    && sameRecord(final.compiledBoard, compiledBoard)
    && sameRecord(final.presentationOrder, calibration.presentationOrder)
    && final.curationVersion === expectedVersion
    && final.identityProfileVersion === IDENTITY_PROFILE_VERSION
    && final.aestheticClusterVersion === AESTHETIC_CLUSTER_VERSION
    && final.promiseContractVersion === VIBE_PROMISE_CONTRACT_VERSION
    && final.humanChoice === calibration.choice
    && final.humanChoiceAt === calibration.chosenAt
    && final.humanChoiceBy === calibration.chosenBy
    && final.systemWinner === winner
    && final.agreement === expectedAgreement
    && sameRecord(final.reasonCodes, expectedReasons)
    && final.disagreementNote === expectedNote
    && final.disagreementAnnotatedAt === (reasons?.annotatedAt || null)
    && final.disagreementAnnotatedBy === (reasons?.annotatedBy || null)
    && final.finalSchedulingVerdict === verdict.verdict
    && final.finalSchedulingNotes === verdict.notes
    && final.vibeConfirmed === verdict.vibeConfirmed
    && final.publishableConfirmed === verdict.publishableConfirmed
    && final.finalSchedulingAt === verdict.decidedAt
    && final.finalSchedulingBy === verdict.decidedBy
    && snapshot.calibrationHash === recordHash(final)
  );
}

function comparableBoards(run) {
  return [run?.strongestEvent, run?.strongestCompiled]
    .every(board => Array.isArray(board?.candidates) && board.candidates.length >= 9);
}

function boardHash(board) {
  return createHash("sha256").update(JSON.stringify(
    (board?.candidates || []).map(candidate => ({
      thumbnail: candidate.thumbnail || "",
      title: candidate.title || "",
      source: candidate.source || "",
      batchRank: candidate.batchRank ?? null,
    })),
  )).digest("hex");
}

function boardSnapshot(board, mode) {
  if (!board) return null;
  const hash = boardHash(board);
  return { mode, boardId: `${mode}-${hash.slice(0, 16)}`, boardHash: hash };
}

function validPresentationOrder(order) {
  return Array.isArray(order)
    && order.length === 2
    && new Set(order).size === 2
    && order.includes("event")
    && order.includes("compiled");
}

function sameRecord(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function recordHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readFirstReceipt(store, prefix, timestampField) {
  const listing = await store.list({ prefix });
  const receipts = (await Promise.all((listing?.blobs || []).map(async blob => {
    if (typeof blob?.key !== "string") return null;
    const value = await store.get(blob.key, { type: "json", consistency: "strong" });
    return value ? { key: blob.key, value } : null;
  }))).filter(Boolean);
  receipts.sort((left, right) =>
    String(left.value[timestampField] || "").localeCompare(String(right.value[timestampField] || ""))
    || left.key.localeCompare(right.key));
  return receipts[0]?.value || null;
}

async function readCanonicalReceipt(store, key, prefix, timestampField) {
  const canonical = await store.get(key, { type: "json", consistency: "strong" });
  return canonical || readFirstReceipt(store, prefix, timestampField);
}

export function isApproved(snapshot) {
  return Boolean(
    snapshot
    && snapshot.eligible === true
    && snapshot.runId
    && APPROVED_VERDICTS.has(snapshot.verdict),
  );
}

export async function isPairEligible(actorPacks, actorId, vibeIdx, store) {
  const actor = actorPacks.find(item => item.id === actorId);
  if (!actor?.vibes?.[vibeIdx]) return false;
  return isApproved(await getEligibility(store, actor, vibeIdx));
}

// Does not mutate or reorder ACTOR_PACKS. The first probe remains the legacy
// hash pair; remaining pairs are a stable rotation of the flattened roster.
export async function selectEligiblePair(
  actorPacks,
  dateString,
  store,
  excluded = new Set(),
  allowedActorId = null,
) {
  const legacy = getRandomForDate(actorPacks, dateString);
  if (!legacy) return null;
  const all = actorPacks.flatMap((actor, aIdx) => actor.vibes.map((_, vIdx) => ({ aIdx, vIdx })));
  const offset = hashDateString(`${dateString}:eligibility`) % all.length;
  const order = [legacy, ...all.slice(offset), ...all.slice(0, offset)]
    .filter((pair, index, pairs) => index === pairs.findIndex(other => other.aIdx === pair.aIdx && other.vIdx === pair.vIdx));
  for (const pair of order) {
    const actor = actorPacks[pair.aIdx];
    if (allowedActorId && actor.id !== allowedActorId) continue;
    const key = `${actor.id}:${pair.vIdx}`;
    if (excluded.has(key)) continue;
    if (isApproved(await getEligibility(store, actor, pair.vIdx))) {
      return {
        ...pair,
        legacy: pair.aIdx === legacy.aIdx && pair.vIdx === legacy.vIdx,
      };
    }
  }
  return null;
}