import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS as actorPacks } from "./lib/actor-packs.js";
import { searchOneQuery } from "./preview-search.js";
import { evaluateCandidates, rankCandidates, RANKED_BATCH_LIMIT } from "./lib/ranking.js";
import { getShanghaiDateString, shanghaiYesterday } from "./lib/date-seed.js";
import { candidateIdForResult, curateDisplayResults } from "./lib/grid-curation.js";
import {
  AESTHETIC_CLUSTER_VERSION,
  searchQueriesFor,
  IDENTITY_PROFILE_VERSION,
  VIBE_PROMISE_CONTRACT_VERSION,
  vibePromiseFor,
} from "./lib/actor-identity-profiles.js";
import {
  ELIGIBILITY_STORE,
  getEligibility,
  isReleaseReady,
  selectEligiblePair,
} from "./lib/actor-eligibility.js";
import {
  GRID_MANIFEST_PREFIX,
  boardHash as publicationBoardHash,
  gridManifestKey,
  manifestPayload,
  materializePublicationManifest,
  repairPublicationManifestPublicRecords,
} from "./lib/publication-manifest.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createBillingServices } from "./lib/billing.js";
import {
  archiveAccessDecision,
  archiveAccessWindowDates,
  ARCHIVE_ACCESS_WINDOW_KEY,
  ARCHIVE_CATALOG_KEY,
  archiveCatalogEditions,
  archiveEditionMetadata,
  enrichCanonicalLegendaryMisprint,
  archiveGateEnabled,
  ensureArchiveAccessWindow,
  listArchiveCatalogEditions,
  listArchiveCatalogPage,
  publicArchiveEdition,
  reconcileArchiveCatalogIndexes,
  repairArchiveCatalogPublicRecords,
  updateArchiveCatalog,
} from "./lib/archive-access.js";
import {
  archiveRepairErrorClassification,
  listArchiveRepairHistory,
  recordArchiveAccessCheck,
  recordArchiveRepairAttempt,
} from "./lib/archive-access-operations.js";
import { capabilitiesForMembership } from "./lib/capabilities.js";

// Server-side daily cache for "Star of the Day".
//
// Goal: the expensive search+rank flow (Brave -> SerpAPI cascade, per candidate
// query, then ranking) should run at most once per Asia/Shanghai calendar day,
// shared across every visitor — not once per browser session like before.
//
// Cache key: `starOfDay:v1:<Asia/Shanghai date>`. The "v1" prefix is a payload/
// generation-logic version: bump it (v2, v3, ...) if the shape of what's stored
// changes, so old-format entries are never read back as if they were current.
//
// Concurrency: a short-lived lock key (`<cacheKey>:lock`) is written before
// doing the expensive work using Netlify Blobs' conditional writes. Only the
// request that wins the lock computes; everyone else briefly polls the real
// cache key and reads whatever the winner produced. This stops simultaneous
// requests right after midnight from each independently re-running the
// whole search+rank ladder.
export const STAR_OF_DAY_VERSION = "v11";
const VERSION = STAR_OF_DAY_VERSION;
export const RECENT_DAILY_DROP_WINDOW_DAYS = 30;
// Legacy entries remain readable as historical editions; today's key is v11 so
// no pre-audit cache can satisfy the current day's scheduler.
const LEGACY_READ_VERSIONS = ["v10", "v9", "v8", "v7", "v6", "v5"];
// One excellent, human-approved board is enough to release. A second approved
// pairing remains useful inventory and range, but it is not a publication gate.
export const MIN_RELEASE_READY_PAIRS = 1;
const STORE_NAME = "star-of-day";
const LOCK_TTL_MS = 25000; // a stale/abandoned lock is ignored after this long
const POLL_INTERVAL_MS = 700;
const POLL_MAX_WAIT_MS = 12000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ARCHIVE_PAGE_SIZE = 24;
export const ARCHIVE_MAX_PAGE_SIZE = 100;
export const ARCHIVE_CATALOG_MIGRATION_MARKER_KEY =
  "archiveCatalog:v2:legacy-migration-complete";

function cacheKeyFor(dateString) {
  return `starOfDay:${VERSION}:${dateString}`;
}

async function getHistoricalPayload(store, dateString) {
  const manifested = manifestPayload(await store.get(gridManifestKey(dateString), {
    type: "json",
    consistency: "strong",
  }), VERSION);
  if (manifested) return manifested;
  for (const version of [VERSION, ...LEGACY_READ_VERSIONS]) {
    const payload = await store.get(`starOfDay:${version}:${dateString}`, { type: "json" });
    if (payload) return payload;
  }
  return null;
}

