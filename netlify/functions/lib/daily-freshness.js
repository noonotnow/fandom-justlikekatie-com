// Daily Drop freshness: keep a recurring actor/Vibe pairing from replaying the
// cards it already published, and reach past page one of each provider when the
// unseen pool is too thin to form a board.
//
// These helpers only partition and plan. They never relax image-safety,
// identity, promise, or eligibility gates: curation still decides every board,
// and a previously published card remains usable as a last resort.

import { candidateFingerprint } from "./search-candidate-fingerprint.js";

// How many of the pairing's most recent editions count as "already published".
export const DAILY_FRESHNESS_HISTORY_EDITIONS = 6;
// Below this many unique unseen candidates, run a deeper search pass.
export const DAILY_FRESHNESS_MIN_UNSEEN = 18;
// Bound the deeper pass so a recurring pairing cannot multiply provider quota.
export const DAILY_DEEP_PASS_QUERY_LIMIT = 6;
export const DAILY_RECENCY_QUERY_LIMIT = 2;
export const DAILY_DEEP_PAGE_CYCLE = 2;

function cardFingerprint(card) {
  return candidateFingerprint({
    thumbnail: card?.sourceUrl || card?.thumbnail || "",
    source: card?.source || "",
    link: card?.link || "",
  });
}

/**
 * Identity sets for every card in the pairing's recent editions. Several keys
 * are kept because providers do not always return the same field verbatim.
 */
export function publishedHistoryIndex(pairHistory = [], editions = DAILY_FRESHNESS_HISTORY_EDITIONS) {
  const recent = (Array.isArray(pairHistory) ? pairHistory : []).slice(0, Math.max(0, editions));
  const thumbnails = new Set();
  const candidateIds = new Set();
  const checksums = new Set();
  const fingerprints = new Set();
  for (const manifest of recent) {
    for (const card of manifest?.cards || []) {
      const thumbnail = card?.sourceUrl || card?.thumbnail;
      if (thumbnail) thumbnails.add(thumbnail);
      if (card?.media?.thumbnailUrl) thumbnails.add(card.media.thumbnailUrl);
      if (card?.candidateId) candidateIds.add(card.candidateId);
      if (card?.media?.checksum) checksums.add(card.media.checksum);
      if (thumbnail && (card?.link || card?.source)) fingerprints.add(cardFingerprint(card));
    }
  }
  return {
    editionCount: recent.length,
    cardCount: thumbnails.size,
    thumbnails,
    candidateIds,
    checksums,
    fingerprints,
  };
}

export function wasPublished(result, index) {
  if (!result || !index) return false;
  if (result.thumbnail && index.thumbnails.has(result.thumbnail)) return true;
  if (result.candidateId && index.candidateIds.has(result.candidateId)) return true;
  const checksum = result.imageChecksum || result.imageDigest || result.digest;
  if (checksum && index.checksums.has(checksum)) return true;
  if (result.thumbnail && index.fingerprints.size
    && index.fingerprints.has(candidateFingerprint(result))) return true;
  return false;
}

/** Split one batch's results into unseen and already-published, deduplicated. */
export function partitionByHistory(results, index) {
  const seen = new Set();
  const unseen = [];
  const published = [];
  for (const result of results || []) {
    if (!result?.thumbnail) continue;
    const key = candidateFingerprint(result);
    if (seen.has(key)) continue;
    seen.add(key);
    if (wasPublished(result, index)) published.push(result);
    else unseen.push(result);
  }
  return { unseen, published };
}

export function countUnseen(rankedBatches, index) {
  const seen = new Set();
  for (const batch of rankedBatches || []) {
    for (const result of batch?.results || []) {
      if (!result?.thumbnail || wasPublished(result, index)) continue;
      seen.add(candidateFingerprint(result));
    }
  }
  return seen.size;
}

export function countPublished(rankedBatches, index) {
  const seen = new Set();
  for (const batch of rankedBatches || []) {
    for (const result of batch?.results || []) {
      if (result?.thumbnail && wasPublished(result, index)) seen.add(candidateFingerprint(result));
    }
  }
  return seen.size;
}

/**
 * Ranked batches in fallback order: unseen only, then unseen ahead of
 * previously published, then the original ranking untouched.
 *
 * Curation orders candidates by batch position (re-sorting inside a batch) and
 * keeps only the first N, so "unseen first" moves published cards into
 * trailing copies of their batches rather than reordering within one.
 */
export function freshnessRankings(ranked, index) {
  const split = ranked.map(batch => ({ batch, ...partitionByHistory(batch.results, index) }));
  const unseenOnly = split.map(({ batch, unseen }) => ({ ...batch, results: unseen }));
  const unseenFirst = [
    ...split.filter(({ unseen }) => unseen.length)
      .map(({ batch, unseen }) => ({ ...batch, results: unseen })),
    ...split.filter(({ published }) => published.length)
      .map(({ batch, published }) => ({ ...batch, results: published, publishedHistoryBatch: true })),
  ];
  return [
    { stage: "unseen_only", ranked: unseenOnly },
    { stage: "unseen_first", ranked: unseenFirst },
    { stage: "original", ranked },
  ];
}

/**
 * Which deeper searches to run for a recurring pairing. Pages rotate with the
 * number of prior editions so consecutive recurrences read different blocks of
 * each provider's ranking; the first few queries also get a recent-uploads rung.
 */
export function deepPassPlan(queries, { priorEditionCount = 0 } = {}) {
  const unique = [...new Set((queries || []).map(query => String(query || "").trim()).filter(Boolean))];
  const page = (Math.max(0, Number(priorEditionCount) || 0) % DAILY_DEEP_PAGE_CYCLE) + 1;
  const paged = unique.slice(0, DAILY_DEEP_PASS_QUERY_LIMIT).map(query => ({ query, page, recency: null }));
  const recent = unique.slice(0, DAILY_RECENCY_QUERY_LIMIT).map(query => ({ query, page: 0, recency: "year" }));
  return { page, searches: [...paged, ...recent] };
}

/** Run a plan through evaluateCandidates-compatible search, tagging each batch's window. */
export async function runDeepPass(plan, { evaluate, search }) {
  const batches = await Promise.all(plan.searches.map(async ({ query, page, recency }) => {
    const [batch] = await evaluate([query], q => search(q, { page, recency }));
    return batch ? { ...batch, searchWindow: { page, recency } } : null;
  }));
  return batches.filter(Boolean);
}
