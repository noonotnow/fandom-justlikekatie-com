import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS as actorPacks } from "./lib/actor-packs.js";
import { searchOneQuery } from "./preview-search.js";
import { evaluateCandidates, rankCandidates, RANKED_BATCH_LIMIT } from "./lib/ranking.js";
import { getShanghaiDateString, getRandomForDate, shanghaiYesterday } from "./lib/date-seed.js";

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
// doing the expensive work (see tryAcquireLock() for why this is a best-effort
// read-then-write check rather than a strict atomic compare-and-swap). Only
// the request that wins the lock computes; everyone else briefly polls the
// real cache key and reads whatever the winner produced. This is what stops
// simultaneous requests right after midnight from each independently
// re-running the whole search+rank ladder.
const VERSION = "v1";
const STORE_NAME = "star-of-day";
const LOCK_TTL_MS = 25000; // a stale/abandoned lock is ignored after this long
const POLL_INTERVAL_MS = 700;
const POLL_MAX_WAIT_MS = 12000;

function cacheKeyFor(dateString) {
  return `starOfDay:${VERSION}:${dateString}`;
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
async function buildPayloadForDate(dateString) {
  const seed = getRandomForDate(actorPacks, dateString);
  if (!seed) {
    throw new Error("Could not resolve actor/vibe pack for date");
  }

  const actor = actorPacks[seed.aIdx];
  const vibe = actor.vibes[seed.vIdx];

  const candidates = await evaluateCandidates(vibe.queries, searchOneQuery);
  const ranked = rankCandidates(candidates).slice(0, RANKED_BATCH_LIMIT);

  if (!ranked.length) {
    // Nothing acceptable came back for any candidate query today — the caller
    // decides whether to fall back to yesterday's cache or surface a failure.
    // We deliberately do NOT cache this: a bad/empty day should never overwrite
    // (or permanently occupy) today's cache slot, in case a retry later in the
    // day would succeed.
    return null;
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
    rankedBatches: ranked,
    generatedAt: new Date().toISOString()
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
// (`result` came back `undefined`, unlike the documented behavior for the
// standalone `getStore()` API). Rather than depend on unconfirmed atomic
// semantics, this uses a plain read-then-write check instead. Worst case
// under true simultaneous first-of-the-day requests, two requests could both
// think they won the lock and both run the (idempotent, harmless) build —
// whichever writes the real cache key last simply "wins", and everyone else
// still reads a valid cached result. This is a deliberate, documented
// trade-off: correctness of the cached data is unaffected, only the
// "at most once" guarantee becomes "usually once, rarely twice".
async function tryAcquireLock(store, dateString) {
  const lockKey = lockKeyFor(dateString);
  try {
    const existing = await store.get(lockKey, { type: "json" });
    if (existing && Date.now() - existing.startedAt <= LOCK_TTL_MS) {
      // Someone else holds a fresh-enough lock — let them build.
      return false;
    }
  } catch (e) {
    // If we can't read the lock, proceed optimistically and try to take it.
  }

  await store.setJSON(lockKey, { startedAt: Date.now() });
  return true;
}

async function releaseLock(store, dateString) {
  try {
    await store.delete(lockKeyFor(dateString));
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
    const todayStr = getShanghaiDateString();
    const todayKey = cacheKeyFor(todayStr);

    const cached = await store.get(todayKey, { type: "json" });
    if (cached) {
      return jsonResponse(200, cached);
    }

    const gotLock = await tryAcquireLock(store, todayStr);

    if (gotLock) {
      try {
        const payload = await buildPayloadForDate(todayStr);
        if (payload) {
          // First-write-wins re-check: because tryAcquireLock() is a best-effort
          // read-then-write check (not a strict atomic compare-and-swap — see
          // its comment above for why), two simultaneous first-of-the-day
          // requests can both believe they hold the lock and both build a
          // payload here. Since rankCandidates() uses Math.random() for
          // tie-breaking, those two builds can genuinely differ. Re-fetch the
          // real cache key one more time immediately before writing: if a
          // racing request already wrote a result while we were building, defer
          // to it and discard our own payload, so whichever build finished
          // first is the one that sticks for the rest of the day.
          const raceWinner = await store.get(todayKey, { type: "json" });
          if (raceWinner) {
            return jsonResponse(200, raceWinner);
          }

          await store.setJSON(todayKey, payload);
          return jsonResponse(200, payload);
        }

        // Today's build produced nothing acceptable — graceful degrade to
        // yesterday's cached winner rather than a hard failure, if available.
        const fallback = await tryYesterdayFallback(store, todayStr);
        if (fallback) return jsonResponse(200, fallback);

        return jsonResponse(200, {
          version: VERSION,
          date: todayStr,
          error: "no_acceptable_batch",
          rankedBatches: []
        });
      } finally {
        await releaseLock(store, todayStr);
      }
    }

    // Someone else is building — poll the real cache key briefly instead of
    // duplicating the expensive work.
    const waited = await pollForCache(store, todayKey);
    if (waited) return jsonResponse(200, waited);

    // Still building after our patience budget — try yesterday's cache so the
    // visitor gets something rather than a spinner-forever state, then fall
    // back to an explicit "still building" response.
    const fallback = await tryYesterdayFallback(store, todayStr);
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

async function pollForCache(store, todayKey) {
  const deadline = Date.now() + POLL_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const cached = await store.get(todayKey, { type: "json" });
    if (cached) return cached;
  }
  return null;
}

async function tryYesterdayFallback(store, todayStr) {
  try {
    const yesterdayStr = shanghaiYesterday(todayStr);
    const yesterdayCached = await store.get(cacheKeyFor(yesterdayStr), { type: "json" });
    if (yesterdayCached) {
      return { ...yesterdayCached, stale: true, staleReason: "yesterday_fallback", date: todayStr, originalDate: yesterdayCached.date };
    }
  } catch (e) {
    // No usable fallback — caller handles the empty case.
  }
  return null;
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
