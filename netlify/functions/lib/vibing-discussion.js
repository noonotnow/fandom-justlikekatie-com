import { createHash, randomUUID } from "node:crypto";
import { getWithResolvedEtag } from "./blob-store.js";
import { json } from "./public-auth.js";

const STORE = "fandom-vibing-discussions";
// Adding a conversation requires a reviewed article, its own immutable boundary,
// and an explicit entry here. Never derive a boundary from a client request.
export const ACTIVE_DISCUSSIONS = Object.freeze({
  "against-the-current-episode-21": Object.freeze({
    id: "against-the-current-episode-21",
    seriesId: "against-the-current",
    articlePath: "/c-drama-fandom/vibing-now/against-the-current-episode-21/",
    safeThroughEpisode: 21,
    question: "Can Lin Jinqi care for Jialan without taking control of her choices?",
  }),
  "against-the-current-episodes-22-25": Object.freeze({
    id: "against-the-current-episodes-22-25",
    seriesId: "against-the-current",
    articlePath: "/c-drama-fandom/vibing-now/against-the-current-episodes-22-25/",
    safeThroughEpisode: 25,
    question: "Can Jinqi's commitment count as care when the decree takes Lanxiang's choice away?",
  }),
  "against-the-current-episodes-26-30": Object.freeze({
    id: "against-the-current-episodes-26-30",
    seriesId: "against-the-current",
    articlePath: "/c-drama-fandom/vibing-now/against-the-current-episodes-26-30/",
    safeThroughEpisode: 30,
    question: "Can Jinqi learn to be chosen without deciding for Lanxiang first?",
  }),
});
const WINDOW = 15 * 60 * 1000;
const RATE_SCAN_LIMIT = 200;
const MAX_RECORDS = 2000;
const CAPACITY_WARNING_AT = 1600;
const DAY = 24 * 60 * 60 * 1000;
const RETENTION = Object.freeze({ pending: 90 * DAY, rejected: 90 * DAY, hidden: 180 * DAY });

function problem(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function discussion(id) {
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !Object.hasOwn(ACTIVE_DISCUSSIONS, id)) {
    throw problem(404, "That discussion is not open.");
  }
  return ACTIVE_DISCUSSIONS[id];
}

function readArchive(data, id) {
  if (data === null || data === undefined) return [];
  if (!data || data.schemaVersion !== 1 || data.discussionId !== id
    || !Array.isArray(data.entries) || data.entries.length > MAX_RECORDS
    || !data.entries.every(entry => entry && typeof entry.id === "string"
      && typeof entry.text === "string" && entry.text.length <= 800
      && ["pending", "approved", "rejected", "hidden"].includes(entry.status)
      && Number.isInteger(entry.safeThroughEpisode))) {
    throw new Error("Discussion archive is invalid.");
  }
  return data.entries;
}

async function archive(store, id) {
  const entry = await getWithResolvedEtag(store, `discussion/${id}`, { type: "json" });
  if (entry && !entry.etag) throw new Error("Discussion archive ETag is unavailable.");
  return { entries: readArchive(entry?.data, id), etag: entry?.etag };
}

async function mutate(store, id, update) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { entries, etag } = await archive(store, id);
    const next = update(entries);
    if (next === entries) return;
    const result = await store.setJSON(`discussion/${id}`, {
      schemaVersion: 1, discussionId: id, entries: next,
    }, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (result?.modified !== false) return;
  }
  throw problem(409, "The discussion changed. Please try again.");
}

function expired(entry, timestamp) {
  const period = RETENTION[entry.status];
  if (!period) return false; // Approved replies and their reports are never pruned.
  const value = entry.status === "pending" ? entry.submittedAt : entry.moderatedAt;
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const date = Date.parse(value);
  return Number.isFinite(date) && new Date(date).toISOString() === value && date <= timestamp - period;
}

function retentionSummary(entries, timestamp) {
  const eligible = { pending: 0, rejected: 0, hidden: 0 };
  for (const entry of entries) if (expired(entry, timestamp)) eligible[entry.status]++;
  return { total: entries.length, eligible };
}

export function capacitySummary(entries) {
  const approved = entries.filter(entry => entry.status === "approved").length;
  return {
    total: entries.length,
    approved,
    limit: MAX_RECORDS,
    warningAt: CAPACITY_WARNING_AT,
  };
}

function moderationCounts(entries) {
  return {
    pending: entries.filter(entry => entry.status === "pending").length,
    // Count actionable reported replies, not reporters; hidden replies are no longer visible.
    reported: entries.filter(entry => entry.status === "approved" && Array.isArray(entry.reports) && entry.reports.length > 0).length,
  };
}

// Scheduled checks use the same validated, strong archive read as moderation.
export async function readDiscussionCapacity(store, id) {
  discussion(id);
  const { entries } = await archive(store, id);
  return capacitySummary(entries);
}

