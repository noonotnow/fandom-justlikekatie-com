import test from "node:test";
import assert from "node:assert/strict";
import { createVibingDiscussionHandler, ACTIVE_DISCUSSIONS, pruneExpiredDiscussionRates } from "./vibing-discussion.js";

const id = "against-the-current-episode-21";
const origin = "https://fandom.example";
function store() {
  const records = new Map();
  let revision = 0;
  return {
    records,
    async getWithMetadata(key) {
      const entry = records.get(key);
      return entry ? structuredClone(entry) : null;
    },
    async setJSON(key, data, options = {}) {
      // Yield to force interleavings between independent requests.
      await Promise.resolve();
      const entry = records.get(key);
      if (options.onlyIfNew && entry || options.onlyIfMatch && options.onlyIfMatch !== entry?.etag) return { modified: false };
      records.set(key, { data: structuredClone(data), etag: `rev-${++revision}` });
      return { modified: true };
    },
    async get(key) { return structuredClone(records.get(key)?.data ?? null); },
    async delete(key) { records.delete(key); },
    async *list({ prefix, paginate }) {
      assert.equal(paginate, true);
      const keys = [...records.keys()].filter(key => key.startsWith(prefix)).sort();
      for (let i = 0; i < keys.length; i += 50) {
        yield { blobs: keys.slice(i, i + 50).map(key => ({ key })) };
      }
    },
  };
}
function setup({ admin = true, storage = store() } = {}) {
  let index = 0;
  const handler = createVibingDiscussionHandler({
    getStore: () => storage,
    auth: {
      getPublicActor: async req => ({ ownerId: req.headers.get("x-test-actor") || "actor-a" }),
      authenticateAdmin: async () => {
        if (!admin) throw Object.assign(new Error("Admin required."), { status: 403 });
      },
    },
    randomId: () => `reply-${++index}`,
    now: () => new Date("2026-09-27T12:00:00Z"),
  });
  return { handler, storage };
}
function req(method = "GET", value, query = "", headers = {}) {
  return new Request(`${origin}/api/vibing-discussion${query}`, {
    method, headers: method === "GET" ? headers : { origin, "content-type": "application/json", ...headers },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}
const input = (text = "I think Jialan should decide for herself.") => ({
  action: "submit", discussionId: id, safeThroughEpisode: 21, acceptBoundary: true, text,
});
const query = `?discussionId=${id}`;

test("only the explicitly activated article and fixed episode boundary are accepted", async () => {
  const { handler } = setup();
  assert.equal(Object.keys(ACTIVE_DISCUSSIONS).length, 2);
  assert.equal((await handler(req("GET", undefined, "?discussionId=against-the-current-episode-22"))).status, 404);
  assert.equal((await handler(req("GET", undefined, "?discussionId=../../episode-21"))).status, 404);
  assert.equal((await handler(req("POST", { ...input(), safeThroughEpisode: 22 }))).status, 400);
  assert.equal((await handler(req("POST", { ...input(), safeThroughEpisode: null }))).status, 400);
  const response = await (await handler(req("GET", undefined, query))).json();
  assert.equal(response.discussion.safeThroughEpisode, 21);
  assert.deepEqual(response.responses, []);
});

test("each installment keeps its own pending and approved archive, report scope, and fixed boundary", async () => {
  const { handler, storage } = setup();
  const topics = [
    [id, 21],
    ["against-the-current-episodes-22-25", 25],
  ];
  for (const [discussionId, safeThroughEpisode] of topics) {
    const thread = ACTIVE_DISCUSSIONS[discussionId];
    assert.equal(thread.safeThroughEpisode, safeThroughEpisode);
    assert.equal(thread.articlePath, `/c-drama-fandom/vibing-now/${discussionId}/`);
    const ownQuery = `?discussionId=${discussionId}`;
    const ownInput = { ...input(`A take about this installment through ${safeThroughEpisode}.`), discussionId, safeThroughEpisode };
    assert.equal((await handler(req("POST", { ...ownInput, safeThroughEpisode: 31 }))).status, 400);
    assert.equal((await handler(req("POST", ownInput))).status, 201);
    assert.deepEqual((await (await handler(req("GET", undefined, ownQuery))).json()).responses, []);
    const moderation = await (await handler(req("GET", undefined, `${ownQuery}&view=moderation`))).json();
    assert.equal(moderation.entries.length, 1);
    assert.equal(moderation.entries[0].safeThroughEpisode, safeThroughEpisode);
    assert.equal(storage.records.get(`discussion/${discussionId}`).data.discussionId, discussionId);
    assert.equal((await handler(req("POST", {
      action: "moderate", discussionId, entryId: moderation.entries[0].id, decision: "approve",
    }))).status, 200);
    assert.deepEqual((await (await handler(req("GET", undefined, ownQuery))).json()).responses,
      [{ id: moderation.entries[0].id, text: ownInput.text }]);
    for (const [otherId] of topics) {
      if (otherId === discussionId) continue;
      assert.equal((await handler(req("POST", {
        action: "report", discussionId: otherId, safeThroughEpisode: ACTIVE_DISCUSSIONS[otherId].safeThroughEpisode,
        entryId: moderation.entries[0].id,
      }))).status, 404);
    }
  }
  assert.equal(storage.records.get(`discussion/${id}`).data.entries[0].safeThroughEpisode, 21);
  assert.equal((await handler(req("POST", { ...input(), safeThroughEpisode: 25 }))).status, 400);
  for (const [discussionId, safeThroughEpisode] of topics) {
    assert.equal((await (await handler(req("GET", undefined, `?discussionId=${discussionId}`))).json()).discussion.safeThroughEpisode, safeThroughEpisode);
  }
});

test("private selector counts only actionable replies across archives and fails closed on storage errors", async () => {
  const storage = store();
  const ids = Object.keys(ACTIVE_DISCUSSIONS);
  const seed = async (discussionId, entries) => storage.setJSON(`discussion/${discussionId}`,
    { schemaVersion: 1, discussionId, entries }, { onlyIfNew: true });
  const entry = (id, status, reports = []) => ({
    id, text: `Private text ${id}`, status, safeThroughEpisode: 21,
    ownerId: "private-owner", reports,
  });
  await seed(ids[0], [
    entry("a", "pending"), entry("b", "pending"),
    entry("c", "approved", ["reporter-1", "reporter-2"]),
    entry("d", "hidden", ["reporter-3"]),
    entry("e", "rejected", ["reporter-4"]),
  ]);
  await seed(ids[1], [entry("f", "approved", ["reporter-5"])]);
  const { handler } = setup({ storage });
  const denied = setup({ admin: false, storage });
  const summaryQuery = "?view=moderation-summary";
  assert.equal((await denied.handler(req("GET", undefined, summaryQuery))).status, 403);
  const summary = await (await handler(req("GET", undefined, summaryQuery))).json();
  assert.deepEqual(summary, { topics: [
    { discussionId: ids[0], pending: 2, reported: 1 },
    { discussionId: ids[1], pending: 0, reported: 1 },
  ] });
  assert.doesNotMatch(JSON.stringify(summary), /private-owner|Private text|reporter-/);
  const publicResult = await (await handler(req("GET", undefined, `?discussionId=${ids[0]}`))).json();
  assert.equal(Object.hasOwn(publicResult, "topics"), false);
  assert.doesNotMatch(JSON.stringify(publicResult), /pending|reports|reporter-|private-owner/);
  assert.equal((await handler(req("POST", {
    action: "moderate", discussionId: ids[0], entryId: "a", decision: "approve",
  }))).status, 200);
  assert.equal((await handler(req("POST", {
    action: "moderate", discussionId: ids[0], entryId: "c", decision: "hide",
  }))).status, 200);
  assert.deepEqual((await (await handler(req("GET", undefined, summaryQuery))).json()).topics[0],
    { discussionId: ids[0], pending: 1, reported: 0 });
  storage.getWithMetadata = async key => {
    if (key === `discussion/${ids[1]}`) throw new Error("Storage unavailable.");
    return structuredClone(storage.records.get(key) ?? null);
  };
  const failed = await handler(req("GET", undefined, summaryQuery));
  assert.equal(failed.status, 503);
  assert.deepEqual(Object.keys(await failed.json()), ["error"]);
});

test("public writes are same-origin, bounded, rate-limited, and wait for approval", async () => {
  const { handler } = setup();
  assert.equal((await handler(req("POST", input(), "", { origin: "https://other.example" }))).status, 403);
  for (const text of ["short", "x".repeat(801), "good response\u0000bad"]) {
    assert.equal((await handler(req("POST", input(text)))).status, 400);
  }
  assert.equal((await handler(req("POST", { ...input(), website: "spam.example" }))).status, 202);
  assert.equal((await handler(req("POST", input()))).status, 201);
  assert.deepEqual((await (await handler(req("GET", undefined, query))).json()).responses, []);
  assert.equal((await handler(req("POST", input()))).status, 201);
  assert.equal((await handler(req("POST", input()))).status, 201);
  assert.equal((await handler(req("POST", input()))).status, 429);
  const big = req("POST", input("x".repeat(3000)));
  assert.equal((await handler(big)).status, 413);
});

test("concurrent submissions preserve both entries and moderation transitions remain private", async () => {
  const { handler } = setup();
  const results = await Promise.all([
    handler(req("POST", input("Jialan needs a choice of her own."), "", { "x-test-actor": "a" })),
    handler(req("POST", input("Care must leave room for her refusal."), "", { "x-test-actor": "b" })),
  ]);
  assert.deepEqual(results.map(r => r.status), [201, 201]);
  const admin = await (await handler(req("GET", undefined, `${query}&view=moderation`))).json();
  assert.equal(admin.entries.length, 2);
  const [first, second] = admin.entries;
  assert.equal((await handler(req("POST", { action: "moderate", discussionId: id, entryId: first.id, decision: "approve" }))).status, 200);
  assert.equal((await handler(req("POST", { action: "moderate", discussionId: id, entryId: second.id, decision: "reject" }))).status, 200);
  const publicResult = await (await handler(req("GET", undefined, query))).json();
  assert.deepEqual(publicResult.responses, [{ id: first.id, text: first.text }]);
  assert.doesNotMatch(JSON.stringify(publicResult), /ownerId|submittedAt|reports|Care must leave/);
  assert.equal((await handler(req("POST", { action: "report", discussionId: id, entryId: first.id, safeThroughEpisode: 21 }))).status, 200);
  assert.equal((await handler(req("POST", { action: "moderate", discussionId: id, entryId: first.id, decision: "hide" }))).status, 200);
  assert.deepEqual((await (await handler(req("GET", undefined, query))).json()).responses, []);
  assert.equal((await handler(req("POST", { action: "moderate", discussionId: id, entryId: first.id, decision: "approve" }))).status, 409);
});

test("unauthorized moderation and corrupt or failed storage never publish unpublished text", async () => {
  const storage = store();
  const allowed = setup({ storage });
  await allowed.handler(req("POST", input()));
  const entry = (await (await allowed.handler(req("GET", undefined, `${query}&view=moderation`))).json()).entries[0];
  const denied = setup({ admin: false, storage });
  assert.equal((await denied.handler(req("GET", undefined, `${query}&view=moderation`))).status, 403);
  assert.equal((await denied.handler(req("POST", { action: "moderate", discussionId: id, entryId: entry.id, decision: "approve" }))).status, 403);
  assert.deepEqual((await (await denied.handler(req("GET", undefined, query))).json()).responses, []);
  storage.records.get(`discussion/${id}`).data.entries[0].safeThroughEpisode = 22;
  assert.equal((await allowed.handler(req("POST", { action: "moderate", discussionId: id, entryId: entry.id, decision: "approve" }))).status, 409);
  storage.records.get(`discussion/${id}`).data.entries[0].status = "approved";
  assert.deepEqual((await (await allowed.handler(req("GET", undefined, query))).json()).responses, []);
  storage.records.get(`discussion/${id}`).data.entries[0].status = "unknown";
  assert.equal((await allowed.handler(req("GET", undefined, query))).status, 503);
  assert.equal((await allowed.handler(req("GET", undefined, `${query}&view=moderation`))).status, 503);
});

test("capacity counts stay admin-only and distinguish total records from protected approved replies", async () => {
  const storage = store();
  const key = `discussion/${id}`;
  const entries = [
    ...Array.from({ length: 1599 }, (_, i) => ({
      id: `approved-${i}`, text: "A visible reader reply.", status: "approved",
      safeThroughEpisode: 21, ownerId: "private-owner", reports: ["private-reporter"],
    })),
    { id: "pending", text: "A private submission.", status: "pending", safeThroughEpisode: 21 },
  ];
  await storage.setJSON(key, { schemaVersion: 1, discussionId: id, entries }, { onlyIfNew: true });
  const { handler } = setup({ storage });
  const denied = setup({ storage, admin: false });
  assert.equal((await denied.handler(req("GET", undefined, `${query}&view=moderation`))).status, 403);
  const moderation = await (await handler(req("GET", undefined, `${query}&view=moderation`))).json();
  assert.deepEqual(moderation.capacity, { total: 1600, approved: 1599, limit: 2000, warningAt: 1600 });
  assert.doesNotMatch(JSON.stringify(moderation.capacity), /private|owner|reporter|text/);
  const publicResult = await (await handler(req("GET", undefined, query))).json();
  assert.equal(Object.hasOwn(publicResult, "capacity"), false);
  assert.doesNotMatch(JSON.stringify(publicResult), /private|owner|reporter|pending/);

  storage.records.get(key).data.entries[1599].status = "approved";
  const atThreshold = await (await handler(req("GET", undefined, `${query}&view=moderation`))).json();
  assert.deepEqual(atThreshold.capacity, { total: 1600, approved: 1600, limit: 2000, warningAt: 1600 });
});

test("network and actor limits are independent, even when actors rotate", async () => {
  const { handler } = setup();
  for (let i = 0; i < 10; i++) {
    assert.equal((await handler(req("POST", input(), "", {
      "x-test-actor": `rotating-${i}`, "x-nf-client-connection-ip": "198.51.100.2",
    }))).status, 201);
  }
  assert.equal((await handler(req("POST", input(), "", {
    "x-test-actor": "rotating-10", "x-nf-client-connection-ip": "198.51.100.2",
  }))).status, 429);
  assert.equal((await handler(req("POST", input(), "", {
    "x-test-actor": "rotating-10", "x-nf-client-connection-ip": "198.51.100.3",
  }))).status, 201);
});

test("discussion rate cleanup removes elapsed buckets but leaves both live submission and report limits enforceable", async () => {
  const storage = store();
  const { handler } = setup({ storage });
  const network = { "x-nf-client-connection-ip": "198.51.100.4" };
  for (let i = 0; i < 3; i++) assert.equal((await handler(req("POST", input(), "", network))).status, 201);
  const current = new Date("2026-09-27T12:00:00Z");
  const liveKey = [...storage.records.keys()].find(key => key.startsWith("rate/"));
  const shard = Number.parseInt(liveKey[5], 16);
  const oldBucket = Math.floor(current.getTime() / (15 * 60 * 1000)) - 1;
  const oldEnd = new Date((oldBucket + 1) * 15 * 60 * 1000).toISOString();
  const oldKey = `${liveKey.slice(0, liveKey.lastIndexOf("/") + 1)}${oldBucket}`;
  await storage.setJSON(oldKey, { count: 3, expiresAt: oldEnd });
  const invalidKey = `${oldKey}1`;
  await storage.setJSON(invalidKey, { count: 2, expiresAt: "2026-12-01T00:00:00.000Z" });
  const result = await pruneExpiredDiscussionRates(storage, current, shard);
  assert.equal(result.deleted, 1);
  assert.equal(storage.records.has(oldKey), false);
  assert.equal(storage.records.has(liveKey), true);
  assert.equal(storage.records.has(invalidKey), true);
  assert.equal((await handler(req("POST", input(), "", network))).status, 429);

  const archiveKey = `discussion/${id}`;
  storage.records.get(archiveKey).data.entries[0].status = "approved";
  for (let i = 0; i < 6; i++) {
    assert.equal((await handler(req("POST", {
      action: "report", discussionId: id, safeThroughEpisode: 21, entryId: "reply-1",
    }, "", network))).status, 200);
  }
  await pruneExpiredDiscussionRates(storage, current, shard);
  assert.equal((await handler(req("POST", {
    action: "report", discussionId: id, safeThroughEpisode: 21, entryId: "reply-1",
  }, "", network))).status, 429);
});

test("discussion rate cleanup scans a bounded page and retries failed deletions without resetting limits", async () => {
  const storage = store();
  const current = new Date("2026-09-27T12:00:00Z");
  const bucket = Math.floor(current.getTime() / (15 * 60 * 1000)) - 2;
  const expiresAt = new Date((bucket + 1) * 15 * 60 * 1000).toISOString();
  const keys = Array.from({ length: 220 }, (_, i) => `rate/0${i.toString(16).padStart(63, "0")}/${bucket}`);
  for (const key of keys) await storage.setJSON(key, { count: 1, expiresAt });
  storage.list = async function* ({ prefix, paginate }) {
    assert.equal(prefix, "rate/0");
    assert.equal(paginate, true);
    yield { blobs: [...storage.records.keys()].filter(key => key.startsWith(prefix)).sort().map(key => ({ key })) };
    throw new Error("Cleanup must not fetch another listing page.");
  };
  const originalDelete = storage.delete;
  let fail = true;
  storage.delete = async key => {
    if (fail) { fail = false; throw new Error("Temporary storage failure"); }
    return originalDelete(key);
  };
  await assert.rejects(pruneExpiredDiscussionRates(storage, current, 0), /Temporary storage failure/);
  assert.equal(storage.records.size, 220);
  const first = await pruneExpiredDiscussionRates(storage, current, 0);
  assert.deepEqual(first, { scanned: 200, deleted: 200 });
  assert.deepEqual(await pruneExpiredDiscussionRates(storage, current, 0), { scanned: 20, deleted: 20 });
  assert.equal(storage.records.size, 0);
  assert.deepEqual(await pruneExpiredDiscussionRates(storage, current, 0), { scanned: 0, deleted: 0 });
});

test("a cleanup racing with live writes never removes an active window's counter", async () => {
  const storage = store();
  const { handler } = setup({ storage });
  const current = new Date("2026-09-27T12:00:00Z");
  const replies = await Promise.all([
    handler(req("POST", input())),
    ...Array.from({ length: 16 }, (_, shard) => pruneExpiredDiscussionRates(storage, current, shard)),
  ]);
  assert.equal(replies[0].status, 201);
  assert.deepEqual(replies.slice(1).map(result => result.deleted), Array(16).fill(0));
  assert.equal((await handler(req("POST", input()))).status, 201);
  assert.equal((await handler(req("POST", input()))).status, 201);
  assert.equal((await handler(req("POST", input()))).status, 429);
});

test("failed moderation writes leave replies pending, and failed public reads return no private archive", async () => {
  const storage = store();
  const { handler } = setup({ storage });
  assert.equal((await handler(req("POST", input()))).status, 201);
  const target = (await (await handler(req("GET", undefined, `${query}&view=moderation`))).json()).entries[0];
  const write = storage.setJSON;
  storage.setJSON = async (key, ...args) => {
    if (key.startsWith("discussion/")) throw new Error("Storage unavailable.");
    return write(key, ...args);
  };
  assert.equal((await handler(req("POST", { action: "moderate", discussionId: id, entryId: target.id, decision: "approve" }))).status, 503);
  assert.deepEqual((await (await handler(req("GET", undefined, query))).json()).responses, []);
  storage.getWithMetadata = async () => { throw new Error("Storage unavailable."); };
  const response = await handler(req("GET", undefined, query));
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(await response.json()).includes(target.text), false);
});

test("admin cleanup previews counts only and prunes expired non-public entries without touching approved reports", async () => {
  const storage = store();
  const key = `discussion/${id}`;
  const at = (date, status, more = {}) => ({
    id: `reply-${date}-${status}`, text: `Private ${status} text`, status,
    safeThroughEpisode: 21, submittedAt: date, moderatedAt: date, reports: [], ...more,
  });
  const old = "2026-01-01T00:00:00.000Z";
  const recent = "2026-09-01T00:00:00.000Z";
  const entries = [
    at(old, "pending"), at(old, "rejected"), at(old, "hidden"),
    at(old, "approved", { id: "public-reply", text: "The public reply stays visible.", reports: ["reporter-a"] }),
    at(recent, "pending"), at(recent, "rejected"), at(recent, "hidden"),
    at("invalid", "pending"), at("2026-06-29T12:00:00.000Z", "pending"), // exactly 90 days
  ];
  await storage.setJSON(key, { schemaVersion: 1, discussionId: id, entries }, { onlyIfNew: true });
  const { handler } = setup({ storage });
  const denied = setup({ storage, admin: false });
  assert.equal((await denied.handler(req("GET", undefined, `${query}&view=retention`))).status, 403);
  assert.equal((await denied.handler(req("POST", { action: "prune", discussionId: id }))).status, 403);
  assert.equal(storage.records.get(key).data.entries.length, entries.length);
  const preview = await (await handler(req("GET", undefined, `${query}&view=retention`))).json();
  assert.deepEqual(preview, { total: 9, eligible: { pending: 2, rejected: 1, hidden: 1 } });
  assert.doesNotMatch(JSON.stringify(preview), /Private|reporter|ownerId|reply-/);
  const result = await handler(req("POST", { action: "prune", discussionId: id }));
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).removed, preview.eligible);
  assert.deepEqual(storage.records.get(key).data.entries.map(entry => entry.id),
    ["public-reply", entries[4].id, entries[5].id, entries[6].id, entries[7].id]);
  assert.deepEqual(storage.records.get(key).data.entries[0].reports, ["reporter-a"]);
  assert.deepEqual((await (await handler(req("GET", undefined, query))).json()).responses,
    [{ id: "public-reply", text: "The public reply stays visible." }]);
  const revision = storage.records.get(key).etag;
  assert.deepEqual((await (await handler(req("POST", { action: "prune", discussionId: id }))).json()).removed,
    { pending: 0, rejected: 0, hidden: 0 });
  assert.equal(storage.records.get(key).etag, revision);
});