function lockKeyFor(dateString) {
  return `starOfDay:${VERSION}:${dateString}:lock`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Builds the full resolved display payload for a given Shanghai date string by
// running the actual search+rank flow. Only called by whichever request wins
// the lock for that date.
export async function buildPayloadForDate(
  dateString,
  eligibilityStore,
  {
    packs = actorPacks,
    evaluate = evaluateCandidates,
    search = searchOneQuery,
    rank = rankCandidates,
    curate = curateDisplayResults,
    generatedAt = () => new Date().toISOString(),
    publicationStore = null,
    materializePublication = null,
    mediaEnv = process.env,
    fetchImpl = fetch,
    selectedPair = null,
    excludedCollectorThumbnails = [],
    refreshCollectorSearch = false,
  } = {},
) {
  if (!selectedPair && !await hasReleaseReadyCohort(packs, eligibilityStore, MIN_RELEASE_READY_PAIRS)) return null;
  const recentHistory = publicationStore
    ? await readRecentDailyDropHistory(publicationStore, dateString)
    : [];
  const excluded = new Set();
  while (true) {
    const seed = selectedPair
      ? (() => {
        const aIdx = packs.findIndex(actor => actor?.id === selectedPair.actorId);
        const vIdx = Number(selectedPair.vibeIdx);
        return aIdx >= 0 && Number.isInteger(vIdx) && packs[aIdx]?.vibes?.[vIdx]
          ? { aIdx, vIdx }
          : null;
      })()
      : await selectRotatingReleasePair(
        packs,
        dateString,
        eligibilityStore,
        excluded,
        recentHistory,
      );
    if (!seed) return null;
    const actor = packs[seed.aIdx];
    const vibe = actor.vibes[seed.vIdx];
    const approval = await getEligibility(eligibilityStore, actor, seed.vIdx);
    if (!isReleaseReady(approval)) {
      if (selectedPair) return null;
      excluded.add(`${actor.id}:${seed.vIdx}`);
      continue;
    }
    const pairHistory = publicationStore
      ? await readPairPublicationHistory(publicationStore, actor.id, seed.vIdx, dateString)
      : [];
    const tryEditorialBackup = () => buildEditorialBackup({
      dateString,
      actor,
      vibe,
      seed,
      approval,
      eligibilityStore,
      publicationStore,
      materializePublication,
      mediaEnv,
      fetchImpl,
      generatedAt,
    });
    const searchQueries = searchQueriesFor(actor, seed.vIdx, approval.calibrationProfile);
    const candidates = await evaluate(
      searchQueries,
      refreshCollectorSearch ? query => search(query, { cacheMode: "refresh" }) : search,
    );
    let ranked = rank(candidates).slice(0, RANKED_BATCH_LIMIT);

    if (!ranked.length) {
      const backup = await tryEditorialBackup();
      if (backup) return backup;
      if (selectedPair) return null;
      excluded.add(`${actor.id}:${seed.vIdx}`);
      continue;
    }

    const curationOptions = {
      promise: vibePromiseFor(actor, seed.vIdx),
      calibrationProfile: approval.calibrationProfile || null,
      preferredCandidateIds: approval.calibrationProfile?.positiveCandidateIds || [],
      profileVersions: {
        identityProfileVersion: IDENTITY_PROFILE_VERSION,
        aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
        promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
      },
    };
    // Collector refreshes prefer new images without weakening image-safety gates.
    const excludedThumbnails = new Set(excludedCollectorThumbnails);
    const freshRanked = selectedPair && excludedThumbnails.size
      ? ranked.map(batch => ({
        ...batch,
        results: (batch.results || []).filter(result => !excludedThumbnails.has(result.thumbnail)),
      }))
      : ranked;
    let { displayResults, curation } = await curate(freshRanked, curationOptions);
    if (selectedPair && excludedThumbnails.size && displayResults.length < 9) {
      const mixedRanked = [
        ...freshRanked,
        ...ranked.map(batch => ({
          ...batch,
          results: (batch.results || []).filter(result => excludedThumbnails.has(result.thumbnail)),
        })),
      ];
      ({ displayResults, curation } = await curate(mixedRanked, curationOptions));
      if (displayResults.length < 9) {
        ({ displayResults, curation } = await curate(ranked, curationOptions));
      }
    }
    if (displayResults.length >= 9 && pairHistory.length) {
      const initialOverlap = greatestBoardOverlap(displayResults, pairHistory);
      if (initialOverlap >= 7) {
        const refreshedCandidates = await evaluate(
          searchQueries,
          query => search(query, { cacheMode: "refresh" }),
        );
        const refreshedRanked = rank(refreshedCandidates).slice(0, RANKED_BATCH_LIMIT);
        if (refreshedRanked.length) {
          const refreshed = await curate(refreshedRanked, {
            promise: vibePromiseFor(actor, seed.vIdx),
            calibrationProfile: approval.calibrationProfile || null,
            preferredCandidateIds: approval.calibrationProfile?.positiveCandidateIds || [],
            profileVersions: {
              identityProfileVersion: IDENTITY_PROFILE_VERSION,
              aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
              promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
            },
          });
          const refreshedOverlap = greatestBoardOverlap(refreshed.displayResults, pairHistory);
          if (refreshed.displayResults.length >= 9 && refreshedOverlap < initialOverlap) {
            ranked = refreshedRanked;
            displayResults = refreshed.displayResults;
            curation = refreshed.curation;
          }
        }
        curation = {
          ...curation,
          searchCacheRefreshed: true,
          priorPairingEditionCount: pairHistory.length,
        };
      }
      if (sameNineAsAny(displayResults, pairHistory)) {
        displayResults = rearrangeRepeatedNine(displayResults, pairHistory.length);
        curation = {
          ...curation,
          repeatedNineRearranged: true,
          priorPairingEditionCount: pairHistory.length,
          signals: [...new Set([...(curation?.signals || []), "repeat nine rearranged"])],
        };
      }
    }
    if (displayResults.length < 9) {
      const backup = await tryEditorialBackup();
      if (backup) return backup;
      if (selectedPair) return null;
      excluded.add(`${actor.id}:${seed.vIdx}`);
      continue;
    }
    if (!await selectedEligibilityIsCurrent(actor, seed.vIdx, eligibilityStore, approval)) {
      if (selectedPair) return null;
      excluded.add(`${actor.id}:${seed.vIdx}`);
      continue;
    }

    if (publicationStore && materializePublication) {
      try {
        const publicationBoard = {
          mode: curation?.mode || "compiled",
          candidates: displayResults.slice(0, 9).map(candidate => ({
            ...candidate,
            candidateId: candidate.candidateId || candidateIdForResult({
              ...candidate,
              batchKey: candidate.batchKey || candidate.query || "daily-drop",
            }),
          })),
        };
        const materialized = await materializePublication({
          store: publicationStore,
          date: dateString,
          actor: {
            id: actor.id,
            name: actor.name,
            nameEn: actor.shortName_en || actor.shortName || actor.name,
            accentColor: actor.accentColor || "#c9a96e",
          },
          vibe: {
            key: `${actor.id}:${seed.vIdx}`,
            idx: seed.vIdx,
            label: vibe.label || vibe.label_en || `${actor.id}:${seed.vIdx}`,
            labelEn: vibe.label_en || vibe.label || `${actor.id}:${seed.vIdx}`,
            emoji: vibe.emoji || "✨",
            subtitle: vibe.subtitle || "",
            subtitleEn: vibe.subtitle_en || vibe.subtitle || "",
            supportingCopy: vibe.supportingCopy || "",
            supportingCopyEn: vibe.supportingCopy_en || "",
            generationPrompt: vibe.mjPrompt || "",
          },
          board: publicationBoard,
          validateBeforeCommit: async () => {
            if (!await selectedEligibilityIsCurrent(
              actor,
              seed.vIdx,
              eligibilityStore,
              approval,
            )) {
              const error = new Error("This actor pack changed after Daily Drop selection.");
              error.status = 409;
              throw error;
            }
          },
          provenance: {
            sourceType: "daily_curation",
            runId: approval.runId || null,
            curationVersion: curation?.curationVersion || null,
          },
          env: mediaEnv,
          fetchImpl,
          now: generatedAt,
        });
        const archiveEdition = archiveEditionMetadata(materialized.payload);
        if (archiveEdition) {
          await updateArchiveCatalog(publicationStore, archiveEdition, generatedAt);
        }
        return materialized.payload;
      } catch {
        const backup = await tryEditorialBackup();
        if (backup) return backup;
        excluded.add(`${actor.id}:${seed.vIdx}`);
        continue;
      }
    }

    if (!await selectedEligibilityIsCurrent(actor, seed.vIdx, eligibilityStore, approval)) {
      excluded.add(`${actor.id}:${seed.vIdx}`);
      continue;
    }
    return {
      version: VERSION,
      date: dateString,
      actorId: actor.id,
      actorIdx: seed.aIdx,
      actorName: actor.name,
      actorShortNameEn: actor.shortName_en,
      actorAccentColor: actor.accentColor,
      vibeIdx: seed.vIdx,
      vibeEmoji: vibe.emoji,
      vibeLabel: vibe.label,
      vibeLabelEn: vibe.label_en,
      vibeSubtitle: vibe.subtitle,
      vibeSubtitleEn: vibe.subtitle_en,
      vibeSupportingCopy: vibe.supportingCopy,
      vibeSupportingCopyEn: vibe.supportingCopy_en,
      generationPrompt: vibe.mjPrompt,
      generationQuery: ranked[0]?.query,
      rankedBatches: ranked,
      displayResults,
      curation,
      generatedAt: generatedAt(),
    };
  }
}

async function buildEditorialBackup({
  dateString,
  actor,
  vibe,
  seed,
  approval,
  eligibilityStore,
  publicationStore,
  materializePublication,
  mediaEnv,
  fetchImpl,
  generatedAt,
}) {
  if (!await selectedEligibilityIsCurrent(actor, seed.vIdx, eligibilityStore, approval)) {
    return null;
  }
  const candidates = [
    ...(approval.calibrationProfile?.backupBoards || [])
      .filter(board => board.publishable === true),
    ...(approval.publicationSource?.type === "operator_rescue" && approval.publicationBoard
      ? [{
        sourceRescueReceiptId: approval.publicationSource.rescueReceiptId,
        sourceRunId: approval.runId || null,
        candidates: approval.publicationBoard.candidates,
        publishable: true,
      }]
      : []),
  ];
  const publishedHashes = publicationStore
    ? await readPublishedBoardHashes(publicationStore, dateString)
    : new Set();
  const seen = new Set();
  for (const candidate of candidates) {
    const board = {
      mode: "operator_rescue_backup",
      candidates: (candidate.candidates || []).slice(0, 9).map(item => ({
        ...item,
        candidateId: item.candidateId || candidateIdForResult({
          ...item,
          batchKey: item.batchKey || item.query || "editorial-backup",
        }),
      })),
    };
    if (board.candidates.length !== 9
      || new Set(board.candidates.map(item => item.candidateId)).size !== 9
      || board.candidates.some(item => !item.thumbnail)) continue;
    const hash = publicationBoardHash(board);
    if (seen.has(hash) || publishedHashes.has(hash)) continue;
    seen.add(hash);
    const provenance = {
      sourceType: "operator_rescue_backup",
      runId: approval.runId || candidate.sourceRunId || null,
      rescueReceiptId: candidate.sourceRescueReceiptId || null,
      calibrationEvidence: true,
      explicitlyPublishable: true,
    };
    if (publicationStore && materializePublication) {
      try {
        const materialized = await materializePublication({
          store: publicationStore,
          date: dateString,
          actor: {
            id: actor.id,
            name: actor.name,
            nameEn: actor.shortName_en || actor.shortName || actor.name,
            accentColor: actor.accentColor || "#c9a96e",
          },
          vibe: {
            key: `${actor.id}:${seed.vIdx}`,
            idx: seed.vIdx,
            label: vibe.label || vibe.label_en || `${actor.id}:${seed.vIdx}`,
            labelEn: vibe.label_en || vibe.label || `${actor.id}:${seed.vIdx}`,
            emoji: vibe.emoji || "✨",
            subtitle: vibe.subtitle || "",
            subtitleEn: vibe.subtitle_en || vibe.subtitle || "",
            supportingCopy: vibe.supportingCopy || "",
            supportingCopyEn: vibe.supportingCopy_en || "",
            generationPrompt: vibe.mjPrompt || "",
          },
          board,
          validateBeforeCommit: async () => {
            if (!await selectedEligibilityIsCurrent(
              actor,
              seed.vIdx,
              eligibilityStore,
              approval,
            )) {
              const error = new Error("This actor pack changed after backup selection.");
              error.status = 409;
              throw error;
            }
          },
          provenance,
          env: mediaEnv,
          fetchImpl,
          now: generatedAt,
        });
        const archiveEdition = archiveEditionMetadata(materialized.payload);
        if (archiveEdition) {
          await updateArchiveCatalog(publicationStore, archiveEdition, generatedAt);
        }
        return materialized.payload;
      } catch {
        continue;
      }
    }
    if (!await selectedEligibilityIsCurrent(actor, seed.vIdx, eligibilityStore, approval)) {
      return null;
    }
    return dailyPayload({
      dateString,
      actor,
      vibe,
      seed,
      ranked: [],
      displayResults: board.candidates,
      curation: {
        mode: "operator_rescue_backup",
        version: 1,
        rationale: "Fresh curation was unavailable, so an unused approved editorial board was published.",
        signals: [],
      },
      generatedAt,
    });
  }
  return null;
}

async function readPublishedBoardHashes(store, beforeDate) {
  const manifests = await readPublicationManifests(store, beforeDate);
  return new Set(manifests
    .map(manifest => manifest?.boardHash)
    .filter(hash => typeof hash === "string"));
}

async function readPairPublicationHistory(store, actorId, vibeIdx, beforeDate) {
  const manifests = await readPublicationManifests(store, beforeDate);
  return manifests
    .filter(manifest =>
      manifest?.actor?.id === actorId
      && manifest?.vibe?.idx === vibeIdx
      && Array.isArray(manifest.cards)
      && manifest.cards.length === 9)
    .sort((left, right) =>
      String(right.publicationDate || "").localeCompare(String(left.publicationDate || "")));
}

export async function readRecentDailyDropHistory(
  store,
  throughDate,
  windowDays = RECENT_DAILY_DROP_WINDOW_DAYS,
) {
  const safeWindowDays = Number.isInteger(windowDays) && windowDays > 0
    ? windowDays
    : RECENT_DAILY_DROP_WINDOW_DAYS;
  const dates = Array.from(
    { length: safeWindowDays },
    (_, offset) => calendarDateOffset(throughDate, -offset),
  );
  const manifests = await Promise.all(dates.map(date =>
    store.get(gridManifestKey(date), { type: "json", consistency: "strong" })));
  return manifests
    .filter(manifest => manifest?.publicationDate && dates.includes(manifest.publicationDate))
    .sort((left, right) =>
      String(right.publicationDate || "").localeCompare(String(left.publicationDate || "")));
}

export async function selectRotatingReleasePair(
  packs,
  dateString,
  eligibilityStore,
  excluded = new Set(),
  recentHistory = [],
) {
  const recentPairKeys = new Set(recentHistory
    .filter(manifest => manifest?.publicationDate < dateString)
    .map(manifest => {
      const actorId = manifest?.actor?.id;
      const vibeIdx = manifest?.vibe?.idx;
      return typeof actorId === "string" && Number.isInteger(vibeIdx)
        ? `${actorId}:${vibeIdx}`
        : null;
    })
    .filter(Boolean));
  const yesterday = calendarDateOffset(dateString, -1);
  const yesterdayActors = new Set(recentHistory
    .filter(manifest => manifest?.publicationDate === yesterday)
    .map(manifest => manifest?.actor?.id)
    .filter(actorId => typeof actorId === "string"));
  const yesterdayActorPairs = new Set(packs.flatMap(actor =>
    yesterdayActors.has(actor.id)
      ? (actor.vibes || []).map((_, vibeIdx) => `${actor.id}:${vibeIdx}`)
      : []));
  const strategies = [
    new Set([...recentPairKeys, ...yesterdayActorPairs]),
    recentPairKeys,
    yesterdayActorPairs,
    new Set(),
  ];
  for (const rotationExclusions of strategies) {
    const candidate = await selectEligiblePair(
      packs,
      dateString,
      eligibilityStore,
      new Set([...excluded, ...rotationExclusions]),
    );
    if (candidate) return candidate;
  }
  return null;
}

export async function readDailyDropHistory(store, throughDate) {
  const listing = await store.list({ prefix: GRID_MANIFEST_PREFIX });
  const manifests = await Promise.all((listing?.blobs || [])
    .filter(blob => typeof blob?.key === "string"
      && blob.key.slice(GRID_MANIFEST_PREFIX.length) <= throughDate)
    .map(blob => store.get(blob.key, { type: "json", consistency: "strong" })));
  return manifests
    .filter(manifest => manifest?.publicationDate && manifest.publicationDate <= throughDate)
    .sort((left, right) =>
      String(right.publicationDate || "").localeCompare(String(left.publicationDate || "")));
}

async function readPublicationManifests(store, beforeDate) {
  const listing = await store.list({ prefix: GRID_MANIFEST_PREFIX });
  return Promise.all((listing?.blobs || [])
    .filter(blob => typeof blob?.key === "string"
      && blob.key.slice(GRID_MANIFEST_PREFIX.length) < beforeDate)
    .map(blob => store.get(blob.key, { type: "json", consistency: "strong" })));
}

function calendarDateOffset(dateString, days) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function candidateKeys(candidate) {
  return [
    candidate?.candidateId,
    candidate?.thumbnail,
    candidate?.sourceUrl,
  ].filter(Boolean);
}

function manifestCandidateKeys(manifest) {
  return new Set((manifest?.cards || []).flatMap(candidateKeys));
}

function greatestBoardOverlap(displayResults, history) {
  if (!Array.isArray(displayResults) || displayResults.length < 9) return 0;
  return Math.max(0, ...history.map(manifest => {
    const prior = manifestCandidateKeys(manifest);
    return displayResults.slice(0, 9).filter(candidate =>
      candidateKeys(candidate).some(key => prior.has(key))).length;
  }));
}

function sameNineAsAny(displayResults, history) {
  if (!Array.isArray(displayResults) || displayResults.length < 9) return false;
  return history.some(manifest => {
    const prior = manifestCandidateKeys(manifest);
    return displayResults.slice(0, 9).every(candidate =>
      candidateKeys(candidate).some(key => prior.has(key)));
  });
}

function rearrangeRepeatedNine(displayResults, priorPairingEditionCount) {
  const board = displayResults.slice(0, 9);
  const hero = board[4];
  const outer = board.filter((_, index) => index !== 4);
  const shift = (priorPairingEditionCount % outer.length) + 1;
  const rotated = [...outer.slice(shift), ...outer.slice(0, shift)];
  return [
    ...rotated.slice(0, 4),
    hero,
    ...rotated.slice(4),
  ];
}

function dailyPayload({
  dateString,
  actor,
  vibe,
  seed,
  ranked,
  displayResults,
  curation,
  generatedAt,
}) {
  return {
    version: VERSION,
    date: dateString,
    actorId: actor.id,
    actorIdx: seed.aIdx,
    actorName: actor.name,
    actorShortNameEn: actor.shortName_en,
    actorAccentColor: actor.accentColor,
    vibeIdx: seed.vIdx,
    vibeEmoji: vibe.emoji,
    vibeLabel: vibe.label,
    vibeLabelEn: vibe.label_en,
    vibeSubtitle: vibe.subtitle,
    vibeSubtitleEn: vibe.subtitle_en,
    vibeSupportingCopy: vibe.supportingCopy,
    vibeSupportingCopyEn: vibe.supportingCopy_en,
    generationPrompt: vibe.mjPrompt,
    generationQuery: ranked[0]?.query,
    rankedBatches: ranked,
    displayResults,
    curation,
    generatedAt: generatedAt(),
  };
}

// Attempts to acquire the build lock for a date. Returns true if this request
// now owns it (and must build + save), false if someone else already holds it
// (or held it recently enough that it's not considered stale).
//
// NOTE: this is intentionally NOT a strictly atomic compare-and-swap. We
// originally used `setJSON(key, value, { onlyIfNew: true })` and checked the
// returned `{ modified }` flag (per @netlify/blobs' documented API), but the
// Blobs store instance obtained via the V2 function `context.blobs` on this
// project's deploy previews does not return that result object at all
export async function tryAcquireLock(store, dateString) {
  const lockKey = lockKeyFor(dateString);
  const now = Date.now();
  const token = `${now}-${Math.random().toString(36).slice(2)}`;
  const lock = {
    startedAt: now,
    token,
  };

  // Conditional writes are the compare-and-swap primitive exposed by
  // Netlify Blobs. Reclaim an expired lock only if the ETag we read is still
  // current; otherwise another request owns it and must build or poll.
  const existing = typeof store.getWithMetadata === "function"
    ? await store.getWithMetadata(lockKey, { type: "json", consistency: "strong" })
    : null;
  if (existing?.data?.startedAt && now - existing.data.startedAt <= LOCK_TTL_MS) {
    return null;
  }
  const write = await store.setJSON(
    lockKey,
    lock,
    existing?.etag ? { onlyIfMatch: existing.etag } : { onlyIfNew: true },
  );
  if (write?.modified === false) return null;
  return lock;
}

export async function releaseLock(store, dateString, lock) {
  try {
    const current = typeof store.get === "function"
      ? await store.get(lockKeyFor(dateString), { type: "json", consistency: "strong" })
      : null;
    if (!lock || current?.token === lock.token) {
      await store.delete(lockKeyFor(dateString));
    }
  } catch (e) {
    // Non-fatal — an abandoned lock just expires via LOCK_TTL_MS.
  }
}

export function createStarOfDayHandler({
  env = process.env,
  auth = createPublicAuth({ env, getStore: getBlobStore }),
  billing = createBillingServices({ env }),
  getStore = getBlobStore,
  getDiagnosticsStore = context => getBlobStore("archive-access-operations", context),
  repairArchiveLinks = repairArchiveCatalogPublicRecords,
  repairPublicationLinks = repairPublicationManifestPublicRecords,
  today = getShanghaiDateString,
  now = () => new Date(),
} = {}) {
  return async (req, context) => {
  if (req.method && req.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const store = getStore(STORE_NAME, context);
    const eligibilityStore = getStore(ELIGIBILITY_STORE, context);
    const todayStr = today();
    const url = new URL(req.url || "https://fandom.local/.netlify/functions/star-of-day");

    if (url.searchParams.get("readerLinkRepair") === "1") {
      try {
        await auth.authenticateAdmin(req, context);
      } catch (error) {
        return jsonResponse(error?.status === 403 ? 403 : 401, {
          error: error?.message || "Admin access is required.",
        }, { "Cache-Control": "private, no-store" });
      }
      const archiveCursor = url.searchParams.get("archiveRepairCursor");
      const publicationCursor = url.searchParams.get("publicationRepairCursor");
      if ((archiveCursor && !/^\d{4}-\d{2}-\d{2}$/.test(archiveCursor))
        || (publicationCursor && publicationCursor.length > 512)) {
        return jsonResponse(400, { error: "Invalid reader-link repair cursor." });
      }
      const [archive, publications] = await Promise.all([
        repairArchiveLinks(store, {
          throughDate: todayStr,
          ...(archiveCursor ? { cursor: archiveCursor } : {}),
        }),
        repairPublicationLinks(store, {
          ...(publicationCursor ? { cursor: publicationCursor } : {}),
        }),
      ]);
      return jsonResponse(200, {
        readerLinkRepair: { archive, publications },
      }, {
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
      });
    }

    if (url.searchParams.get("archiveRepair") === "1"
      || url.searchParams.get("archiveRepairHistory") === "1") {
      let admin;
      try {
        admin = await auth.authenticateAdmin(req, context);
      } catch (error) {
        return jsonResponse(error?.status === 403 ? 403 : 401, {
          error: error?.message || "Admin access is required.",
        }, { "Cache-Control": "private, no-store" });
      }
      const diagnosticsStore = getDiagnosticsStore(context);
      if (url.searchParams.get("archiveRepairHistory") === "1") {
        const history = await listArchiveRepairHistory(diagnosticsStore);
        return jsonResponse(200, { history }, {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        });
      }
      const cursor = url.searchParams.get("repairCursor");
      if (cursor !== null && (cursor.length < 1 || cursor.length > 512)) {
        await recordArchiveRepairAttempt(diagnosticsStore, {
          operatorId: admin?.user?.accountId || admin?.accountId,
          attemptedAt: now(),
          scanned: 0,
          errorClassification: "invalid_request",
        });
        return jsonResponse(400, { error: "Invalid archive repair cursor." }, {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        });
      }
      const attemptedAt = now();
      let reconciliation;
      try {
        reconciliation = await reconcileArchiveCatalogIndexes(store, {
          throughDate: todayStr,
          ...(cursor ? { cursor } : {}),
        });
      } catch (error) {
        await recordArchiveRepairAttempt(diagnosticsStore, {
          operatorId: admin?.user?.accountId || admin?.accountId,
          attemptedAt,
          scanned: Number.isSafeInteger(error?.reconciliationScanned)
            ? error.reconciliationScanned
            : 0,
          errorClassification: archiveRepairErrorClassification(error),
          affectedResource: error?.archiveResourceKey || error?.archiveResource,
        });
        console.error("[archive-catalogue] reconciliation failed", {
          classification: archiveRepairErrorClassification(error),
        });
        return jsonResponse(500, { error: "Archive repair failed." }, {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        });
      }
      try {
        await recordArchiveRepairAttempt(diagnosticsStore, {
          operatorId: admin?.user?.accountId || admin?.accountId,
          attemptedAt,
          scanned: reconciliation.scanned,
          repairedDates: reconciliation.missingDates,
          nextCursor: reconciliation.nextCursor,
        });
      } catch {
        console.error("[archive-catalogue] reconciliation receipt unavailable", {
          outcome: reconciliation.repaired > 0 ? "repaired" : "no_op",
        });
        return jsonResponse(500, {
          error: "Archive repair completed, but its receipt could not be confirmed.",
        }, {
          "Cache-Control": "private, no-store",
          Vary: "Cookie",
        });
      }
      console.info("[archive-catalogue] reconciliation completed", {
        scanned: reconciliation.scanned,
        repaired: reconciliation.repaired,
        dates: reconciliation.missingDates,
        moreRecordsRemain: Boolean(reconciliation.nextCursor),
      });
      return jsonResponse(200, { reconciliation }, {
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
      });
    }

    if (url.searchParams.get("archive") === "1") {
      const archivePage = parseArchivePage(url.searchParams);
      if (!archivePage) {
        return jsonResponse(400, { error: "Invalid archive pagination." });
      }
      return jsonResponse(200, await listArchivedEditions(store, todayStr, archivePage), {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      });
    }

    const requestedDate = url.searchParams.get("date");
    if (requestedDate !== null) {
      if (!isUsableDate(requestedDate)) {
        return jsonResponse(400, { error: "Invalid edition date." });
      }
      if (requestedDate > todayStr) {
        return jsonResponse(400, { error: "Future editions are not available." });
      }

      // Historical editions are read-only cache entries. In particular, do
      // not run today's build/lock/fallback flow for an older date.
      if (requestedDate !== todayStr) {
        const archived = await getHistoricalPayload(store, requestedDate);
        if (!archived) {
          return jsonResponse(404, { error: "That Vibe Atlas edition is not available." });
        }
        let accessWindow = await store.get(ARCHIVE_ACCESS_WINDOW_KEY, {
          type: "json",
          consistency: "strong",
        });
        if (!accessWindow) {
          accessWindow = await backfillArchiveAccessWindow(store, todayStr);
        }
        const freeDates = archiveAccessWindowDates(accessWindow);
        let session = null;
        let membership = null;
        if (!freeDates.has(requestedDate) && archiveGateEnabled(env)) {
          try {
            session = await auth.authenticate(req, context);
          } catch (error) {
            if (error?.status !== 401) throw error;
          }
          if (session) {
            try {
              await billing.initialize(context);
              membership = await billing.repository(context)
                .membershipForAccount(session.user.accountId);
            } catch (error) {
              console.error("[archive-access] membership lookup failed", {
                date: requestedDate,
                name: error?.name || "Error",
              });
              await recordArchiveDiagnostic(
                () => getDiagnosticsStore(context),
                { outcome: "billing_delay", authenticated: true },
                now(),
              );
              return jsonResponse(503, {
                error: "archive_billing_unavailable",
                access: "billing_delay",
                edition: publicArchiveEdition(archived),
              });
            }
          }
        }
        const decision = archiveAccessDecision({
          requestedDate,
          editions: [],
          freeDates,
          session,
          membership,
          capabilities: capabilitiesForMembership(membership, env),
          enforcementEnabled: archiveGateEnabled(env),
        });
        if (!decision.allowed) {
          console.info("[archive-access] full edition denied", {
            date: requestedDate,
            reason: decision.reason,
          });
          await recordArchiveDiagnostic(
            () => getDiagnosticsStore(context),
            {
              outcome: decision.reason,
              authenticated: Boolean(session),
            },
            now(),
          );
          return jsonResponse(decision.reason === "sign_in" ? 401 : 403, {
            error: "archive_access_required",
            access: decision.reason,
            capability: decision.capability,
            edition: publicArchiveEdition(archived),
          });
        }
        if (session) {
          await recordArchiveDiagnostic(
            () => getDiagnosticsStore(context),
            { outcome: "allowed", authenticated: true },
            now(),
          );
        }
        return jsonResponse(200, archived, {
          "Cache-Control": decision.reason === "active_member"
            ? "private, no-store"
            : "public, max-age=300",
          ...(decision.reason === "active_member" ? { Vary: "Cookie" } : {}),
          "X-Archive-Access": decision.reason,
        });
      }
    }

    const todayKey = cacheKeyFor(todayStr);
    const manifested = manifestPayload(await store.get(gridManifestKey(todayStr), {
      type: "json",
      consistency: "strong",
    }), VERSION);
    if (manifested) return jsonResponse(200, manifested);

    const cached = await store.get(todayKey, { type: "json" });
    if (cached && await cachedPairIsEligible(
      cached,
      eligibilityStore,
      actorPacks,
    )) {
      return jsonResponse(200, cached);
    }
    if (cached) await store.delete(todayKey);

    const lock = await tryAcquireLock(store, todayStr);

    if (lock) {
      try {
        const payload = await buildPayloadForDate(todayStr, eligibilityStore, {
          publicationStore: store,
          materializePublication: materializePublicationManifest,
          mediaEnv: process.env,
        });
        if (payload) {
          // First-write-wins re-check: because tryAcquireLock() is a best-effort
          // read-then-write check (not a strict atomic compare-and-swap — see
          // its comment above for why), two simultaneous first-of-the-day
          // requests can both believe they hold the lock and both build a
          // payload here. Even though ranking and curation are deterministic,
          // upstream search responses can change while both builds run. Re-fetch the
          // real cache key one more time immediately before writing: if a
          // racing request already wrote a result while we were building, defer
          // to it and discard our own payload, so whichever build finished
          // first is the one that sticks for the rest of the day.
          const raceWinner = await store.get(todayKey, { type: "json" });
          if (raceWinner && await cachedPairIsEligible(
            raceWinner,
            eligibilityStore,
            actorPacks,
          )) {
            return jsonResponse(200, raceWinner);
          }
          if (raceWinner) await store.delete(todayKey);

          if (await cachedPairIsEligible(
            payload,
            eligibilityStore,
            actorPacks,
          )) {
            await store.setJSON(todayKey, payload);
            if (await cachedPairIsEligible(
              payload,
              eligibilityStore,
              actorPacks,
            )) {
              return jsonResponse(200, payload);
            }
            await store.delete(todayKey);
          }
        }

        // Today's build produced nothing acceptable — graceful degrade to
        // yesterday's cached winner rather than a hard failure, if available.
    const fallback = await tryYesterdayFallback(store, eligibilityStore, todayStr);
        if (fallback) return jsonResponse(200, fallback);

        return jsonResponse(200, {
          version: VERSION,
          date: todayStr,
          error: "no_acceptable_batch",
          rankedBatches: []
        });
      } finally {
        await releaseLock(store, todayStr, lock);
      }
    }

    // Someone else is building — poll the real cache key briefly instead of
    // duplicating the expensive work.
    const waited = await pollForCache(store, eligibilityStore, todayKey, todayStr);
    if (waited) return jsonResponse(200, waited);

    // Still building after our patience budget — try yesterday's cache so the
    // visitor gets something rather than a spinner-forever state, then fall
    // back to an explicit "still building" response.
    const fallback = await tryYesterdayFallback(store, eligibilityStore, todayStr);
    if (fallback) return jsonResponse(200, fallback);

    return jsonResponse(202, {
      version: VERSION,
      date: todayStr,
      building: true,
      rankedBatches: []
    });
  } catch (err) {
    return jsonResponse(500, { error: err.message || "Unknown error", rankedBatches: [] });
  }
  };
}

async function recordArchiveDiagnostic(getStore, event, date) {
  try {
    await recordArchiveAccessCheck(getStore(), event, date);
  } catch (error) {
    console.error("[archive-access] diagnostic write failed", {
      outcome: event.outcome,
      name: error?.name || "Error",
    });
  }
}

export default createStarOfDayHandler();

function isUsableDate(value) {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseArchivePage(searchParams) {
  const cursor = searchParams.get("cursor");
  if (cursor !== null && !isUsableDate(cursor)) return null;
  const rawLimit = searchParams.get("limit");
  if (rawLimit === null) return { cursor, limit: ARCHIVE_PAGE_SIZE };
  if (!/^\d+$/.test(rawLimit)) return null;
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ARCHIVE_MAX_PAGE_SIZE) return null;
  return { cursor, limit };
}

async function listArchivedEditions(
  store,
  todayStr,
  { cursor = null, limit = ARCHIVE_PAGE_SIZE } = {},
) {
  const existing = await store.get(ARCHIVE_CATALOG_KEY, {
    type: "json",
    consistency: "strong",
  });
  const legacyEditions = existing ? archiveCatalogEditions(existing) : null;
  if (existing && !legacyEditions) {
    throw new Error("The archive catalogue is invalid.");
  }
  if (legacyEditions) {
    await Promise.all(legacyEditions.map(edition => updateArchiveCatalog(store, edition)));
    if (typeof store.delete === "function") await store.delete(ARCHIVE_CATALOG_KEY);
  }
  let catalogPage = await listArchiveCatalogPage(store, {
    cursor,
    limit,
    throughDate: todayStr,
  });
  const migrationMarker = await store.get(ARCHIVE_CATALOG_MIGRATION_MARKER_KEY, {
    type: "json",
    consistency: "strong",
  });
  const migrationComplete = migrationMarker?.schemaVersion === 1
    && migrationMarker?.catalogVersion === 2;
  if (!migrationComplete && !legacyEditions) {
    await migrateArchiveCatalog(store, todayStr);
    await store.setJSON(ARCHIVE_CATALOG_MIGRATION_MARKER_KEY, {
      schemaVersion: 1,
      catalogVersion: 2,
    });
    catalogPage = await listArchiveCatalogPage(store, {
      cursor,
      limit,
      throughDate: todayStr,
    });
  } else if (!migrationComplete && legacyEditions) {
    await store.setJSON(ARCHIVE_CATALOG_MIGRATION_MARKER_KEY, {
      schemaVersion: 1,
      catalogVersion: 2,
    });
  }
  const existingAccessWindow = await store.get(ARCHIVE_ACCESS_WINDOW_KEY, {
    type: "json",
    consistency: "strong",
  });
  const accessWindowSeed = existingAccessWindow
    ? catalogPage.editions
    : (await listArchiveCatalogPage(store, {
      limit: 4,
      throughDate: todayStr,
    })).editions;
  const accessWindow = await ensureArchiveAccessWindow(
    store,
    accessWindowSeed.map(edition => edition.date),
  );
  const freeDates = archiveAccessWindowDates(accessWindow);
  const page = catalogPage.editions;
  const hasMore = catalogPage.hasMore;
  return {
    version: VERSION,
    editions: page.map(edition => ({
      ...enrichCanonicalLegendaryMisprint(edition),
      access: freeDates.has(edition.date) ? "free" : "member",
    })),
    page: {
      limit,
      nextCursor: hasMore ? page.at(-1)?.date || null : null,
      hasMore,
      total: catalogPage.total,
    },
  };
}

async function migrateArchiveCatalog(store, todayStr) {
  const [listing, manifestListing] = await Promise.all([
    store.list({ prefix: "starOfDay:" }),
    store.list({ prefix: GRID_MANIFEST_PREFIX }),
  ]);
  const availableVersions = new Set([VERSION, ...LEGACY_READ_VERSIONS]);
  const versionsByDate = new Map();
  (listing?.blobs || [])
    .map(blob => blob?.key)
    .filter(key => typeof key === "string")
    .forEach(key => {
      const match = key.match(/^starOfDay:(v\d+):(\d{4}-\d{2}-\d{2})$/);
      if (!match || !availableVersions.has(match[1]) || match[2] > todayStr) return;
      const existing = versionsByDate.get(match[2]);
      if (!existing || match[1] === VERSION) versionsByDate.set(match[2], match[1]);
    });
  (manifestListing?.blobs || [])
    .map(blob => blob?.key)
    .filter(key => typeof key === "string")
    .forEach(key => {
      const date = key.slice(GRID_MANIFEST_PREFIX.length);
      if (isUsableDate(date) && date <= todayStr) versionsByDate.set(date, "manifest");
    });
  const editions = await Promise.all([...versionsByDate].map(async ([date, version]) => {
    const payload = version === "manifest"
      ? manifestPayload(await store.get(gridManifestKey(date), {
        type: "json",
        consistency: "strong",
      }), VERSION)
      : await store.get(`starOfDay:${version}:${date}`, { type: "json" });
    if (!payload || payload.date !== date) return null;
    return archiveEditionMetadata(payload);
  }));
  if (editions.some(edition => !edition)) {
    throw new Error("The archive catalogue migration found an invalid edition.");
  }
  await Promise.all(editions.map(edition => updateArchiveCatalog(store, edition)));
  return listArchiveCatalogEditions(store);
}

async function backfillArchiveAccessWindow(store, todayStr) {
  const [legacyListing, manifestListing] = await Promise.all([
    store.list({ prefix: "starOfDay:" }),
    store.list({ prefix: GRID_MANIFEST_PREFIX }),
  ]);
  const availableVersions = new Set([VERSION, ...LEGACY_READ_VERSIONS]);
  const dates = new Set();
  for (const blob of legacyListing?.blobs || []) {
    const match = String(blob?.key || "").match(/^starOfDay:(v\d+):(\d{4}-\d{2}-\d{2})$/);
    if (match && availableVersions.has(match[1]) && match[2] <= todayStr) dates.add(match[2]);
  }
  for (const blob of manifestListing?.blobs || []) {
    const key = String(blob?.key || "");
    const date = key.slice(GRID_MANIFEST_PREFIX.length);
    if (key.startsWith(GRID_MANIFEST_PREFIX) && isUsableDate(date) && date <= todayStr) {
      dates.add(date);
    }
  }
  return ensureArchiveAccessWindow(store, [...dates]);
}

async function pollForCache(store, eligibilityStore, todayKey, todayStr) {
  const deadline = Date.now() + POLL_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const manifested = manifestPayload(await store.get(gridManifestKey(todayStr), {
      type: "json",
      consistency: "strong",
    }), VERSION);
    if (manifested) return manifested;
    const cached = await store.get(todayKey, { type: "json" });
    if (cached && await cachedPairIsEligible(
      cached,
      eligibilityStore,
      actorPacks,
    )) return cached;
  }
  return null;
}

