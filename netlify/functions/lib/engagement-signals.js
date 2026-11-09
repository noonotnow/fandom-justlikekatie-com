// Reader saves and exports as weak, transferable curation evidence.
//
// For each recent Daily Drop edition of a pairing we measure which of the nine
// cards readers saved or exported, relative to the other cards in the same
// edition (so traffic differences between days cancel out). Cards inherit their
// published source and query; signal values that readers favour repeatedly
// across editions become a small ranking preference for fresh candidates with
// the same source or query. Exact images are never boosted: freshness already
// steers boards away from re-running published cards, and readers' taste
// should transfer to new images, not resurrect old ones.
//
// The resulting bonus is applied only after image-safety, identity and promise
// gates, is capped well below operator calibration, and never satisfies a gate.

import { createHash } from "node:crypto";

export const ENGAGEMENT_STORE = "engagement";
export const ENGAGEMENT_HISTORY_EDITIONS = 12;
export const ENGAGEMENT_EXPORT_WEIGHT = 0.5;
export const ENGAGEMENT_MIN_EDITION_WEIGHT = 1;
export const ENGAGEMENT_MIN_SIGNAL_CARDS = 3;
export const ENGAGEMENT_MIN_SIGNAL_EDITIONS = 2;
export const ENGAGEMENT_MIN_SIGNAL_WEIGHT = 4;
export const ENGAGEMENT_LIFT_THRESHOLD = 0.03;
export const ENGAGEMENT_BOARD_BONUS_CAP = 0.04;
const MAX_EVENTS_PER_EDITION = 600;

export const dailyCardSavePrefix = date => `vibe-atlas:${date}:daily_drop_card_save:`;
// Written by log-engagement for grid exports that carry a capture date, so
// exports can be read per edition without listing the whole store.
export const dailyExportIndexPrefix = date => `vibe-atlas-export:${date}:`;

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cardIdentities(card) {
  return [
    card?.candidateId,
    card?.sourceUrl,
    card?.media?.thumbnailUrl,
    card?.media?.deliveryUrl,
    card?.media?.checksum,
  ].filter(value => typeof value === "string" && value);
}

async function readPrefix(store, prefix) {
  const listing = await store.list({ prefix });
  const keys = (listing?.blobs || [])
    .map(blob => blob?.key)
    .filter(key => typeof key === "string")
    .sort()
    .slice(0, MAX_EVENTS_PER_EDITION);
  const entries = await Promise.all(keys.map(key => store.get(key, { type: "json" })));
  return entries.filter(Boolean);
}

/** Per-position interaction weight for one published edition. */
export async function editionInteractionWeights(store, manifest) {
  const date = manifest?.publicationDate;
  const cards = Array.isArray(manifest?.cards) ? manifest.cards : [];
  const weights = new Array(cards.length).fill(0);
  if (!date || !cards.length) return weights;
  const [saves, exports] = await Promise.all([
    readPrefix(store, dailyCardSavePrefix(date)),
    readPrefix(store, dailyExportIndexPrefix(date)),
  ]);
  const netSaves = new Array(cards.length).fill(0);
  for (const entry of saves) {
    if (entry?.editionDate && entry.editionDate !== date) continue;
    const position = entry?.position;
    if (!Number.isInteger(position) || position < 0 || position >= cards.length) continue;
    netSaves[position] += entry.saved === false ? -1 : 1;
  }
  netSaves.forEach((value, position) => { weights[position] += Math.max(0, value); });
  const identityToPosition = new Map();
  cards.forEach((card, position) => {
    for (const identity of cardIdentities(card)) identityToPosition.set(identity, position);
  });
  for (const entry of exports) {
    if (manifest.actor?.id && entry?.actorId && entry.actorId !== manifest.actor.id) continue;
    const positions = new Set((entry?.imageIds || [])
      .map(imageId => identityToPosition.get(imageId))
      .filter(position => Number.isInteger(position)));
    for (const position of positions) weights[position] += ENGAGEMENT_EXPORT_WEIGHT;
  }
  return weights;
}

function signalsForCard(card) {
  const signals = [];
  const source = normalize(card?.source);
  if (source) signals.push(["sources", source]);
  const query = normalize(card?.query || card?.batchKey);
  if (query) signals.push(["queries", query]);
  return signals;
}

/**
 * Turn per-edition weights into transferable source/query preferences.
 * Each card's lift is its share of the edition's interactions minus an even
 * share; a signal needs repeated support before it counts either way.
 */
