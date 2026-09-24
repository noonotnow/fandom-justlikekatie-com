import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { json } from "./public-auth.js";
import { getBlobStore } from "./blob-store.js";
import { ACTOR_PACKS } from "./actor-packs.js";
import { ELIGIBILITY_STORE, getEligibility, isReleaseReady } from "./actor-eligibility.js";
import { hasCapability } from "./capabilities.js";
import { createBillingServices } from "./billing.js";
import { createPublicAuth } from "./public-auth.js";
import { registerMediaBytes } from "./media-asset.js";
import { fetchPublicationImage } from "./publication-manifest.js";
import { searchOneQuery } from "../preview-search.js";
import { buildPayloadForDate } from "../star-of-day.js";
import { getShanghaiDateString } from "../lib/date-seed.js";

const STORE_NAME = "collector-grid-runs";
const MAX_RUNS = 20;
const MAX_BODY_BYTES = 2048;
const COOLDOWN_MS = 15_000;
const OWNER_LEASE_MS = 120_000;
const OWNER_LEASE_STALE_MS = 180_000;
const RECENT_EXCLUSION_RUNS = 5;
const REFRESH_RESULTS_PER_QUERY = 30;
const REFRESH_RANKED_BATCH_LIMIT = 5;
const REFRESH_CANDIDATE_LIMIT = 60;
const NO_STORE = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const SEARCH_PROVIDERS = new Set(["baidu", "brave", "brave_baseline", "google_images", "bing_images", "yandex_images"]);

function boundedText(value, limit = 512) {
  return typeof value === "string" ? value.slice(0, limit) : null;
}
function providerName(value) {
  return SEARCH_PROVIDERS.has(value) ? value : null;
}
function boundedCount(value) {
  return Number.isInteger(value) && value >= 0 ? Math.min(value, 10000) : null;
}
function approvalIdentity(approval) {
  return [
    approval?.runId,
    approval?.pairingFingerprint,
    approval?.verdict,
    approval?.rescueCalibrationApprovalId || null,
    approval?.rescueCalibrationApprovalEvidenceHash || null,
    approval?.rescueCalibrationRetirementHash || null,
  ];
}

function checksumsMatch(left = [], right = []) {
  if (left.length !== right.length || left.length === 0) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

async function acquireOwnerLease(store, key, ownerToken, nowMs = Date.now()) {
  const existing = typeof store.getWithMetadata === "function"
    ? await store.getWithMetadata(key, { type: "json", consistency: "strong" })
    : { data: await store.get(key, { type: "json", consistency: "strong" }) };
  const lease = existing?.data;
  const leaseStartedAt = Date.parse(lease?.startedAt || "");
  const leaseExpiresAt = Date.parse(lease?.expiresAt || "");
  const stale = Number.isFinite(leaseStartedAt) && nowMs - leaseStartedAt > OWNER_LEASE_STALE_MS;
  const expired = Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= nowMs;
  if (lease?.ownerToken && !stale && !expired) return null;
  const nextLease = {
    ownerToken,
    startedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + OWNER_LEASE_MS).toISOString(),
  };
  const write = await store.setJSON(
    key,
    nextLease,
    existing?.etag ? { onlyIfMatch: existing.etag } : { onlyIfNew: true },
  );
  if (write?.modified === false) return null;
  const confirmed = await store.get(key, { type: "json", consistency: "strong" });
  return confirmed?.ownerToken === ownerToken ? nextLease : null;
}

async function releaseOwnerLease(store, key, ownerToken) {
  try {
    const current = typeof store.getWithMetadata === "function"
      ? await store.getWithMetadata(key, { type: "json", consistency: "strong" })
      : { data: await store.get(key, { type: "json", consistency: "strong" }), etag: null };
    if (!current?.data || current.data.ownerToken !== ownerToken) return;
    await store.setJSON(
      key,
      { ...current.data, expiresAt: new Date(0).toISOString(), releasedAt: new Date().toISOString() },
      current?.etag ? { onlyIfMatch: current.etag } : undefined,
    );
  } catch {
    // Non-fatal: stale leases expire automatically.
  }
}

