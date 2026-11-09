// Approved Misprint reports as future-board exclusions.
//
// A Misprint receipt marked `futureExclusion` only takes effect once it is
// active: approved by an operator review (or trusted operator feedback) and not
// later retracted. Pending, rejected, and retracted receipts never exclude.
// Scope decides reach:
//   global_asset   -> the image is excluded from every actor and Vibe
//   actor_identity -> excluded from every Vibe of that actor (wrong person)
//   metadata_signal-> excluded from every Vibe of that actor
//   actor_vibe     -> excluded from that actor/Vibe pairing only
//   result_set     -> excluded from that actor/Vibe pairing only

import { createHash } from "node:crypto";
import { candidateFingerprint } from "./search-candidate-fingerprint.js";
import {
  auditMisprintActorPrefix,
  auditMisprintDecisionKey,
  auditMisprintGlobalPrefix,
  auditMisprintVibePrefix,
} from "./actor-eligibility.js";

export const MISPRINT_EXCLUSION_RECEIPT_LIMIT = 500;

/** Shared with the operator console so "approved" means one thing everywhere. */
export function applyMisprintDecisions(receipt, decisions) {
  const applicable = decisions
    .filter(decision => decision.sourceReceiptId === receipt.receiptId)
    .sort((left, right) =>
      String(left.decidedAt || "").localeCompare(String(right.decidedAt || ""))
      || String(left.decisionId || "").localeCompare(String(right.decisionId || "")));
  let status = receipt.status;
  const review = applicable.find(decision => decision.kind === "review");
  if (review && receipt.status === "pending_review") {
    status = review.decision === "approved" ? "active" : "rejected";
  }
  if (
    status === "active"
    && applicable.some(decision => decision.kind === "retraction")
  ) {
    status = "retracted";
  }
  return {
    ...receipt,
    originalStatus: receipt.status,
    status,
    decisionIds: applicable.map(decision => decision.decisionId),
  };
}

export function misprintDecisionId(receiptId, kind) {
  return createHash("sha256")
    .update(JSON.stringify({ sourceReceiptId: receiptId, kind }))
    .digest("hex")
    .slice(0, 24);
}

function emptyExclusions() {
  return {
    receiptIds: [],
    thumbnails: new Set(),
    candidateIds: new Set(),
    digests: new Set(),
    fingerprints: new Set(),
    unavailable: false,
    truncated: false,
  };
}

function addReceipt(exclusions, receipt) {
  const candidate = receipt.candidate || {};
  const before = exclusions.thumbnails.size + exclusions.candidateIds.size + exclusions.digests.size;
  for (const thumbnail of [candidate.thumbnail, candidate.publishedThumbnail]) {
    if (typeof thumbnail === "string" && thumbnail) exclusions.thumbnails.add(thumbnail);
  }
  const candidateId = candidate.candidateId || receipt.candidateId;
  if (typeof candidateId === "string" && candidateId) exclusions.candidateIds.add(candidateId);
  const digest = candidate.imageDigest || candidate.digest;
  if (typeof digest === "string" && digest) exclusions.digests.add(digest);
  if (candidate.thumbnail && (candidate.link || candidate.source)) {
    exclusions.fingerprints.add(candidateFingerprint({
      thumbnail: candidate.thumbnail,
      source: candidate.source,
      link: candidate.link,
    }));
  }
  const after = exclusions.thumbnails.size + exclusions.candidateIds.size + exclusions.digests.size;
  if (after > before || candidateId) exclusions.receiptIds.push(receipt.receiptId);
}

async function readJson(store, key) {
  return store.get(key, { type: "json", consistency: "strong" });
}

/**
 * Read the active, exclusion-bearing Misprint receipts that apply to one
 * actor/Vibe pairing. Fails open with `unavailable: true` so a storage hiccup
 * cannot stop a Daily Drop; callers record that in provenance.
 */