export function engagementProfileFromEditions(editions) {
  const tallies = new Map();
  let evidenceEditionCount = 0;
  let interactionWeight = 0;
  for (const { manifest, weights } of editions) {
    const cards = manifest?.cards || [];
    const total = weights.reduce((sum, value) => sum + value, 0);
    if (total < ENGAGEMENT_MIN_EDITION_WEIGHT || !cards.length) continue;
    evidenceEditionCount += 1;
    interactionWeight += total;
    const even = 1 / cards.length;
    cards.forEach((card, position) => {
      const lift = (weights[position] || 0) / total - even;
      for (const [family, value] of signalsForCard(card)) {
        const key = `${family}\u0000${value}`;
        const tally = tallies.get(key) || { family, value, liftSum: 0, cards: 0, editions: new Set(), weight: 0 };
        tally.liftSum += lift;
        tally.cards += 1;
        tally.editions.add(manifest.publicationDate);
        tally.weight += total;
        tallies.set(key, tally);
      }
    });
  }
  if (!evidenceEditionCount) return null;
  const profile = {
    version: "audience-engagement-v1",
    evidenceEditionCount,
    interactionWeight: Number(interactionWeight.toFixed(2)),
    positiveSources: [],
    negativeSources: [],
    positiveQueries: [],
    negativeQueries: [],
    signalLifts: {},
  };
  for (const tally of [...tallies.values()].sort((a, b) =>
    a.family.localeCompare(b.family) || a.value.localeCompare(b.value))) {
    if (tally.cards < ENGAGEMENT_MIN_SIGNAL_CARDS
      || tally.editions.size < ENGAGEMENT_MIN_SIGNAL_EDITIONS
      || tally.weight < ENGAGEMENT_MIN_SIGNAL_WEIGHT) continue;
    const meanLift = tally.liftSum / tally.cards;
    const label = tally.family === "sources" ? "Sources" : "Queries";
    if (meanLift >= ENGAGEMENT_LIFT_THRESHOLD) profile[`positive${label}`].push(tally.value);
    else if (meanLift <= -ENGAGEMENT_LIFT_THRESHOLD) profile[`negative${label}`].push(tally.value);
    else continue;
    profile.signalLifts[`${tally.family === "sources" ? "source" : "query"}:${tally.value}`] =
      Number(meanLift.toFixed(4));
  }
  const signalCount = profile.positiveSources.length + profile.negativeSources.length
    + profile.positiveQueries.length + profile.negativeQueries.length;
  if (!signalCount) return null;
  profile.fingerprint = createHash("sha256")
    .update(JSON.stringify([profile.positiveSources, profile.negativeSources,
      profile.positiveQueries, profile.negativeQueries]))
    .digest("hex")
    .slice(0, 16);
  return profile;
}

/**
 * Read a pairing's audience engagement profile from its recent editions.
 * Returns null when there is no qualifying evidence or storage is unavailable.
 */
export async function readPairEngagementProfile(store, pairHistory = [], {
  editions = ENGAGEMENT_HISTORY_EDITIONS,
} = {}) {
  if (!store?.list || !store?.get) return null;
  const recent = (Array.isArray(pairHistory) ? pairHistory : []).slice(0, Math.max(0, editions));
  if (!recent.length) return null;
  try {
    const measured = await Promise.all(recent.map(async manifest => ({
      manifest,
      weights: await editionInteractionWeights(store, manifest),
    })));
    return engagementProfileFromEditions(measured);
  } catch (error) {
    console.warn("Audience engagement unavailable; curating without it", {
      message: error?.message || String(error),
    });
    return null;
  }
}

/** Per-candidate audience signal in [-1, 1]; zero without a profile. */
export function candidateEngagement(result, profile) {
  if (!profile) return { score: 0, positive: [], negative: [] };
  const positive = [];
  const negative = [];
  const source = normalize(result?.source);
  const query = normalize(result?.batchKey || result?.query);
  const has = (list, value) => value && (list || []).includes(value);
  if (has(profile.positiveSources, source)) positive.push(`source:${source}`);
  if (has(profile.negativeSources, source)) negative.push(`source:${source}`);
  if (has(profile.positiveQueries, query)) positive.push(`query:${query}`);
  if (has(profile.negativeQueries, query)) negative.push(`query:${query}`);
  const score = Math.max(-1, Math.min(1, (positive.length - negative.length) / 2));
  return { score, positive, negative };
}

export function audienceEngagementBonus(board) {
  if (!board.some(candidate => candidate.engagement?.score)) return 0;
  const mean = board.reduce((sum, candidate) => sum + (candidate.engagement?.score || 0), 0)
    / Math.max(1, board.length);
  return Math.max(-ENGAGEMENT_BOARD_BONUS_CAP, Math.min(ENGAGEMENT_BOARD_BONUS_CAP,
    mean * ENGAGEMENT_BOARD_BONUS_CAP * 1.5));
}