async function tryYesterdayFallback(store, eligibilityStore, todayStr) {
  try {
    const yesterdayStr = shanghaiYesterday(todayStr);
    const yesterdayCached = await getHistoricalPayload(store, yesterdayStr);
    if (yesterdayCached && await cachedPairIsEligible(
      yesterdayCached,
      eligibilityStore,
      actorPacks,
    )) {
      return { ...yesterdayCached, stale: true, staleReason: "yesterday_fallback", date: todayStr, originalDate: yesterdayCached.date };
    }
  } catch (e) {
    // No usable fallback — caller handles the empty case.
  }
  return null;
}

export async function cachedPairIsEligible(
  payload,
  eligibilityStore,
  packs = actorPacks,
) {
  if (!Number.isInteger(payload?.vibeIdx) || typeof payload?.actorId !== "string") return false;
  if (!await hasReleaseReadyCohort(packs, eligibilityStore)) return false;
  const actor = packs.find(item => item.id === payload.actorId);
  return Boolean(actor?.vibes?.[payload.vibeIdx])
    && await pairIsReleaseReady(actor, payload.vibeIdx, eligibilityStore)
    && await hasReleaseReadyCohort(
      packs,
      eligibilityStore,
      MIN_RELEASE_READY_PAIRS,
    );
}