test("cleanup rechecks a conditional-write conflict and preserves a concurrent moderation decision", async () => {
  const storage = store();
  const key = `discussion/${id}`;
  const old = "2026-01-01T00:00:00.000Z";
  await storage.setJSON(key, { schemaVersion: 1, discussionId: id, entries: [
    { id: "old", text: "Old pending text", status: "pending", safeThroughEpisode: 21, submittedAt: old, reports: [] },
  ] }, { onlyIfNew: true });
  const { handler } = setup({ storage });
  const write = storage.setJSON;
  let collided = false;
  storage.setJSON = async (blobKey, data, options) => {
    if (blobKey === key && !collided) {
      collided = true;
      const current = storage.records.get(key).data;
      await write(key, { ...current, entries: current.entries.map(e => ({
        ...e, status: "approved", text: "Newly approved public text", moderatedAt: "2026-09-27T12:00:00.000Z",
        reports: ["reporter"],
      })) }, { onlyIfMatch: storage.records.get(key).etag });
    }
    return write(blobKey, data, options);
  };
  const response = await handler(req("POST", { action: "prune", discussionId: id }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).removed, { pending: 0, rejected: 0, hidden: 0 });
  assert.equal(storage.records.get(key).data.entries[0].status, "approved");
  assert.deepEqual(storage.records.get(key).data.entries[0].reports, ["reporter"]);
  assert.equal(storage.records.get(key).etag, "rev-2");
});

