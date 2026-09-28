import test from "node:test";
import assert from "node:assert/strict";
import { createVibingDiscussionHandler, ACTIVE_DISCUSSIONS } from "./vibing-discussion.js";

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
  assert.equal(Object.keys(ACTIVE_DISCUSSIONS).length, 1);
  assert.equal((await handler(req("GET", undefined, "?discussionId=against-the-current-episode-22"))).status, 404);
  assert.equal((await handler(req("GET", undefined, "?discussionId=../../episode-21"))).status, 404);
  assert.equal((await handler(req("POST", { ...input(), safeThroughEpisode: 22 }))).status, 400);
  assert.equal((await handler(req("POST", { ...input(), safeThroughEpisode: null }))).status, 400);
  const response = await (await handler(req("GET", undefined, query))).json();
  assert.equal(response.discussion.safeThroughEpisode, 21);
  assert.deepEqual(response.responses, []);
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