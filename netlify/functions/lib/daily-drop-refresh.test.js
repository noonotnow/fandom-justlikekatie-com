import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  claimRefreshJob, dispatchDailyDropRefresh, refreshKey, REFRESH_HEADER,
  REFRESH_LEASE_MS, verifyRefreshRequest,
} from "./daily-drop-refresh.js";
import { createDailyDropRefreshWorker } from "./daily-drop-refresh-worker.js";
import { createDailyDropRefreshSchedule, config } from "../star-of-day-refresh-scheduled.js";
import { createStarOfDayHandler, tryAcquireLock } from "../star-of-day.js";

const timestamp = Date.parse("2026-10-06T16:00:00Z");
const date = "2026-10-07";
const env = {
  FANDOM_AUTH_ID_SECRET: "test-only-not-a-real-secret",
};
const productionContext = {
  deploy: { context: "production", id: "test-deploy", published: true },
  site: { name: "example", url: "https://example.netlify.app" },
};
const deployUrl = "https://test-deploy--example.netlify.app";
const credentials = { secret: env.FANDOM_AUTH_ID_SECRET, deployId: productionContext.deploy.id };

function storeForTests({ omitModified = false } = {}) {
  const records = new Map();
  let revision = 0;
  return {
    async get(key) { return structuredClone(records.get(key)?.data ?? null); },
    async getWithMetadata(key) {
      const value = records.get(key);
      return value ? structuredClone(value) : null;
    },
    async setJSON(key, data, options = {}) {
      const old = records.get(key);
      const modified = (!options.onlyIfNew || !old)
        && (!options.onlyIfMatch || old?.etag === options.onlyIfMatch);
      if (modified) records.set(key, { data: structuredClone(data), etag: String(++revision) });
      return omitModified ? undefined : { modified };
    },
    async delete(key) { records.delete(key); },
  };
}

async function queuedRequest(store, options = {}) {
  const { context = productionContext, ...dispatchOptions } = options;
  let request;
  await dispatchDailyDropRefresh(new Request("https://untrusted.example"), context, store, date, {
    env, now: timestamp,
    fetchImpl: async (url, init) => {
      request = new Request(url, init);
      return new Response(null, { status: 202 });
    },
    ...dispatchOptions,
  });
  return request;
}

test("a cache miss returns preparing immediately without searching or polling a generation lock", async () => {
  const store = storeForTests();
  let dispatched = 0;
  const handler = createStarOfDayHandler({
    getStore: () => store,
    today: () => date,
    startRefresh: async () => { dispatched++; return { status: "queued" }; },
  });
  const result = await handler(new Request("https://example.netlify.app/.netlify/functions/star-of-day"), {});
  assert.equal(result.status, 202);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("retry-after"), "5");
  assert.equal((await result.json()).building, true);
  assert.equal(dispatched, 1);
  assert.equal(await store.get(`starOfDay:v11:${date}:lock`), null);
});

test("dispatch failure is explicit and must not be cached as a public edition", async () => {
  const handler = createStarOfDayHandler({
    getStore: () => storeForTests(), today: () => date,
    startRefresh: async () => { throw new Error("dispatch unavailable"); },
  });
  const result = await handler(new Request("https://example.netlify.app"), {});
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal((await result.json()).rankedBatches.length, 0);
});

test("editorial exhaustion stays explicit rather than pretending yesterday is today's grid", async () => {
  const handler = createStarOfDayHandler({
    getStore: () => storeForTests(), today: () => date,
    startRefresh: async () => ({ status: "no_acceptable_batch" }),
  });
  const result = await handler(new Request("https://example.netlify.app"), {});
  assert.equal((await result.json()).error, "no_acceptable_batch");
});

test("one job wins simultaneous dispatch claims, including adapters without modified", async () => {
  for (const omitModified of [false, true]) {
    const store = storeForTests({ omitModified });
    const claims = await Promise.all(Array.from({ length: 6 }, () =>
      claimRefreshJob(store, date, productionContext.deploy.id, timestamp)));
    assert.equal(claims.filter(claim => claim.claimed).length, 1);
    assert.equal((await store.get(refreshKey(date))).expiresAt, timestamp + REFRESH_LEASE_MS);
  }
});

