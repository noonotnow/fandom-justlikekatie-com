import { randomUUID } from "node:crypto";
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
import { buildPayloadForDate } from "../star-of-day.js";
import { getShanghaiDateString } from "../lib/date-seed.js";

const STORE_NAME = "collector-grid-runs";
const MAX_RUNS = 20;
const MAX_BODY_BYTES = 2048;
const COOLDOWN_MS = 15_000;
const NO_STORE = { "Cache-Control": "private, no-store", Vary: "Cookie" };

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
      const payload = await build(today(), eligibilityStore, {
        packs: actorPacks,
        selectedPair: pair,
      });
      if (!payload?.displayResults || payload.displayResults.length < 9) {
        return json(503, { error: "Fresh grid generation was unavailable." }, NO_STORE);
      }
      const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : now().toISOString();
      const images = payload.displayResults.slice(0, 9).map(safeImage);
      if (images.length !== 9 || images.some(image => !image)) {
        return json(502, { error: "Generated grid contained invalid public image URLs." }, NO_STORE);
      }
      const runId = randomUUID();
      const durableImages = [];
      try {
        for (let index = 0; index < images.length; index += 1) {
          const candidate = payload.displayResults[index];
          const fetched = await fetchImage(images[index].thumbnail, fetchImpl);
          const media = await registerMedia({
            bytes: fetched.bytes,
            contentType: fetched.contentType,
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
          durableImages.push({
            ...images[index],
            thumbnail: media.thumbnailUrl,
          });
        }
      } catch (error) {
        return json(error?.status || 502, {
          error: "Could not save all grid images to durable media.",
        }, NO_STORE);
      }
      const run = {
        id: runId,
        actorId: pair.actorId,
        vibeIdx: pair.vibeIdx,
        generatedAt,
        source: payload.curation?.mode === "operator_rescue_backup" ? "fallback" : "fresh",
        images: durableImages,
      };
      await store.setJSON(runKey(session.user.accountId, run.id), run);
      const key = indexKey(session.user.accountId, pair.actorId, pair.vibeIdx);
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
    } catch (error) {
      const status = error?.status || 503;
      if (status >= 500) console.error("[collector-grid] request failed", error);
      return json(status, { error: status >= 500 ? "Collector grid is temporarily unavailable." : error.message }, NO_STORE);
    }
  };
}