async function pairIsReleaseReady(actor, vibeIdx, eligibilityStore) {
  return isReleaseReady(await getEligibility(eligibilityStore, actor, vibeIdx));
}

async function selectedEligibilityIsCurrent(actor, vibeIdx, eligibilityStore, selected) {
  const current = await getEligibility(eligibilityStore, actor, vibeIdx);
  return isReleaseReady(current)
    && current.runId === selected?.runId
    && (current.rescueCalibrationApprovalId || null)
      === (selected?.rescueCalibrationApprovalId || null)
    && (current.rescueCalibrationApprovalEvidenceHash || null)
      === (selected?.rescueCalibrationApprovalEvidenceHash || null)
    && (current.rescueCalibrationRetirementHash || null)
      === (selected?.rescueCalibrationRetirementHash || null);
}

export async function hasReleaseReadyCohort(
  packs,
  eligibilityStore,
  minimum = MIN_RELEASE_READY_PAIRS,
) {
  let approved = 0;
  for (const actor of packs) {
    for (let vibeIdx = 0; vibeIdx < (actor.vibes || []).length; vibeIdx += 1) {
      if (!await pairIsReleaseReady(actor, vibeIdx, eligibilityStore)) continue;
      approved += 1;
      if (approved >= minimum) return true;
    }
  }
  return false;
}

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    }
  });
}