test("cleanup restores room in a full archive, but never evicts approved replies to do so", async () => {
  const storage = store();
  const key = `discussion/${id}`;
  const old = "2026-01-01T00:00:00.000Z";
  const entry = (i, status) => ({
    id: `entry-${i}`, text: "Approved public reply", status, safeThroughEpisode: 21,
    submittedAt: old, moderatedAt: old, reports: ["reporter"],
  });
  const { handler } = setup({ storage });
  await storage.setJSON(key, { schemaVersion: 1, discussionId: id,
    entries: [...Array.from({ length: 1999 }, (_, i) => entry(i, "approved")), entry(1999, "rejected")],
  }, { onlyIfNew: true });
  assert.equal((await handler(req("POST", input()))).status, 429);
  assert.deepEqual((await (await handler(req("POST", { action: "prune", discussionId: id }))).json()).removed,
    { pending: 0, rejected: 1, hidden: 0 });
  assert.equal((await handler(req("POST", input()))).status, 201);
  assert.equal(storage.records.get(key).data.entries.length, 2000);
  assert.equal(storage.records.get(key).data.entries.filter(e => e.status === "approved").length, 1999);
});

test("a full approved archive rejects new submissions explicitly without evicting public replies", async () => {
  const storage = store();
  const key = `discussion/${id}`;
  const entries = Array.from({ length: 2000 }, (_, i) => ({
    id: `approved-${i}`, text: "Visible public reply.", status: "approved", safeThroughEpisode: 21,
    reports: ["private-reporter"],
  }));
  await storage.setJSON(key, { schemaVersion: 1, discussionId: id, entries }, { onlyIfNew: true });
  const { handler } = setup({ storage });
  const originalEtag = storage.records.get(key).etag;
  const capacity = (await (await handler(req("GET", undefined, `${query}&view=moderation`))).json()).capacity;
  assert.deepEqual(capacity, { total: 2000, approved: 2000, limit: 2000, warningAt: 1600 });
  const failed = await handler(req("POST", input()));
  assert.equal(failed.status, 503);
  assert.match((await failed.json()).error, /full of approved replies.*paused until archive capacity is expanded/);
  assert.equal(storage.records.get(key).etag, originalEtag);
  assert.deepEqual((await (await handler(req("POST", { action: "prune", discussionId: id }))).json()).removed,
    { pending: 0, rejected: 0, hidden: 0 });
  assert.equal(storage.records.get(key).data.entries.length, 2000);
  assert.equal(storage.records.get(key).etag, originalEtag);
});