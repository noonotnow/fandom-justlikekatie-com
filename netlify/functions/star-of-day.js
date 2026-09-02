import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS as actorPacks } from "./lib/actor-packs.js";
import { searchOneQuery } from "./preview-search.js";
import { evaluateCandidates, rankCandidates, RANKED_BATCH_LIMIT } from "./lib/ranking.js";
import { getShanghaiDateString, shanghaiYesterday } from "./lib/date-seed.js";
import { candidateIdForResult, curateDisplayResults } from "./lib/grid-curation.js";
import {
  AESTHETIC_CLUSTER_VERSION,
  IDENTITY_PROFILE_VERSION,
  VIBE_PROMISE_CONTRACT_VERSION,
  vibePromiseFor,
} from "./lib/actor-identity-profiles.js";
import {
  ELIGIBILITY_STORE,
  getEligibility,
  selectEligiblePair,
} from "./lib/actor-eligibility.js";
import {
  GRID_MANIFEST_PREFIX,
  boardHash as publicationBoardHash,
  gridManifestKey,
  manifestPayload,
  materializePublicationManifest,
} from "./lib/publication-manifest.js";

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
export const STAR_OF_DAY_VERSION = "v10";
const VERSION = STAR_OF_DAY_VERSION;
// Legacy entries remain readable as historical editions; today's key is v10 so
// no pre-audit cache can satisfy the current day's scheduler.
const LEGACY_READ_VERSIONS = ["v9", "v8", "v7", "v6", "v5"];
// One excellent, human-approved board is enough to release. A second approved
// pairing remains useful inventory and range, but it is not a publication gate.
export const MIN_RELEASE_READY_PAIRS = 1;
export const RELEASE_COHORT_ACTOR_ID = "liu-xueyi";
const STORE_NAME = "star-of-day";
const LOCK_TTL_MS = 25000; // a stale/abandoned lock is ignored after this long
const POLL_INTERVAL_MS = 700;
const POLL_MAX_WAIT_MS = 12000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    releaseActorId = null,
    publicationStore = null,
    materializePublication = null,
    mediaEnv = process.env,
    fetchImpl = fetch,
  } = {},
) {
  if (!await hasReleaseReadyCohort(packs, eligibilityStore, MIN_RELEASE_READY_PAIRS, releaseActorId)) return null;
  const excluded = new Set();
  while (true) {
    const seed = await selectEligiblePair(
      packs,
      dateString,
      eligibilityStore,
      excluded,
      releaseActorId,
    );
    if (!seed) return null;
    const actor = packs[seed.aIdx];
    const vibe = actor.vibes[seed.vIdx];
    const approval = await getEligibility(eligibilityStore, actor, seed.vIdx);
    if (approval?.verdict !== "approved") {
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
    const candidates = await evaluate(vibe.queries, search);
    let ranked = rank(candidates).slice(0, RANKED_BATCH_LIMIT);

    if (!ranked.length) {
      const backup = await tryEditorialBackup();
      if (backup) return backup;
      excluded.add(`${actor.id}:${seed.vIdx}`);
      continue;
    }

    let { displayResults, curation } = await curate(ranked, {
      promise: vibePromiseFor(actor, seed.vIdx),
      calibrationProfile: approval.calibrationProfile || null,
      preferredCandidateIds: approval.calibrationProfile?.positiveCandidateIds || [],
      profileVersions: {
        identityProfileVersion: IDENTITY_PROFILE_VERSION,
        aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
        promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
      },
    });
    if (displayResults.length >= 9 && pairHistory.length) {
      const initialOverlap = greatestBoardOverlap(displayResults, pairHistory);
      if (initialOverlap >= 7) {
        const refreshedCandidates = await evaluate(
          vibe.queries,
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
      excluded.add(`${actor.id}:${seed.vIdx}`);
      continue;
    }
    if (!await pairIsReleaseReady(actor, seed.vIdx, eligibilityStore)) {
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
          provenance: {
            sourceType: "daily_curation",
            runId: approval.runId || null,
            curationVersion: curation?.curationVersion || null,
          },
          env: mediaEnv,
          fetchImpl,
          now: generatedAt,
        });
        return materialized.payload;
      } catch {
        const backup = await tryEditorialBackup();
        if (backup) return backup;
        excluded.add(`${actor.id}:${seed.vIdx}`);
        continue;
      }
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
  if (!await pairIsReleaseReady(actor, seed.vIdx, eligibilityStore)) return null;
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
          provenance,
          env: mediaEnv,
          fetchImpl,
          now: generatedAt,
        });
        return materialized.payload;
      } catch {
        continue;
      }
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
  const listing = await store.list({ prefix: GRID_MANIFEST_PREFIX });
  const manifests = await Promise.all((listing?.blobs || [])
    .filter(blob => typeof blob?.key === "string"
      && blob.key.slice(GRID_MANIFEST_PREFIX.length) < beforeDate)
    .map(blob => store.get(blob.key, { type: "json", consistency: "strong" })));
  return new Set(manifests
    .map(manifest => manifest?.boardHash)
    .filter(hash => typeof hash === "string"));
}

