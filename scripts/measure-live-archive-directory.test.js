import assert from "node:assert/strict";
import test from "node:test";
import { measureLiveDirectory } from "./measure-live-archive-directory.js";

function fixture({ hasMore = false, status = 200, scope = "verified-directory" } = {}) {
  let time = Date.parse("2026-10-08T10:00:00Z");
  let verifiedAt = time;
  let finished = time;
  let generation = 0;
  const calls = [];
  const waits = [];
  const records = [];
  return {
    calls, waits, records,
    options: {
      clock: () => time,
      wait: async ms => { waits.push(ms); time += ms; },
      record: async value => records.push(structuredClone(value)),
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        const cold = calls.length === 1 || time >= finished + 60_000;
        if (cold) { generation++; verifiedAt = time; finished = time + 500; }
        time += cold ? 500 : 100;
        return new Response(JSON.stringify({
          actors: [{ id: "public-id", name: "Public name", privateField: "never retain" }],
          privateField: "never retain",
          page: { scanned: cold ? 34 : 0, hasMore, nextCursor: hasMore ? "2026-10-01" : null,
            unavailableCount: 1, partial: true, status: "partial" },
          actorInventory: {
            scope, complete: false, generation: String(generation),
            source: cold ? "verification" : "snapshot", cacheAvailable: true,
            freshness: "partial", verifiedAt: new Date(verifiedAt).toISOString(),
            expiresAt: new Date(verifiedAt + 900_000).toISOString(),
            retryAt: new Date(finished + 60_000).toISOString(),
            verifiedCandidates: 34, totalCandidates: 34, privateField: "never retain",
          },
        }), { status, headers: { "cache-control": "no-store" } });
      },
    },
  };
}

test("bounded public GET sampling waits for both deadlines and records only allowed diagnostics", async () => {
  const f = fixture();
  const result = await measureLiveDirectory(f.options);
  assert.equal(f.calls.length, 7);
  assert.equal(f.waits.length, 2);
  assert.equal(f.waits[1], 900_400);
  assert.ok(f.calls.every(call => call.url.endsWith("?directory=actors")
    && !call.options.method && !call.options.headers && call.options.signal));
  assert.deepEqual(result.samples.map(s => s.page.scanned), [34, 0, 0, 34, 0, 34, 0]);
  assert.equal(result.samples[3].actorInventory.generation, "2");
  assert.equal(result.samples[5].actorInventory.generation, "3");
  assert.ok(Date.parse(result.samples[5].requestedAt)
    > Date.parse(result.samples[3].actorInventory.expiresAt));
  assert.equal(f.records.length, 7);
  assert.doesNotMatch(JSON.stringify(f.records), /never retain|public-id|Public name|privateField/);
});

test("stops rather than issuing an unbounded continuation scan", async () => {
  const f = fixture({ hasMore: true });
  await assert.rejects(measureLiveDirectory(f.options), /bounded continuation/);
  assert.equal(f.calls.length, 3);
  assert.equal(f.waits.length, 0);
});

test("records unhealthy responses then stops without retrying or writing live state", async () => {
  for (const config of [{ status: 503 }, { scope: "verified-page" }]) {
    const f = fixture(config);
    await assert.rejects(measureLiveDirectory(f.options), /healthy verified-directory/);
    assert.equal(f.calls.length, 1);
    assert.equal(f.records.length, 1);
    assert.equal(f.waits.length, 0);
  }
});