async function rate(store, identity, now, max) {
  const bucket = Math.floor(now.getTime() / WINDOW);
  const key = `rate/${createHash("sha256").update(identity).digest("hex")}/${bucket}`;
  for (let attempt = 0; attempt < 12; attempt++) {
    const entry = await getWithResolvedEtag(store, key, { type: "json" });
    if (entry && !entry.etag) throw new Error("Rate limit ETag is unavailable.");
    const count = entry?.data?.count || 0;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Rate limit record is invalid.");
    if (count >= max) throw problem(429, "Too many requests. Please try again later.");
    const result = await store.setJSON(key, {
      count: count + 1, expiresAt: new Date((bucket + 1) * WINDOW).toISOString(),
    }, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
    if (result?.modified !== false) return;
  }
  throw problem(429, "Too many requests. Please try again later.");
}

// Sweep one hash shard per hourly run. Each invocation scans at most one listing
// page and RATE_SCAN_LIMIT keys; deleted keys make room for the next pass. A
// bucket key is never written again after its window closes, so deleting a
// verified, elapsed bucket cannot reset a live counter.
export async function pruneExpiredDiscussionRates(store, current = new Date(), shard = Math.floor(current.getTime() / (60 * 60 * 1000)) % 16) {
  if (!Number.isFinite(current.getTime()) || !Number.isInteger(shard) || shard < 0 || shard > 15) {
    throw new Error("Invalid discussion rate cleanup window.");
  }
  const prefix = `rate/${shard.toString(16)}`;
  const listing = store.list({ prefix, paginate: true });
  const pages = listing && typeof listing[Symbol.asyncIterator] === "function"
    ? listing : (async function* () { yield await listing; })();
  let scanned = 0;
  let deleted = 0;
  for await (const page of pages) {
    for (const { key } of page.blobs || []) {
      if (scanned++ >= RATE_SCAN_LIMIT) return { scanned: RATE_SCAN_LIMIT, deleted };
      const match = /^rate\/([0-9a-f]{64})\/(0|[1-9]\d*)$/.exec(key);
      if (!match || match[1][0] !== shard.toString(16)) continue;
      const bucket = Number(match[2]);
      const end = (bucket + 1) * WINDOW;
      if (!Number.isSafeInteger(bucket) || !Number.isSafeInteger(end) || end > current.getTime()) continue;
      // A listing may be stale; an exact strong read is required. Unparseable
      // or inconsistent records remain untouched for investigation.
      const entry = await store.get(key, { type: "json", consistency: "strong" });
      if (!entry || entry.expiresAt !== new Date(end).toISOString()
        || !Number.isSafeInteger(entry.count) || entry.count < 0) continue;
      await store.delete(key);
      deleted++;
    }
    // This invocation is limited to a single listing page, regardless of store size.
    break;
  }
  return { scanned, deleted };
}

async function limit(store, actor, req, now, kind) {
  // Only platform-injected network identity is trusted; never use forwarded-for.
  const ip = req.headers.get("x-nf-client-connection-ip");
  if (ip) await rate(store, `${kind}:network:${ip}`, now, kind === "report" ? 15 : 10);
  await rate(store, `${kind}:actor:${actor.ownerId}`, now, kind === "report" ? 6 : 3);
}

async function body(req) {
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    throw problem(415, "Send JSON.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > 2048) throw problem(413, "Request is too large.");
  try { return JSON.parse(text); } catch { throw problem(400, "Invalid JSON."); }
}

function requireOrigin(req) {
  if (req.headers.get("origin") !== new URL(req.url).origin) {
    throw problem(403, "Cross-origin writes are not allowed.");
  }
}

export function createVibingDiscussionHandler({ auth, getStore, now = () => new Date(), randomId = randomUUID }) {
  return async (req, context) => {
    try {
      const params = new URL(req.url).searchParams;
      const input = req.method === "POST" ? (requireOrigin(req), await body(req)) : null;
      if (req.method === "GET" && params.get("view") === "moderation-summary") {
        await auth.authenticateAdmin(req, context);
        const store = getStore(STORE, context);
        const topics = await Promise.all(Object.keys(ACTIVE_DISCUSSIONS).map(async discussionId => {
          const { entries } = await archive(store, discussionId);
          return { discussionId, ...moderationCounts(entries) };
        }));
        return json(200, { topics });
      }
      const thread = discussion(req.method === "GET" ? params.get("discussionId") : input?.discussionId);
      const store = getStore(STORE, context);
      if (req.method === "GET") {
        if (params.get("view") === "moderation") {
          await auth.authenticateAdmin(req, context);
          const { entries } = await archive(store, thread.id);
          return json(200, { discussion: thread, entries, capacity: capacitySummary(entries) });
        }
        if (params.get("view") === "retention") {
          await auth.authenticateAdmin(req, context);
          const { entries } = await archive(store, thread.id);
          return json(200, retentionSummary(entries, now().getTime()));
        }
        if (params.has("view")) throw problem(400, "Unknown view.");
        const { entries } = await archive(store, thread.id);
        return json(200, {
          discussion: thread,
          responses: entries.filter(e => e.status === "approved" && e.safeThroughEpisode === thread.safeThroughEpisode)
            .slice(-30).map(e => ({ id: e.id, text: e.text })),
        });
      }
      if (req.method !== "POST") throw problem(405, "Method not allowed.");
      if (input?.action === "prune") {
        await auth.authenticateAdmin(req, context);
        const timestamp = now().getTime();
        let removed = { pending: 0, rejected: 0, hidden: 0 };
        await mutate(store, thread.id, entries => {
          removed = retentionSummary(entries, timestamp).eligible;
          if (!Object.values(removed).some(Boolean)) return entries;
          return entries.filter(entry => !expired(entry, timestamp));
        });
        return json(200, { removed });
      }
      if (input?.action === "moderate") {
        await auth.authenticateAdmin(req, context);
        if (!["approve", "reject", "hide"].includes(input.decision) || typeof input.entryId !== "string") {
          throw problem(400, "Invalid decision.");
        }
        await mutate(store, thread.id, entries => {
          const target = entries.find(e => e.id === input.entryId);
          if (!target) throw problem(404, "Response not found.");
          if (input.decision === "hide" ? target.status !== "approved" : target.status !== "pending") {
            throw problem(409, "Response is no longer eligible for that decision.");
          }
          if (input.decision === "approve" && target.safeThroughEpisode !== thread.safeThroughEpisode) {
            throw problem(409, "Spoiler boundary does not match this article.");
          }
          return entries.map(e => e.id === target.id ? {
            ...e, status: input.decision === "hide" ? "hidden" : input.decision === "approve" ? "approved" : "rejected",
            moderatedAt: now().toISOString(),
          } : e);
        });
        return json(200, { ok: true });
      }
      if (!["submit", "report"].includes(input?.action)) throw problem(400, "Unknown action.");
      const actor = await auth.getPublicActor(req, context);
      if (!actor?.ownerId) throw problem(503, "Submission identity is unavailable.");
      const headers = actor.setCookie ? { "Set-Cookie": actor.setCookie } : {};
      if (input.website !== undefined && input.website !== "") {
        return json(202, { message: "If eligible, your request has been received." }, headers);
      }
      if (input.safeThroughEpisode !== thread.safeThroughEpisode) {
         throw problem(400, `This discussion is through Episode ${thread.safeThroughEpisode} only.`);
      }
      if (input.action === "submit") {
        const text = typeof input.text === "string" ? input.text.trim() : "";
        if (typeof input.text !== "string"
          || text.length < 10 || text.length > 800 || /[\u0000-\u0008\u000b-\u001f]/.test(text)
          || input.acceptBoundary !== true) throw problem(400, "Write 10–800 characters and confirm the spoiler boundary.");
        await limit(store, actor, req, now(), "submit");
        await mutate(store, thread.id, entries => {
          if (entries.filter(entry => entry.status === "approved").length >= MAX_RECORDS) {
            throw problem(503, "This discussion is full of approved replies. New responses are paused until archive capacity is expanded.");
          }
          if (entries.length >= MAX_RECORDS) throw problem(429, "This discussion is full.");
          return [...entries, {
            id: randomId(), text, status: "pending",
            safeThroughEpisode: thread.safeThroughEpisode,
            ownerId: actor.ownerId, submittedAt: now().toISOString(), moderatedAt: null, reports: [],
          }];
        });
        return json(201, { message: "Thanks. Your response is awaiting editorial review." }, headers);
      }
      if (typeof input.entryId !== "string" || input.entryId.length > 100) throw problem(400, "Choose a response to report.");
      await limit(store, actor, req, now(), "report");
      await mutate(store, thread.id, entries => {
        const target = entries.find(e => e.id === input.entryId && e.status === "approved"
          && e.safeThroughEpisode === thread.safeThroughEpisode);
        if (!target) throw problem(404, "That response is not available.");
        return entries.map(e => e.id === target.id ? {
          ...e, reports: [...new Set([...(Array.isArray(e.reports) ? e.reports : []), actor.ownerId])].slice(0, 100),
        } : e);
      });
      return json(200, { message: "Reported. Thank you for helping keep this discussion safe." }, headers);
    } catch (error) {
      if (!error?.status) console.error("[vibing-discussion] request failed", error);
      return json(error?.status || 503, { error: error?.status ? error.message : "Discussion is temporarily unavailable." });
    }
  };
}