async function readPairPublicationHistory(store, actorId, vibeIdx, beforeDate) {
  const listing = await store.list({ prefix: GRID_MANIFEST_PREFIX });
  const manifests = await Promise.all((listing?.blobs || [])
    .filter(blob => typeof blob?.key === "string"
      && blob.key.slice(GRID_MANIFEST_PREFIX.length) < beforeDate)
    .map(blob => store.get(blob.key, { type: "json", consistency: "strong" })));
  return manifests
    .filter(manifest =>
      manifest?.actor?.id === actorId
      && manifest?.vibe?.idx === vibeIdx
      && Array.isArray(manifest.cards)
      && manifest.cards.length === 9)
    .sort((left, right) =>
      String(right.publicationDate || "").localeCompare(String(left.publicationDate || "")));
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

export default async (req, context) => {
  if (req.method && req.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const store = getBlobStore(STORE_NAME, context);
    const eligibilityStore = getBlobStore(ELIGIBILITY_STORE, context);
    const todayStr = getShanghaiDateString();
    const url = new URL(req.url || "https://fandom.local/.netlify/functions/star-of-day");

    if (url.searchParams.get("archive") === "1") {
      return jsonResponse(200, await listArchivedEditions(store, todayStr));
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
        return jsonResponse(200, archived);
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
      RELEASE_COHORT_ACTOR_ID,
    )) {
      return jsonResponse(200, cached);
    }
    if (cached) await store.delete(todayKey);

    const lock = await tryAcquireLock(store, todayStr);

    if (lock) {
      try {
        const payload = await buildPayloadForDate(todayStr, eligibilityStore, {
          releaseActorId: RELEASE_COHORT_ACTOR_ID,
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
            RELEASE_COHORT_ACTOR_ID,
          )) {
            return jsonResponse(200, raceWinner);
          }
          if (raceWinner) await store.delete(todayKey);

          if (await cachedPairIsEligible(
            payload,
            eligibilityStore,
            actorPacks,
            RELEASE_COHORT_ACTOR_ID,
          )) {
            await store.setJSON(todayKey, payload);
            if (await cachedPairIsEligible(
              payload,
              eligibilityStore,
              actorPacks,
              RELEASE_COHORT_ACTOR_ID,
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

function isUsableDate(value) {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function listArchivedEditions(store, todayStr) {
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
    if (!payload || payload.date !== date || !payload.actorName || !payload.vibeLabel) return null;
    return {
      date,
      actorName: payload.actorName,
      actorShortNameEn: payload.actorShortNameEn,
      vibeEmoji: payload.vibeEmoji,
      vibeLabel: payload.vibeLabel,
      vibeLabelEn: payload.vibeLabelEn,
      vibeSubtitleEn: payload.vibeSubtitleEn,
      generatedAt: payload.generatedAt,
    };
  }));

  return {
    version: VERSION,
    editions: editions
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
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
      RELEASE_COHORT_ACTOR_ID,
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
      RELEASE_COHORT_ACTOR_ID,
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
  releaseActorId = null,
) {
  if (!Number.isInteger(payload?.vibeIdx) || typeof payload?.actorId !== "string") return false;
  if (releaseActorId && payload.actorId !== releaseActorId) return false;
  if (!await hasReleaseReadyCohort(packs, eligibilityStore)) return false;
  const actor = packs.find(item => item.id === payload.actorId);
  return Boolean(actor?.vibes?.[payload.vibeIdx])
    && await pairIsReleaseReady(actor, payload.vibeIdx, eligibilityStore)
    && await hasReleaseReadyCohort(
      packs,
      eligibilityStore,
      MIN_RELEASE_READY_PAIRS,
      releaseActorId,
    );
}

async function pairIsReleaseReady(actor, vibeIdx, eligibilityStore) {
  const snapshot = await getEligibility(eligibilityStore, actor, vibeIdx);
  return snapshot?.eligible === true
    && snapshot.verdict === "approved"
    && snapshot.vibeConfirmed === true
    && snapshot.publishableConfirmed === true;
}

export async function hasReleaseReadyCohort(
  packs,
  eligibilityStore,
  minimum = MIN_RELEASE_READY_PAIRS,
  releaseActorId = null,
) {
  let approved = 0;
  const cohort = releaseActorId
    ? packs.filter(actor => actor.id === releaseActorId)
    : packs;
  for (const actor of cohort) {
    for (let vibeIdx = 0; vibeIdx < (actor.vibes || []).length; vibeIdx += 1) {
      if (!await pairIsReleaseReady(actor, vibeIdx, eligibilityStore)) continue;
      approved += 1;
      if (approved >= minimum) return true;
    }
  }
  return false;
}

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
