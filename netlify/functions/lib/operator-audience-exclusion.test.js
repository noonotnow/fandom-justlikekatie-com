import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// The allowlist is read when public-auth is created, so set it before importing the collectors.
process.env.FANDOM_ADMIN_EMAILS = "owner@example.com";
process.env.FANDOM_AUTH_ID_SECRET = "test-secret";
process.env.FANDOM_PUBLIC_ORIGIN = "https://fandom.justlikekatie.com";
const { createPublicAuth } = await import("./public-auth.js");
const { default: logEngagement } = await import("../log-engagement.js");
const { createReleasedPackCollectHandler } = await import("./released-pack-analytics.js");
const { createParticipationCollector } = await import("./daily-participation-analytics.js");

const sha256 = value => createHash("sha256").update(value).digest("hex");
const NOW = new Date();

function memoryStore() {
  const records = new Map();
  return {
    records,
    async get(key) { return structuredClone(records.get(key) ?? null); },
    async getWithMetadata(key) {
      return records.has(key) ? { data: structuredClone(records.get(key)), etag: "etag" } : null;
    },
    async setJSON(key, value) { records.set(key, structuredClone(value)); return { modified: true }; },
    async list() { return { blobs: [...records.keys()].map(key => ({ key })) }; },
  };
}

function world() {
  const stores = new Map();
  const get = name => { if (!stores.has(name)) stores.set(name, memoryStore()); return stores.get(name); };
  const context = { blobs: { getStore: get } };
  const seed = (token, email, { expired = false, revoked = false } = {}) => {
    const accountId = `acct-${email}`;
    get("fandom-auth-users").records.set(`users/${accountId}`, { accountId, email });
    get("fandom-auth-sessions").records.set(`sessions/${sha256(token)}`, {
      accountId,
      expiresAt: new Date(NOW.getTime() + (expired ? -1000 : 86400000)).toISOString(),
      revokedAt: revoked ? NOW.toISOString() : null,
    });
    return `__Host-fandom_session=${token}`;
  };
  return { get, context, seed, auth: createPublicAuth({ getStore: get, now: () => NOW }) };
}

const request = (path, cookie, body, headers = {}) => new Request(`https://fandom.justlikekatie.com${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "user-agent": "Mozilla/5.0", ...(cookie ? { cookie } : {}), ...headers },
  body: JSON.stringify(body),
});

test("isOperatorRequest: only a verified allowlisted session is an operator; paid/ordinary/anonymous are not", async () => {
  const w = world();
  const operator = w.seed("operator-token", "owner@example.com");
  const member = w.seed("member-token", "member@example.com");
  const expired = w.seed("expired-token", "owner@example.com", { expired: true });
  const revoked = w.seed("revoked-token", "owner@example.com", { revoked: true });
  const check = (cookie, headers) => w.auth.isOperatorRequest(request("/x", cookie, {}, headers), w.context);
  assert.equal(await check(operator), true);
  assert.equal(await check(member), false);
  assert.equal(await check(undefined), false);
  assert.equal(await check("__Host-fandom_session=unknown-token"), false);
  assert.equal(await check(expired), false, "expired sessions are not authenticated");
  assert.equal(await check(revoked), false, "logged-out sessions are not authenticated");
  // Caller-supplied claims never grant operator status.
  assert.equal(await check(member, { "x-fandom-operator": "true", "x-admin": "1" }), false);
});

test("isOperatorRequest fails closed when a present session cannot be verified", async () => {
  const w = world();
  const cookie = w.seed("operator-token", "owner@example.com");
  const broken = createPublicAuth({
    getStore: () => ({ getWithMetadata: async () => { throw new Error("blob outage"); } }),
    now: () => NOW,
    env: { FANDOM_ADMIN_EMAILS: "owner@example.com" },
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await broken.isOperatorRequest(request("/x", cookie, {}), w.context), true);
    assert.equal(await broken.isOperatorRequest(request("/x", undefined, {}), w.context), false);
  } finally { console.warn = originalWarn; }
});

test("log-engagement: operator excluded, member and anonymous counted exactly once (positive control)", async () => {
  const w = world();
  const operator = w.seed("operator-token", "owner@example.com");
  const member = w.seed("member-token", "member@example.com");
  const engagement = w.get("engagement");
  const body = { event: "daily_drop_view", batchKey: "vibe-atlas:2026-10-21", editionDate: "2026-10-21" };

  const excluded = await logEngagement(request("/.netlify/functions/log-engagement", operator, body, { "x-fandom-operator": "false" }), w.context);
  assert.equal(excluded.status, 200);
  assert.equal((await excluded.json()).excluded, true);
  assert.equal(engagement.records.size, 0);

  assert.equal((await logEngagement(request("/.netlify/functions/log-engagement", member, body), w.context)).status, 200);
  assert.equal(engagement.records.size, 1);
  assert.equal((await logEngagement(request("/.netlify/functions/log-engagement", undefined, body), w.context)).status, 200);
  assert.equal(engagement.records.size, 2);
  const stored = JSON.stringify([...engagement.records.values()]);
  assert.doesNotMatch(stored, /owner@example\.com|member@example\.com|token/);
});

test("log-engagement: archive and grid events from operators are excluded too", async () => {
  const w = world();
  const operator = w.seed("operator-token", "owner@example.com");
  const archive = { event: "archive_page_view", batchKey: "archive-link-review", pagePath: "/vibe-atlas/archive" };
  assert.equal((await (await logEngagement(request("/.netlify/functions/log-engagement", operator, archive), w.context)).json()).excluded, true);
  assert.equal(w.get("engagement").records.size, 0);
});

test("released-pack-collect: operator session excluded, ordinary visitor counted", async () => {
  const w = world();
  const operator = w.seed("operator-token", "owner@example.com");
  const member = w.seed("member-token", "member@example.com");
  const handler = createReleasedPackCollectHandler({ auth: w.auth, getStore: w.get, now: () => NOW });
  const event = { event: "released_pack_opened", source: "daily_star", actor_id: "liu-xueyi", vibe_index: 3 };
  const store = w.get("released-pack-analytics");
  const before = () => [...w.get("released-pack-analytics").records.keys()].length;
  assert.equal((await (await handler(request("/c", operator, event))).json()).excluded, true);
  assert.equal(before(), 0);
  assert.equal((await handler(request("/c", member, event))).status, 200);
  assert.equal((await handler(request("/c", undefined, event))).status, 200);
  assert.equal(store.records.size, 2);
});

test("daily participation: operator session excluded (existing authority), member counted", async () => {
  const w = world();
  const operator = w.seed("operator-token", "owner@example.com");
  const member = w.seed("member-token", "member@example.com");
  const handler = createParticipationCollector({ auth: w.auth, getStore: w.get, now: () => NOW });
  const stage = { event: "daily_participation_stage", batchKey: "daily-participation", stage: "report_receipt_pending" };
  const { PARTICIPATION_BATCH } = await import("../../../shared/daily-participation.js");
  stage.batchKey = PARTICIPATION_BATCH;
  assert.equal((await (await handler(request("/c", operator, stage), w.context, stage)).json()).excluded, true);
  assert.equal(w.get("engagement").records.size, 0);
  assert.equal((await handler(request("/c", member, stage), w.context, stage)).status, 200);
  assert.equal(w.get("engagement").records.size, 1);
});