test("dispatch is signed, deploy-bound, and cannot use the request's hostile host", async () => {
  const store = storeForTests();
  const request = await queuedRequest(store);
  assert.equal(new URL(request.url).origin, productionContext.site.url);
  const body = await request.text();
  const token = request.headers.get(REFRESH_HEADER);
  assert.equal(verifyRefreshRequest(body, token, credentials, timestamp).date, date);
  assert.equal(verifyRefreshRequest(body + " ", token, credentials, timestamp), null);
  assert.equal(verifyRefreshRequest(body, token, { ...credentials, deployId: "other" }, timestamp), null);
  assert.equal(verifyRefreshRequest(body, token, credentials, timestamp + REFRESH_LEASE_MS + 1), null);
  assert.equal(verifyRefreshRequest(body, "", credentials, timestamp), null);
});

test("deploy previews cannot queue or run a job against shared production publication stores", async () => {
  const store = storeForTests();
  const previewContext = { ...productionContext, deploy: { ...productionContext.deploy, context: "deploy-preview", published: false } };
  await assert.rejects(queuedRequest(store, { context: previewContext }), /disabled outside production/);
  assert.equal(await store.get(refreshKey(date)), null);
  const request = await queuedRequest(store);
  await createDailyDropRefreshWorker({
    env,
    getStore: () => { throw new Error("preview must not touch publication stores"); },
  })(request, previewContext);
});

test("an accepted job is not dispatched again while its lease is live", async () => {
  const store = storeForTests();
  await queuedRequest(store);
  let called = false;
  await queuedRequest(store, { fetchImpl: async () => { called = true; throw new Error("duplicate"); } });
  assert.equal(called, false);
});

test("a rejected dispatch gets a bounded cooldown instead of a permanent queued state", async () => {
  const store = storeForTests();
  await assert.rejects(queuedRequest(store, {
    fetchImpl: async () => new Response(null, { status: 500 }),
  }), /could not start/);
  assert.equal((await store.get(refreshKey(date))).status, "failed");
  assert.ok((await store.get(refreshKey(date))).expiresAt < timestamp + REFRESH_LEASE_MS);
});

test("background worker rejects unsigned and unqueued requests without touching generation", async () => {
  const store = storeForTests();
  let generated = 0;
  const worker = createDailyDropRefreshWorker({
    env, getStore: () => store, now: () => timestamp,
    createHandler: () => { generated++; throw new Error("must not run"); },
  });
  await worker(new Request(deployUrl, { method: "POST", body: "{}" }), productionContext);
  const body = JSON.stringify({ date, jobId: "00000000-0000-0000-0000-000000000000", requestedAt: timestamp, deployId: productionContext.deploy.id });
  const header = createHmac("sha256", env.FANDOM_AUTH_ID_SECRET).update("daily-drop-refresh:v1\n").update(body).digest("hex");
  await worker(new Request(deployUrl, { method: "POST", body, headers: { [REFRESH_HEADER]: header } }), productionContext);
  assert.equal(generated, 0);
});

test("worker reuses approved generation with a full background lease and ignores replays", async () => {
  for (const omitModified of [false, true]) {
    const store = storeForTests({ omitModified });
    const request = await queuedRequest(store);
    let generated = 0;
    const worker = createDailyDropRefreshWorker({
      env, getStore: () => store, now: () => timestamp,
      createHandler: options => {
        generated++;
        assert.equal(options.today(), date);
        assert.equal(options.lockTtlMs, REFRESH_LEASE_MS);
        assert.equal(options.startRefresh, undefined);
        return async () => Response.json({ date, rankedBatches: [{ results: [] }] });
      },
    });
    await Promise.all([worker(request.clone(), productionContext), worker(request.clone(), productionContext)]);
    assert.equal(generated, 1);
    assert.equal((await store.get(refreshKey(date))).status, "ready");
    await worker(request.clone(), productionContext);
    assert.equal(generated, 1);
  }
});

test("worker failure and lack of approved images produce distinct durable outcomes", async () => {
  for (const [payload, responseStatus, expected] of [
    [{ date, error: "no_acceptable_batch", rankedBatches: [] }, 200, "no_acceptable_batch"],
    [{ error: "upstream unavailable" }, 500, "failed"],
  ]) {
    const store = storeForTests();
    const request = await queuedRequest(store);
    await createDailyDropRefreshWorker({
      env, getStore: () => store, now: () => timestamp,
      createHandler: () => async () => Response.json(payload, { status: responseStatus }),
    })(request, productionContext);
    assert.equal((await store.get(refreshKey(date))).status, expected);
  }
});

