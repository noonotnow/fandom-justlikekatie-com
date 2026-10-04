import test from "node:test";
import assert from "node:assert/strict";
import { checkDiscussionCapacity, sendDiscussionCapacityAlert } from "./vibing-capacity.js";
import { createVibingCapacityScheduledHandler, config } from "../vibing-capacity-scheduled.js";
import { createVibingDiscussionHandler, ACTIVE_DISCUSSIONS } from "./vibing-discussion.js";

function store() {
  const records = new Map();
  let revision = 0;
  return {
    records,
    async getWithMetadata(key) {
      const record = records.get(key);
      return record ? structuredClone(record) : null;
    },
    async setJSON(key, data, options = {}) {
      await Promise.resolve();
      const old = records.get(key);
      if ((options.onlyIfNew && old) || (options.onlyIfMatch && old?.etag !== options.onlyIfMatch)) {
        return { modified: false };
      }
      records.set(key, { data: structuredClone(data), etag: `rev-${++revision}` });
      return { modified: true };
    },
  };
}

const ids = Object.keys(ACTIVE_DISCUSSIONS);
const now = new Date("2026-09-30T12:00:00.000Z");
function archive(storage, id, total, approved = 0) {
  const entries = Array.from({ length: total }, (_, index) => ({
    id: `r${index}`, text: "A response for testing.", status: index < approved ? "approved" : "pending",
    safeThroughEpisode: ACTIVE_DISCUSSIONS[id].safeThroughEpisode,
  }));
  storage.records.set(`discussion/${id}`, {
    data: { schemaVersion: 1, discussionId: id, entries }, etag: "archive-revision",
  });
}

test("hourly scheduled check alerts once per threshold, per discussion, without a panel visit", async () => {
  assert.equal(config.schedule, "@hourly");
  const storage = store();
  archive(storage, ids[0], 1600);
  archive(storage, ids[1], 1800, 1600);
  const sent = [];
  const check = () => checkDiscussionCapacity({
    store: storage, notify: async payload => sent.push(payload), now,
  });
  await check();
  await check();
  assert.deepEqual(sent.map(({ discussionId, category }) => [discussionId, category]), [
    [ids[0], "total"], [ids[1], "total"], [ids[1], "approved"],
  ]);
  assert.deepEqual(Object.keys(sent[0]).sort(),
    ["approved", "category", "discussionId", "limit", "observedAt", "total", "warningAt"]);
  archive(storage, ids[0], 1599);
  await check();
  archive(storage, ids[0], 1601, 1600);
  await check();
  assert.deepEqual(sent.slice(3).map(({ category }) => category), ["total", "approved"]);
});

test("failed reads and invalid archives cannot reset alerts or announce healthy capacity", async () => {
  const storage = store();
  archive(storage, ids[0], 1600);
  const sent = [];
  const check = () => checkDiscussionCapacity({ store: storage, now, notify: async p => sent.push(p) });
  await check();
  const original = storage.getWithMetadata;
  storage.getWithMetadata = key => {
    if (key === `discussion/${ids[0]}`) throw new Error("archive unavailable");
    return original(key);
  };
  await assert.rejects(check(), /Discussion capacity check failed/);
  storage.getWithMetadata = original;
  archive(storage, ids[0], 1600);
  await check();
  assert.equal(sent.length, 1);
  storage.records.get(`discussion/${ids[0]}`).data.entries[0].status = "invalid";
  await assert.rejects(check(), /Discussion capacity check failed/);
  assert.equal(sent.length, 1);
});

test("concurrent checks claim one delivery and failed delivery retries after the lease", async () => {
  const storage = store();
  archive(storage, ids[0], 1600);
  const sent = [];
  let first = true;
  const check = (time, notify) => checkDiscussionCapacity({ store: storage, now: time, notify });
  await assert.rejects(check(now, async () => {
    if (first) { first = false; throw new Error("delivery failed"); }
  }));
  await assert.rejects(check(new Date(now.getTime() + 60_000), async p => sent.push(p)));
  assert.equal(sent.length, 0);
  await check(new Date(now.getTime() + 16 * 60_000), async p => sent.push(p));
  assert.equal(sent.length, 1);
  const concurrent = await Promise.allSettled([check(now, async p => sent.push(p)),
    check(now, async p => sent.push(p))]);
  assert.equal(concurrent.every(result => result.status === "fulfilled"), true);
  assert.equal(sent.length, 1);
});

test("overlapping checks cannot deliver the same first crossing twice", async () => {
  const storage = store();
  archive(storage, ids[0], 1600);
  let release;
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const sent = [];
  const first = checkDiscussionCapacity({
    store: storage, now, notify: async p => { sent.push(p); started(); await barrier; },
  });
  await startedPromise;
  await assert.rejects(checkDiscussionCapacity({
    store: storage, now, notify: async p => sent.push(p),
  }), /Discussion capacity check failed/);
  release();
  await first;
  assert.equal(sent.length, 1);
});

test("operator delivery is counts-only and failure is not a success", async () => {
  const calls = [];
  const payload = {
    discussionId: ids[0], category: "approved", total: 1700, approved: 1600,
    warningAt: 1600, limit: 2000, observedAt: now.toISOString(),
  };
  const env = {
    FANDOM_ADMIN_EMAILS: "editor@example.test", FANDOM_AUTH_FROM_EMAIL: "ops@example.test",
    RESEND_API_KEY: "test-key",
  };
  await sendDiscussionCapacityAlert({ payload, env, fetchImpl: async (_url, request) => {
    calls.push(JSON.parse(request.body));
    return { ok: true };
  } });
  assert.deepEqual(calls[0].to, ["editor@example.test"]);
  assert.match(calls[0].text, /Protected approved replies: 1600/);
  assert.equal(JSON.stringify(calls[0]).includes("reader"), false);
  await assert.rejects(sendDiscussionCapacityAlert({
    payload, env, fetchImpl: async () => ({ ok: false, status: 503 }),
  }));
  const errors = [];
  const handler = createVibingCapacityScheduledHandler({
    getStore: () => { throw new Error("secret details"); },
    logger: { error: (...args) => errors.push(args) },
  });
  assert.equal((await handler(new Request("https://example.test/"), {})).status, 503);
  assert.equal(JSON.stringify(errors).includes("secret details"), false);
});

test("public discussion reads never include private capacity or alert state", async () => {
  const storage = store();
  archive(storage, ids[0], 1600);
  await checkDiscussionCapacity({ store: storage, now, notify: async () => {} });
  const handler = createVibingDiscussionHandler({
    getStore: () => storage,
    auth: { authenticateAdmin: async () => { throw Object.assign(new Error("denied"), { status: 403 }); } },
  });
  const url = `https://example.test/api/vibing-discussion?discussionId=${ids[0]}`;
  const publicBody = await (await handler(new Request(url), {})).json();
  assert.deepEqual(Object.keys(publicBody).sort(), ["discussion", "responses"]);
  assert.equal((await handler(new Request(`${url}&view=moderation`), {})).status, 403);
});