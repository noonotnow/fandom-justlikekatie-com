import { createHash } from "node:crypto";

export const BOARD_CLASSIFICATIONS = {
  exact: "exact-approved-board",
  derived: "derived-from-approved-board",
  unverified: "unverified-saved-grid",
};

export function approvedBoardAuthorityKey(auditRunId) {
  return `approved-board-provenance/${auditRunId}.json`;
}

export function isReleaseCandidateIdentity(value) {
  return isRecord(value)
    && value.schemaVersion === 1
    && nonEmpty(value.auditRunId)
    && (value.publicationManifestId === null || nonEmpty(value.publicationManifestId))
    && ["operator_rescue", "curated_board"].includes(value.publicationSourceType)
    && (value.rescueReceiptId === null || nonEmpty(value.rescueReceiptId))
    && (value.publicationSourceType !== "operator_rescue" || nonEmpty(value.rescueReceiptId))
    && typeof value.boardHash === "string"
    && /^[a-f0-9]{64}$/i.test(value.boardHash)
    && Array.isArray(value.orderedCandidateIds)
    && value.orderedCandidateIds.length === 9
    && value.orderedCandidateIds.every(nonEmpty)
    && new Set(value.orderedCandidateIds).size === 9
    && nonEmpty(value.actorId)
    && nonEmpty(value.vibeKey)
    && positiveVersion(value.curationVersion)
    && positiveVersion(value.promiseContractVersion)
    && positiveVersion(value.identityProfileVersion)
    && Object.keys(value).every(key => [
      "schemaVersion", "auditRunId", "publicationManifestId", "publicationSourceType",
      "rescueReceiptId", "boardHash", "orderedCandidateIds", "actorId", "vibeKey",
      "curationVersion", "promiseContractVersion", "identityProfileVersion",
    ].includes(key));
}

export function isReleaseCandidateProvenance(value) {
  return isRecord(value)
    && value.schemaVersion === 1
    && value.source === "actor-preflight-approval"
    && isReleaseCandidateIdentity(value.identity)
    && Array.isArray(value.candidates)
    && value.candidates.length === 9
    && value.candidates.every(isApprovedCandidate)
    && value.candidates.every((candidate, index) =>
      candidate.candidateId === value.identity.orderedCandidateIds[index])
    && boardHash(value.candidates) === value.identity.boardHash
    && Object.keys(value).every(key =>
      ["schemaVersion", "source", "identity", "candidates"].includes(key));
}

export function classifySavedGrid(grid) {
  const provenance = grid?.releaseCandidateProvenance;
  if (!isReleaseCandidateProvenance(provenance)) return unverified();
  const identity = provenance.identity;
  const orderedImages = Array.isArray(grid.images)
    ? [...grid.images].sort((left, right) => left.gridPosition - right.gridPosition)
    : [];
  const orderedCandidateIds = orderedImages.map(image => image.resultId);
  const exact = grid.actorId === identity.actorId
    && grid.vibeKey === identity.vibeKey
    && orderedCandidateIds.length === 9
    && orderedCandidateIds.every((candidateId, index) =>
      candidateId === identity.orderedCandidateIds[index])
    && orderedImages.every((image, index) => {
      const approved = provenance.candidates[index];
      return approved.candidateId === image.resultId
        && approved.imageDigest === image.media?.checksum
        && approved.thumbnail === originalImageUrl(image)
        && approved.title === image.title
        && approved.source === (image.publisher || "")
        && approved.batchRank === (image.batchRank ?? null);
    });
  return {
    classification: exact ? BOARD_CLASSIFICATIONS.exact : BOARD_CLASSIFICATIONS.derived,
    approvalAuthority: exact,
    releaseCandidateIdentity: exact ? identity : null,
    sourceReleaseCandidateIdentity: identity,
  };
}

function isApprovedCandidate(value) {
  return isRecord(value)
    && nonEmpty(value.candidateId)
    && typeof value.imageDigest === "string"
    && /^[a-f0-9]{64}$/i.test(value.imageDigest)
    && typeof value.thumbnail === "string"
    && typeof value.title === "string"
    && typeof value.source === "string"
    && (value.batchRank === null || Number.isInteger(value.batchRank))
    && Object.keys(value).every(key =>
      ["candidateId", "imageDigest", "thumbnail", "title", "source", "batchRank"].includes(key));
}

function boardHash(candidates) {
  return createHash("sha256").update(JSON.stringify(candidates.map(candidate => ({
    thumbnail: candidate.thumbnail,
    title: candidate.title,
    source: candidate.source,
    batchRank: candidate.batchRank,
  })))).digest("hex");
}

function originalImageUrl(image) {
  const value = image?.mediaRecovery?.sourceUrl || image?.imageUrl || "";
  try {
    const parsed = new URL(value, "https://fandom.justlikekatie.com");
    return parsed.searchParams.get("url") || value;
  } catch {
    return value;
  }
}

function unverified() {
  return {
    classification: BOARD_CLASSIFICATIONS.unverified,
    approvalAuthority: false,
    releaseCandidateIdentity: null,
    sourceReleaseCandidateIdentity: null,
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmpty(value) {
  return typeof value === "string" && value.length > 0;
}

function positiveVersion(value) {
  return Number.isInteger(value) && value > 0;
}