test("a long build lock prevents a second worker even after the former 25-second TTL", async () => {
  const store = storeForTests();
  const key = `starOfDay:v11:${date}:lock`;
  await store.setJSON(key, { startedAt: Date.now() - 60_000, expiresAt: Date.now() + 800_000, token: "worker" });
  assert.equal(await tryAcquireLock(store, date), null);
  await store.setJSON(key, { startedAt: Date.now() - 60_000, token: "old-timed-out-sync-worker" });
  assert.ok(await tryAcquireLock(store, date, REFRESH_LEASE_MS));
});

test("the scheduled trigger targets the new edition at noon Eastern in summer and winter", async () => {
  assert.equal(config.schedule, "0 16,17 * * *");
  for (const [instant, expectedDate] of [
    ["2026-10-06T16:00:00Z", "2026-10-07"],
    ["2027-01-15T17:00:00Z", "2027-01-16"],
    ["2026-03-08T16:00:00Z", "2026-03-09"],
    ["2026-11-01T17:00:00Z", "2026-11-02"],
    ["2026-12-31T17:00:00Z", "2027-01-01"],
  ]) {
    const store = storeForTests();
    let dispatchedDate;
    await createDailyDropRefreshSchedule({
      getStore: () => store, now: () => new Date(instant),
      dispatch: async (_req, _context, _store, date) => { dispatchedDate = date; return { status: "queued" }; },
    })(new Request(deployUrl), productionContext);
    assert.equal(dispatchedDate, expectedDate);
  }
});

test("the other UTC trigger does not read or mutate publication stores", async () => {
  for (const instant of ["2027-01-15T16:00:00Z", "2026-10-06T17:00:00Z", "2026-11-01T16:00:00Z"]) {
    const result = await createDailyDropRefreshSchedule({
      now: () => new Date(instant),
      getStore: () => { throw new Error("not noon Eastern"); },
      dispatch: () => { throw new Error("must not dispatch"); },
    })(new Request(deployUrl), productionContext);
    assert.equal(result.status, 204);
  }
});

test("winter public reads and signed workers cannot advance to the next edition at 11 a.m.", async () => {
  const instant = Date.parse("2027-01-15T16:00:00Z");
  for (const [clock, expectedDate] of [[instant, "2027-01-15"], [instant + 3_600_000, "2027-01-16"]]) {
    const handler = createStarOfDayHandler({
      getStore: () => storeForTests(), now: () => new Date(clock),
      startRefresh: async (_req, _context, _store, date) => {
        assert.equal(date, expectedDate);
        return { status: "queued" };
      },
    });
    assert.equal((await (await handler(new Request(deployUrl), productionContext)).json()).date, expectedDate);
    const body = JSON.stringify({
      date: "2027-01-16", jobId: "00000000-0000-0000-0000-000000000000",
      requestedAt: clock, deployId: productionContext.deploy.id,
    });
    const header = createHmac("sha256", env.FANDOM_AUTH_ID_SECRET).update("daily-drop-refresh:v1\n").update(body).digest("hex");
    assert.equal(verifyRefreshRequest(body, header, credentials, clock)?.date ?? null,
      expectedDate === "2027-01-16" ? expectedDate : null);
  }
});

test("runtime deployment metadata works without build variables and rejects unpublished or missing contexts", async () => {
  const request = await queuedRequest(storeForTests(), {
    env: { ...env, CONTEXT: "deploy-preview", DEPLOY_ID: "wrong", DEPLOY_URL: "https://untrusted.example" },
  });
  assert.equal(new URL(request.url).origin, productionContext.site.url);
  for (const context of [
    {}, { ...productionContext, deploy: { ...productionContext.deploy, published: false } },
  ]) {
    const store = storeForTests();
    await assert.rejects(queuedRequest(store, { context }), /disabled outside production/);
    await createDailyDropRefreshWorker({
      env, getStore: () => { throw new Error("untrusted deployment"); },
    })(request.clone(), context);
    const result = await createDailyDropRefreshSchedule({
      getStore: () => { throw new Error("untrusted deployment"); },
      now: () => new Date(timestamp),
    })(new Request(deployUrl), context);
    assert.equal(result.status, 204);
    assert.equal(await store.get(refreshKey(date)), null);
  }
});

test("dispatch can use the existing session-secret fallback without new configuration", async () => {
  const request = await queuedRequest(storeForTests(), {
    env: { SESSION_SECRET: "test-only-session-fallback" },
  });
  assert.ok(verifyRefreshRequest(await request.text(), request.headers.get(REFRESH_HEADER), {
    secret: "test-only-session-fallback", deployId: productionContext.deploy.id,
  }, timestamp));
});