function indexKey(accountId, actorId, vibeIdx) {
  return `accounts/${encodeURIComponent(accountId)}/pairs/${encodeURIComponent(actorId)}/${vibeIdx}/index`;
}
function runKey(accountId, id) {
  return `accounts/${encodeURIComponent(accountId)}/runs/${encodeURIComponent(id)}`;
}
function safeImage(candidate) {
  const thumbnail = publicHttpsUrl(candidate?.thumbnail);
  const link = candidate?.link ? publicHttpsUrl(candidate.link) : null;
  if (!thumbnail) return null;
  return {
    thumbnail,
    title: typeof candidate?.title === "string" ? candidate.title.slice(0, 512) : "",
    source: typeof candidate?.source === "string" ? candidate.source.slice(0, 256) : "",
    link,
    query: typeof candidate?.query === "string" ? candidate.query.slice(0, 512) : "",
  };
}
function publicHttpsUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "").toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !hostname
      || isIP(hostname) || hostname === "localhost" || hostname.endsWith(".localhost")) return null;
    return url.toString().slice(0, 2048);
  } catch {
    return null;
  }
}
function parsePair(url) {
  const actorId = url.searchParams.get("actorId");
  const raw = url.searchParams.get("vibeIdx");
  const vibeIdx = Number(raw);
  if (!actorId || actorId.length > 160 || !/^[A-Za-z0-9_-]+$/.test(actorId)
    || !/^\d+$/.test(raw || "") || !Number.isInteger(vibeIdx) || vibeIdx < 0 || vibeIdx > 999) {
    return null;
  }
  return { actorId, vibeIdx };
}
function readRequestPair(req) {
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return Promise.resolve(null);
  return req.text().then(text => {
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
    let body;
    try { body = JSON.parse(text); } catch { return null; }
    if (!body || typeof body.actorId !== "string"
      || !Number.isInteger(body.vibeIdx)) return null;
    return { actorId: body.actorId, vibeIdx: body.vibeIdx };
  }).catch(() => null);
}