export async function readMisprintExclusions(store, actorId, vibeIdx, {
  limit = MISPRINT_EXCLUSION_RECEIPT_LIMIT,
} = {}) {
  const exclusions = emptyExclusions();
  if (!store?.list || !store?.get || !actorId || !Number.isInteger(vibeIdx)) return exclusions;
  try {
    const prefixes = [
      auditMisprintGlobalPrefix(),
      auditMisprintActorPrefix(actorId),
      auditMisprintVibePrefix(actorId, vibeIdx),
    ];
    const listings = await Promise.all(prefixes.map(prefix => store.list({ prefix })));
    const keys = [...new Set(listings.flatMap(listing =>
      (listing?.blobs || []).map(blob => blob?.key).filter(key => typeof key === "string")))]
      .sort();
    if (keys.length > limit) exclusions.truncated = true;
    const receipts = (await Promise.all(keys.slice(-limit).map(key => readJson(store, key))))
      .filter(receipt => receipt?.receiptId && receipt.futureExclusion === true);
    const effective = await Promise.all(receipts.map(async receipt => {
      if (receipt.status !== "active" && receipt.status !== "pending_review") return null;
      const decisions = await Promise.all(["review", "retraction"].map(kind =>
        readJson(store, auditMisprintDecisionKey(
          receipt.actorId || actorId,
          Number.isInteger(receipt.vibeIdx) ? receipt.vibeIdx : vibeIdx,
          receipt.correctionScope,
          receipt.receiptId,
          misprintDecisionId(receipt.receiptId, kind),
        ))));
      return applyMisprintDecisions(receipt, decisions.filter(Boolean));
    }));
    for (const receipt of effective) {
      if (receipt?.status === "active") addReceipt(exclusions, receipt);
    }
  } catch (error) {
    console.warn("Misprint exclusions unavailable; continuing without them", {
      actorId,
      vibeIdx,
      message: error?.message || String(error),
    });
    return { ...emptyExclusions(), unavailable: true };
  }
  exclusions.receiptIds.sort();
  return exclusions;
}

export function isMisprintExcluded(result, exclusions) {
  if (!result || !exclusions) return false;
  if (result.thumbnail && exclusions.thumbnails.has(result.thumbnail)) return true;
  if (result.thumbnailOriginal && exclusions.thumbnails.has(result.thumbnailOriginal)) return true;
  if (result.candidateId && exclusions.candidateIds.has(result.candidateId)) return true;
  const digest = result.imageDigest || result.imageChecksum || result.digest;
  if (digest && exclusions.digests.has(digest)) return true;
  if (result.thumbnail && exclusions.fingerprints.size
    && exclusions.fingerprints.has(candidateFingerprint(result))) return true;
  return false;
}

export function hasMisprintExclusions(exclusions) {
  return Boolean(exclusions && (
    exclusions.thumbnails.size
    || exclusions.candidateIds.size
    || exclusions.digests.size
    || exclusions.fingerprints.size));
}

/**
 * Remove excluded results from evaluated search batches, keeping each batch's
 * counts consistent so ranking sees only usable results.
 */
export function applyMisprintExclusions(batches, exclusions, tally = { removed: 0 }) {
  if (!hasMisprintExclusions(exclusions)) return batches;
  return (batches || []).map(batch => {
    const results = (batch?.results || []).filter(result => !isMisprintExcluded(result, exclusions));
    const removed = (batch?.results || []).length - results.length;
    if (!removed) return batch;
    tally.removed += removed;
    return {
      ...batch,
      results,
      count: results.length,
      distinctSources: new Set(results.map(result => result.source).filter(Boolean)).size,
    };
  });
}

export function misprintExclusionProvenance(exclusions, tally) {
  if (!exclusions) return null;
  if (!hasMisprintExclusions(exclusions) && !exclusions.unavailable) return null;
  return {
    activeReceiptCount: exclusions.receiptIds.length,
    receiptIds: exclusions.receiptIds.slice(0, 20),
    removedCandidateCount: tally?.removed || 0,
    unavailable: exclusions.unavailable,
    truncated: exclusions.truncated,
  };
}