test("published-site handoff starts the worker when permalink metadata is unpublished", async () => {
  for (const siteUrl of ["https://example.netlify.app", "https://published.example.com"]) {
    const context = { ...productionContext, site: { ...productionContext.site, url: siteUrl } };
    const store = storeForTests();
    let generated = 0;
    const worker = createDailyDropRefreshWorker({
      env, getStore: () => store, now: () => timestamp,
      createHandler: () => async () => {
        generated++;
        return Response.json({ date, rankedBatches: [{ results: [] }] });
      },
    });
    await dispatchDailyDropRefresh(new Request("https://hostile.example"), context, store, date, {
      env, now: timestamp,
      fetchImpl: async (url, init) => {
        const workerContext = new URL(url).origin === siteUrl ? context : {
          ...context, deploy: { ...context.deploy, published: false },
        };
        await worker(new Request(url, init), workerContext);
        return new Response(null, { status: 202 });
      },
    });
    assert.equal(generated, 1, "the worker must actually start, not just accept HTTP 202");
    assert.equal((await store.get(refreshKey(date))).status, "ready");
  }
});

test("published-site handoff cannot execute a job after the alias changes deployments", async () => {
  const store = storeForTests();
  let generated = 0;
  const worker = createDailyDropRefreshWorker({
    env, getStore: () => store, now: () => timestamp,
    createHandler: () => { generated++; throw new Error("must not generate"); },
  });
  await dispatchDailyDropRefresh(new Request("https://hostile.example"), productionContext, store, date, {
    env, now: timestamp,
    fetchImpl: async (url, init) => {
      await worker(new Request(url, init), {
        ...productionContext, deploy: { ...productionContext.deploy, id: "new-deploy" },
      });
      return new Response(null, { status: 202 });
    },
  });
  assert.equal(generated, 0);
  assert.equal((await store.get(refreshKey(date))).status, "queued");
  assert.equal((await store.get(refreshKey(date))).expiresAt, timestamp + REFRESH_LEASE_MS);
});

test("invalid trusted site addresses cannot create a refresh job", async () => {
  for (const url of [undefined, "not-a-url", "http://example.com", "https://user:pass@example.com",
    "https://example.com/path", "https://example.com/?host=other", "https://example.com/#other"]) {
    const store = storeForTests();
    await assert.rejects(dispatchDailyDropRefresh(new Request("https://hostile.example"), {
      ...productionContext, site: { ...productionContext.site, url },
    }, store, date, {
      env, now: timestamp, fetchImpl: () => { throw new Error("must not dispatch"); },
    }), /service address is unavailable/);
    assert.equal(await store.get(refreshKey(date)), null);
  }
});

test("a new deployment recovers an old unstarted handoff and rejects its replay", async () => {
  const store = storeForTests();
  const oldRequest = await queuedRequest(store);
  const context = { ...productionContext, deploy: { ...productionContext.deploy, id: "new-deploy" } };
  let generated = 0;
  const worker = createDailyDropRefreshWorker({
    env, getStore: () => store, now: () => timestamp,
    createHandler: () => async () => {
      generated++;
      return Response.json({ date, rankedBatches: [{ results: [] }] });
    },
  });
  await dispatchDailyDropRefresh(new Request("https://hostile.example"), context, store, date, {
    env, now: timestamp,
    fetchImpl: async (url, init) => {
      await worker(new Request(url, init), context);
      return new Response(null, { status: 202 });
    },
  });
  assert.equal(generated, 1);
  assert.equal((await store.get(refreshKey(date))).deployId, context.deploy.id);
  assert.equal((await store.get(refreshKey(date))).status, "ready");
  await worker(oldRequest, productionContext);
  assert.equal(generated, 1, "the displaced old job must not execute");
});

test("a deployment change never steals a running refresh lease", async () => {
  const store = storeForTests();
  const old = await claimRefreshJob(store, date, "old-deploy", timestamp);
  await store.setJSON(refreshKey(date), {
    ...old.job, status: "running", executionId: "active-worker",
  });
  const next = await claimRefreshJob(store, date, "new-deploy", timestamp + 1);
  assert.equal(next.claimed, false);
  assert.equal(next.job.jobId, old.job.jobId);
  assert.equal(next.job.status, "running");
  assert.equal(next.job.executionId, "active-worker");
});
