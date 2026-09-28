import { ACTOR_PACKS } from "./actor-packs.js";
import { getEligibility, isReleaseReady } from "./actor-eligibility.js";
import { candidateIdForResult } from "./grid-curation.js";
import {
  gridManifestKey,
  isGridManifest,
  materializePublicationManifest,
} from "./publication-manifest.js";
import { getShanghaiDateString } from "./date-seed.js";
import { STAR_OF_DAY_VERSION } from "../star-of-day.js";

const RETRY_AFTER_MS = 15 * 60 * 1000;

function sameApproval(left, right) {
  return isReleaseReady(right)
    && right.runId === left.runId
    && (right.rescueCalibrationApprovalId || null) === (left.rescueCalibrationApprovalId || null)
    && (right.rescueCalibrationApprovalEvidenceHash || null) === (left.rescueCalibrationApprovalEvidenceHash || null)
    && (right.rescueCalibrationRetirementHash || null) === (left.rescueCalibrationRetirementHash || null);
}

export function safeDailySnapshot(manifest) {
  if (!isGridManifest(manifest)) return null;
  return {
    kind: "vibe-atlas-daily-pack-snapshot",
    date: manifest.publicationDate,
    actorId: manifest.actor.id,
    vibeIdx: manifest.vibe.idx,
    // The catalog supplies a canonical only when this edition also has
    // substantive copy. A snapshot alone is not an indexable editorial page.
    cards: manifest.cards.map(card => ({
      position: card.position,
      title: card.title || "",
      thumbnailUrl: card.media.thumbnailUrl,
      deliveryUrl: card.media.deliveryUrl,
    })),
  };
}

/**
 * Freeze the first cached Daily Drop grid, never a subsequent Collector refresh.
 * Only the same approved pair's strong-read daily cache can supply candidates.
 */
export async function resolveDailyPackSnapshot({
  store,
  eligibilityStore,
  date,
  actorId,
  vibeIdx,
  packs = ACTOR_PACKS,
  eligibilityReader = getEligibility,
  materialize = materializePublicationManifest,
  today = getShanghaiDateString(),
}) {
  const actor = packs.find(item => item.id === actorId);
  const vibe = actor?.vibes?.[vibeIdx];
  if (!vibe || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")
    || date > today) return null;

  const approval = await eligibilityReader(eligibilityStore, actor, vibeIdx);
  if (!isReleaseReady(approval)) return null;
  const existing = await store.get(gridManifestKey(date), { type: "json", consistency: "strong" });
  if (existing) {
    return isGridManifest(existing) && existing.actor.id === actorId && existing.vibe.idx === vibeIdx
      ? safeDailySnapshot(existing)
      : null;
  }
  // Allow recent Daily Drops to recover a missed first snapshot, but never
  // launch unbounded historical media downloads from a public request.
  const oldestRecoverable = new Date(`${today}T00:00:00Z`);
  oldestRecoverable.setUTCDate(oldestRecoverable.getUTCDate() - 30);
  if (date < oldestRecoverable.toISOString().slice(0, 10)) return null;
  const retryKey = `vibeAtlas:daily-snapshot-retry:v1:${date}`;
  const previousFailure = await store.get(retryKey, { type: "json", consistency: "strong" });
  if (previousFailure?.at && Date.now() - Date.parse(previousFailure.at) < RETRY_AFTER_MS) {
    const error = new Error("Daily snapshot media registration is temporarily unavailable.");
    error.status = 503;
    throw error;
  }
  const cached = await store.get(`starOfDay:${STAR_OF_DAY_VERSION}:${date}`, {
    type: "json",
    consistency: "strong",
  });
  if (cached?.version !== STAR_OF_DAY_VERSION || cached.date !== date
    || cached.stale || cached.actorId !== actorId || cached.vibeIdx !== vibeIdx
    || !Array.isArray(cached.displayResults) || cached.displayResults.length !== 9) return null;
  const candidates = cached.displayResults.map(item => ({
    ...item,
    candidateId: item.candidateId || candidateIdForResult({
      ...item,
      batchKey: item.batchKey || item.query || "daily-drop",
    }),
  }));
  if (candidates.some(item => typeof item.thumbnail !== "string"
    || !item.thumbnail.startsWith("https://"))
    || new Set(candidates.map(item => item.candidateId)).size !== 9) return null;

  let result;
  try {
    result = await materialize({
      store,
      date,
      actor: {
        id: actor.id,
        name: actor.name,
        nameEn: actor.shortName_en || actor.shortName || actor.name,
        accentColor: actor.accentColor || "#c9a96e",
      },
      vibe: {
        key: `${actor.id}:${vibeIdx}`,
        idx: vibeIdx,
        label: vibe.label || vibe.label_en,
        labelEn: vibe.label_en || vibe.label,
        emoji: vibe.emoji || "✨",
        subtitle: vibe.subtitle || "",
        subtitleEn: vibe.subtitle_en || "",
        supportingCopy: vibe.supportingCopy || "",
        supportingCopyEn: vibe.supportingCopy_en || "",
        generationPrompt: vibe.mjPrompt || "",
      },
      board: { mode: cached.curation?.mode || "compiled", candidates },
      provenance: { sourceType: "daily_cache_snapshot", runId: approval.runId },
      validateBeforeCommit: async () => {
        if (!sameApproval(approval, await eligibilityReader(eligibilityStore, actor, vibeIdx))) {
          const error = new Error("The pairing approval changed before publication.");
          error.status = 409;
          throw error;
        }
      },
    });
  } catch (error) {
    // Keep a failed MEDIA provider from getting nine new requests per visitor.
    if (typeof store.setJSON === "function") {
      await store.setJSON(retryKey, { at: new Date().toISOString() });
    }
    throw error;
  }
  return safeDailySnapshot(result.manifest);
}