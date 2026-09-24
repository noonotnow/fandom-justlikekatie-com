import test from "node:test";
import assert from "node:assert/strict";
import { createReleasedPackCollectHandler, createReleasedPackReportHandler } from "./released-pack-analytics.js";

function fixture() {
  const blobs = new Map();
  const store = {
    async setJSON(key, value) { blobs.set(key, structuredClone(value)); },
    async get(key) { return structuredClone(blobs.get(key)); },
    async *list() {
      const keys = [...blobs.keys()];
      yield { blobs: keys.slice(0, 8).map(key => ({ key })) };
      yield { blobs: keys.slice(8).map(key => ({ key })) };
    },
  };
  const auth = { async authenticateAdmin(req) {
    if (!req.headers?.get("x-admin")) throw Object.assign(new Error("Admin required."), { status: 403 });
  } };
  return {
    blobs,
    collect: createReleasedPackCollectHandler({ getStore: () => store, now: () => new Date("2026-09-24T12:00:00Z") }),
    report: createReleasedPackReportHandler({ auth, getStore: () => store, now: () => new Date("2026-09-26T12:00:00Z") }),
  };
}

const base = { event: "released_pack_opened", source: "daily_star", actor_id: "liu-xueyi", vibe_index: 3 };
function post(body) {
  return new Request("https://example.com/.netlify/functions/released-pack-collect", {
    method: "POST", body: JSON.stringify(body),
  });
}
function get(query, admin = true) {
  return new Request(`https://example.com/.netlify/functions/released-pack-report${query}`, {
    headers: admin ? { "x-admin": "1" } : {},
  });
}

test("collector retains only allowlisted event dimensions, never visitor data", async () => {
  const { collect, blobs } = fixture();
  const response = await collect(post({ ...base, email: "private@example.com", capability: "secret", visitorId: "raw" }));
  assert.equal(response.status, 200);
  assert.deepEqual([...blobs.values()][0], { ...base, timestamp: "2026-09-24T12:00:00.000Z" });
  for (const invalid of [
    { ...base, actor_id: "Private Email" },
    { ...base, vibe_index: 100 },
    { ...base, source: "arbitrary" },
    { event: "released_library_opened", source: "daily_star" },
    { ...base, entitled: true },
  ]) assert.equal((await collect(post(invalid))).status, 400);
});

test("admin report is date-bounded, paginated, suppressed, and contains no raw events", async () => {
  const { collect, report, blobs } = fixture();
  for (let i = 0; i < 11; i++) await collect(post(base));
  for (let i = 0; i < 3; i++) await collect(post({ ...base, source: "public_record", actor_id: "rare-actor" }));
  blobs.set("2026-09-23/older", { ...base, timestamp: "2026-09-23T23:00:00Z" });
  assert.equal((await report(get("?from=2026-09-24&to=2026-09-25", false))).status, 403);
  const response = await report(get("?from=2026-09-24&to=2026-09-25"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.bySource, [{ event: base.event, source: "daily_star", count: 11 }]);
  assert.deepEqual(body.byActorAndVibe, [{ event: base.event, actor_id: "liu-xueyi", vibe_index: 3, count: 11 }]);
  assert.equal(JSON.stringify(body).includes("rare-actor"), false);
  assert.equal(JSON.stringify(body).includes("timestamp"), false);
  assert.equal(body.records, undefined);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  for (const range of ["", "?from=2026-09-25&to=2026-09-24", "?from=2026-09-24&to=2026-11-01"]) {
    assert.equal((await report(get(range))).status, 400);
  }
});