export function createCollectorGridHandler({
  auth = createPublicAuth({ getStore: getBlobStore }),
  billing = createBillingServices(),
  getStore = getBlobStore,
  actorPacks = ACTOR_PACKS,
  env = process.env,
  eligibilityStoreName = ELIGIBILITY_STORE,
  getPairEligibility = getEligibility,
  build = buildPayloadForDate,
  searchQuery = searchOneQuery,
  fetchImage = (url, fetchImpl) => fetchPublicationImage(url, fetchImpl, lookup),
  registerMedia = registerMediaBytes,
  fetchImpl = fetch,
  today = getShanghaiDateString,
  now = () => new Date(),
} = {}) {
  return async (req, context) => {
    try {
      if (req.method !== "POST" && req.method !== "GET") {
        return json(405, { error: "Method not allowed." }, { Allow: "GET, POST", ...NO_STORE });
      }
      const session = await auth.authenticate(req, context);
      await billing.initialize(context);
      const membership = await billing.repository(context).membershipForAccount(session.user.accountId);
      if (!hasCapability(membership, "fandom_collector", env)) {
        return json(403, { error: "An active Fandom Collector membership is required." }, NO_STORE);
      }
      const url = new URL(req.url || "https://fandom.local/.netlify/functions/collector-grid");
      const pair = req.method === "POST" ? await readRequestPair(req) : parsePair(url);
      if (!pair || pair.actorId.length > 160 || pair.vibeIdx < 0 || pair.vibeIdx > 999) {
        return json(400, { error: "actorId and a non-negative integer vibeIdx are required." }, NO_STORE);
      }
      const actor = actorPacks.find(item => item?.id === pair.actorId);
      if (!actor?.vibes?.[pair.vibeIdx]) return json(404, { error: "Actor/vibe pairing not found." }, NO_STORE);
      const store = getStore(STORE_NAME, context);
      if (req.method === "GET") {
        const index = await store.get(indexKey(session.user.accountId, pair.actorId, pair.vibeIdx), { type: "json" });
        const ids = Array.isArray(index?.ids) ? index.ids.slice(0, MAX_RUNS) : [];
        const runs = (await Promise.all(ids.map(id => store.get(runKey(session.user.accountId, id), { type: "json" }))))
          .filter(Boolean);
        return json(200, { runs }, NO_STORE);
      }
      const eligibilityStore = getStore(eligibilityStoreName, context);
      const approval = await getPairEligibility(eligibilityStore, actor, pair.vibeIdx);
      if (!isReleaseReady(approval)) {
        return json(403, { error: "This pairing is not eligible for Daily Drop." }, NO_STORE);
      }
      const cooldownKey = `accounts/${encodeURIComponent(session.user.accountId)}/pairs/${encodeURIComponent(pair.actorId)}/${pair.vibeIdx}/cooldown`;
      const cooldownEntry = typeof store.getWithMetadata === "function"
        ? await store.getWithMetadata(cooldownKey, { type: "json", consistency: "strong" })
        : { data: await store.get(cooldownKey, { type: "json" }) };
      const cooldown = cooldownEntry?.data;
      if (cooldown?.until && Date.parse(cooldown.until) > Date.now()) {
        return json(429, { error: "Please wait before refreshing this pairing." }, {
          ...NO_STORE,
          "Retry-After": String(Math.ceil((Date.parse(cooldown.until) - Date.now()) / 1000)),
        });
      }
      const cooldownToken = randomUUID();
      const cooldownWrite = await store.setJSON(
        cooldownKey,
        { token: cooldownToken, until: new Date(Date.now() + COOLDOWN_MS).toISOString() },
        cooldownEntry?.etag
          ? { onlyIfMatch: cooldownEntry.etag }
          : cooldown?.until
            ? undefined
            : { onlyIfNew: true },
      );
      if (cooldownWrite?.modified === false) {
        return json(429, { error: "Please wait before refreshing this pairing." }, NO_STORE);
      }
      // Some blob adapters return no conditional-write result, including on
      // an initial onlyIfNew write. Confirm ownership before a costly build.
      if (cooldownWrite?.modified !== true) {
        const confirmed = await store.get(cooldownKey, { type: "json", consistency: "strong" });
        if (confirmed?.token !== cooldownToken) {
          return json(429, { error: "Please wait before refreshing this pairing." }, NO_STORE);
        }
      }
      const leaseKey = `accounts/${encodeURIComponent(session.user.accountId)}/pairs/${encodeURIComponent(pair.actorId)}/${pair.vibeIdx}/owner-lease`;
      const ownerToken = randomUUID();
      const lease = await acquireOwnerLease(store, leaseKey, ownerToken);
      if (!lease) {
        return json(429, { error: "Another refresh is already generating this pairing." }, NO_STORE);
      }
      try {
        const searchAttempts = [];
        const key = indexKey(session.user.accountId, pair.actorId, pair.vibeIdx);
        const previousIndex = await store.get(key, { type: "json", consistency: "strong" });
        const recentRunIds = Array.isArray(previousIndex?.ids) ? previousIndex.ids.slice(0, RECENT_EXCLUSION_RUNS) : [];
        const recentRuns = await Promise.all(recentRunIds.map(id =>
          typeof id === "string"
            ? store.get(runKey(session.user.accountId, id), { type: "json", consistency: "strong" })
            : null));
        const previousRun = recentRuns[0] || null;
        if (recentRunIds[0] && !previousRun) {
          return json(503, { error: "The previous saved grid could not be checked. Please try again later." }, NO_STORE);
        }
        if (previousRun && (!Array.isArray(previousRun.images) || previousRun.images.length !== 9)) {
          return json(503, { error: "The previous saved grid could not be checked. Please try again later." }, NO_STORE);
        }
        const validRecentRuns = recentRuns
          .map((run, index) => ({ run, id: recentRunIds[index] }))
          .filter(item => Array.isArray(item.run?.images) && item.run.images.length === 9);
        const excludedThumbnails = new Set(validRecentRuns
          .flatMap(item => item.run.images || [])
          .map(image => image?.sourceThumbnail)
          .filter(Boolean));
        const excludedChecksums = new Set(validRecentRuns
          .flatMap(item => item.run.images || [])
          .map(image => image?.imageChecksum)
          .filter(Boolean));
        const search = async (query, options = {}) => {
          const attempt = {
            query: boundedText(query),
            provider: null,
            providerFetchOrder: [],
            resultCount: null,
          };
          try {
            const result = await searchQuery(query, {
              ...options,
              providerPolicy: options.providerPolicy || "collector-refresh-pool",
              resultLimit: options.resultLimit || REFRESH_RESULTS_PER_QUERY,
              debug: true,
            });
            attempt.provider = providerName(result?.provider);
            attempt.providerFetchOrder = Array.isArray(result?.providerFetchOrder)
              ? result.providerFetchOrder.slice(0, 8).map(providerName).filter(Boolean)
              : [];
            attempt.resultCount = boundedCount(result?.results?.length);
            const rawProviderCount = boundedCount(result?.rawProviderCount);
            const postFilterCount = boundedCount(result?.postFilterCount);
            const pooledUniqueCount = boundedCount(result?.pooledUniqueCount);
            if (rawProviderCount !== null) attempt.rawProviderCount = rawProviderCount;
            if (postFilterCount !== null) attempt.postFilterCount = postFilterCount;
            if (pooledUniqueCount !== null) attempt.pooledUniqueCount = pooledUniqueCount;
            return result;
          } finally {
            if (searchAttempts.length < 64) searchAttempts.push(attempt);
          }
        };
        const payload = await build(today(), eligibilityStore, {
          packs: actorPacks,
          selectedPair: pair,
          search,
          refreshCollectorSearch: Boolean(previousRun),
          excludedCollectorThumbnails: [...excludedThumbnails].slice(0, 500),
          excludedCollectorChecksums: [...excludedChecksums].slice(0, 500),
        });
        if (!payload?.displayResults || payload.displayResults.length < 9) {
          return json(503, { error: previousRun
            ? "No different safe nine-image board is available for this pairing yet. Your saved grid is unchanged."
            : "Fresh grid generation was unavailable." }, NO_STORE);
        }
        const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : now().toISOString();
        const images = payload.displayResults.slice(0, 9).map(safeImage);
        if (images.length !== 9 || images.some(image => !image)) {
          return json(502, { error: "Generated grid contained invalid public image URLs." }, NO_STORE);
        }
        const recentRunChecksums = [];
        for (const [index, item] of validRecentRuns.entries()) {
          try {
            const checksums = await Promise.all((item.run.images || []).map(async image => {
              if (image.imageChecksum) return image.imageChecksum;
              const prior = await fetchImage(image.thumbnail, fetchImpl);
              return createHash("sha256").update(prior.bytes).digest("hex");
            }));
            if (checksums.length === 9) {
              recentRunChecksums.push({ id: item.id, checksums });
            }
          } catch {
            if (index === 0) {
              return json(503, { error: "The previous saved images could not be checked. Your saved grid is unchanged." }, NO_STORE);
            }
          }
        }
        const runId = randomUUID();
        const durableImages = [];
        try {
          for (let index = 0; index < images.length; index += 1) {
            const fetched = await fetchImage(images[index].thumbnail, fetchImpl);
            const imageChecksum = createHash("sha256").update(fetched.bytes).digest("hex");
            durableImages.push({
              ...images[index],
              sourceThumbnail: images[index].thumbnail,
              imageChecksum,
              bytes: fetched.bytes,
              contentType: fetched.contentType,
            });
          }
          const finalChecksums = durableImages.map(image => image.imageChecksum);
          const unchanged = recentRunChecksums.some(run => checksumsMatch(finalChecksums, run.checksums));
          if (unchanged) {
            return json(409, { error: "No different safe nine-image board is available for this pairing yet. Your saved grid is unchanged." }, NO_STORE);
          }
          for (let index = 0; index < durableImages.length; index += 1) {
            const image = durableImages[index];
            const media = await registerMedia({
              bytes: image.bytes,
              contentType: image.contentType,
              association: { type: "collection", id: runId, itemId: `card-${index + 1}` },
              filename: `fandom-collector-${pair.actorId}-${pair.vibeIdx}-${index + 1}`,
              idempotencyKey: `collector-grid/${runId}/card-${index + 1}`,
              metadata: {
                sourceType: "fandom-collector-live-grid",
                seriesTags: ["Fandom", "Vibe Atlas", "Collector"],
                provenance: {
                  actorId: pair.actorId,
                  vibeIdx: pair.vibeIdx,
                  link: images[index].link,
                  query: images[index].query,
                  source: images[index].source,
                },
              },
              env,
              fetchImpl,
            });
            if (!publicHttpsUrl(media?.thumbnailUrl)) {
              throw Object.assign(new Error("MEDIA returned an invalid thumbnail URL."), { status: 502 });
            }
            durableImages[index] = {
              ...images[index],
              sourceThumbnail: image.sourceThumbnail,
              imageChecksum: image.imageChecksum,
              thumbnail: media.thumbnailUrl,
              mediaAssetId: boundedText(media.assetId, 128),
            };
          }
        } catch (error) {
          return json(error?.status || 502, {
            error: "Could not save all grid images to durable media.",
          }, NO_STORE);
        }
        const currentApproval = await getPairEligibility(eligibilityStore, actor, pair.vibeIdx);
        if (!isReleaseReady(currentApproval)
          || JSON.stringify(approvalIdentity(currentApproval)) !== JSON.stringify(approvalIdentity(approval))) {
          return json(409, { error: "This pack's release approval changed during generation." }, NO_STORE);
        }
        const selectedChecksums = durableImages.map(image => image.imageChecksum);
        const overlapWithRecentRuns = recentRunChecksums.slice(0, RECENT_EXCLUSION_RUNS).map(run => ({
          runId: boundedText(run.id, 128),
          overlapCount: boundedCount(run.checksums.filter(checksum =>
            selectedChecksums.includes(checksum)).length),
        }));
        const run = {
          schemaVersion: 2,
          id: runId,
          actorId: pair.actorId,
          vibeIdx: pair.vibeIdx,
          generatedAt,
          source: payload.curation?.mode === "operator_rescue_backup" ? "fallback" : "fresh",
          images: durableImages,
          provenance: {
            pack: {
              id: `${pair.actorId}:${pair.vibeIdx}`,
              pairingFingerprint: boundedText(approval.pairingFingerprint, 128),
              approvalRunId: boundedText(approval.runId, 128),
              approvalVerdict: approval.verdict,
            },
            search: {
              attemptedQueries: searchAttempts,
              rankedBatches: (Array.isArray(payload.rankedBatches) ? payload.rankedBatches : [])
                .slice(0, previousRun ? REFRESH_RANKED_BATCH_LIMIT : 3).map(batch => ({
                  query: boundedText(batch.query),
                  provider: providerName(batch.provider),
                  usableCount: boundedCount(batch.count),
                  distinctSourceCount: boundedCount(batch.distinctSources),
                })),
              freshness: previousRun ? {
                rawProviderCount: boundedCount(payload.collectorRefresh?.rawProviderCount),
                postFilterCount: boundedCount(payload.collectorRefresh?.postFilterCount),
                pooledUniqueCount: boundedCount(payload.collectorRefresh?.pooledUniqueCount),
                historyExcludedCount: boundedCount(payload.collectorRefresh?.historyExcludedCount),
                unseenCount: boundedCount(payload.collectorRefresh?.unseenCount),
                analyzedCount: boundedCount(payload.collectorRefresh?.analyzedCount),
                selectedCount: boundedCount(payload.collectorRefresh?.selectedCount),
                providerContributionCounts: Object.fromEntries(
                  Object.entries(payload.collectorRefresh?.providerContributionCounts || {})
                    .slice(0, 8)
                    .map(([provider, counts]) => [providerName(provider), {
                      rawCount: boundedCount(counts?.rawCount),
                      normalizedCount: boundedCount(counts?.normalizedCount),
                      acceptedCount: boundedCount(counts?.acceptedCount),
                    }])
                    .filter(([provider]) => provider),
                ),
                firstPassQueries: (payload.collectorRefresh?.firstPassQueries || [])
                  .slice(0, REFRESH_RESULTS_PER_QUERY).map(query => boundedText(query)),
                secondPassQueries: (payload.collectorRefresh?.secondPassQueries || [])
                  .slice(0, 4).map(query => boundedText(query)),
                overlapWithRecentRuns: overlapWithRecentRuns.slice(0, RECENT_EXCLUSION_RUNS),
              } : null,
            },
            curation: {
              mode: boundedText(payload.curation?.mode, 40),
              version: payload.curation?.curationVersion ?? payload.curation?.version ?? null,
              calibrationProfileVersion: payload.curation?.calibrationProfileVersion ?? null,
              calibrationEvidenceCount: boundedCount(payload.curation?.calibrationEvidenceCount),
              selectedScore: Number.isFinite(payload.curation?.score) ? payload.curation.score : null,
            },
          },
        };
        await store.setJSON(runKey(session.user.accountId, run.id), run);
        let appended = false;
        for (let attempt = 0; attempt < 3 && !appended; attempt += 1) {
          const prior = typeof store.getWithMetadata === "function"
            ? await store.getWithMetadata(key, { type: "json", consistency: "strong" })
            : { data: await store.get(key, { type: "json" }), etag: null };
          const ids = [run.id, ...(Array.isArray(prior?.data?.ids) ? prior.data.ids : [])]
            .filter((id, index, list) => typeof id === "string" && list.indexOf(id) === index)
            .slice(0, MAX_RUNS);
          const result = await store.setJSON(key, { ids },
            prior?.etag ? { onlyIfMatch: prior.etag } : { onlyIfNew: true });
          if (result?.modified === false) continue;
          const confirmed = typeof store.getWithMetadata === "function"
            ? await store.getWithMetadata(key, { type: "json", consistency: "strong" })
            : { data: await store.get(key, { type: "json", consistency: "strong" }) };
          appended = Array.isArray(confirmed?.data?.ids) && confirmed.data.ids.includes(run.id);
        }
        if (!appended) return json(503, { error: "Could not safely save the grid index." }, NO_STORE);
        return json(200, { run }, NO_STORE);
      } finally {
        await releaseOwnerLease(store, leaseKey, ownerToken);
      }
    } catch (error) {
      const status = error?.status || 503;
      if (status >= 500) console.error("[collector-grid] request failed", error);
      return json(status, { error: status >= 500 ? "Collector grid is temporarily unavailable." : error.message }, NO_STORE);
    }
  };
}