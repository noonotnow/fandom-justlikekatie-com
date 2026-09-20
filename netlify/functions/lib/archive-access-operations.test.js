import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStore } from "@netlify/blobs";
import { BlobsServer } from "@netlify/blobs/server";
import {
  ARCHIVE_ACCESS_RETENTION_STORE,
  config as retentionConfig,
} from "../archive-access-retention.js";
import {
  ARCHIVE_ACCESS_RETENTION_DAYS,
  archiveAccessHealth,
  createArchiveAccessOperationsHandler,
  createArchiveAccessRetentionHandler,
  notifyArchiveAccessTransitions,
  pruneExpiredArchiveAccessChecks,
  recordArchiveAccessCheck,
  sendArchiveAccessNotification,
} from "./archive-access-operations.js";
import {
  config as archiveAccessHealthSchedule,
  createArchiveAccessHealthScheduledHandler,
} from "../archive-access-health-scheduled.js";

function store() {
  const values = new Map();
  const versions = new Map();
  return {
    values,
    async get(key) { return structuredClone(values.get(key) ?? null); },
    async getWithMetadata(key) {
      if (!values.has(key)) return null;
      return {
        data: structuredClone(values.get(key)),
        etag: String(versions.get(key)),
      };
    },
    async setJSON(key, value, options = {}) {
      const exists = values.has(key);
      if (options.onlyIfNew && exists) return { modified: false };
      if (options.onlyIfMatch && String(versions.get(key)) !== options.onlyIfMatch) {
        return { modified: false };
      }
      values.set(key, structuredClone(value));
      versions.set(key, (versions.get(key) || 0) + 1);
      return { modified: true };
    },
    async delete(key) { values.delete(key); },
    async list({ prefix }) {
      return { blobs: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
  };
}

function paginatedStore(pageSize = 100) {
  const data = store();
  data.list = ({ prefix }) => ({
    async *[Symbol.asyncIterator]() {
      const blobs = [...data.values.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => ({ key }));
      for (let index = 0; index < blobs.length; index += pageSize) {
        yield { blobs: blobs.slice(index, index + pageSize) };
      }
    },
  });
  return data;
}

test("archive retention entry point keeps its daily schedule and operations store", async () => {
  assert.deepEqual(retentionConfig, { schedule: "@daily" });
  assert.equal(ARCHIVE_ACCESS_RETENTION_STORE, "archive-access-operations");

  const entryPoint = await readFile(
    new URL("../archive-access-retention.js", import.meta.url),
    "utf8",
  );
  assert.match(
    entryPoint,
    /getBlobStore\(\s*ARCHIVE_ACCESS_RETENTION_STORE\s*,\s*context\s*\)/,
  );
});

test("archive health separates anonymous gates from billing and denial incidents", async () => {
  const data = store();
  const now = new Date("2026-09-20T12:30:00.000Z");
  for (let index = 0; index < 100; index += 1) {
    await recordArchiveAccessCheck(data, { outcome: "sign_in", authenticated: false }, now);
  }
  for (let index = 0; index < 4; index += 1) {
    await recordArchiveAccessCheck(data, { outcome: "billing_delay", authenticated: true }, now);
  }
  for (let index = 0; index < 6; index += 1) {
    await recordArchiveAccessCheck(data, { outcome: "allowed", authenticated: true }, now);
  }
  const health = await archiveAccessHealth(data, now);
  assert.equal(health.totals.sign_in, 100);
  assert.equal(health.recentHour.authenticated_checks, 10);
  assert.equal(health.recentHour.billingDelayRate, 0.4);
  assert.equal(health.status.billing, "warning");
  assert.equal(health.status.deniedAccess, "normal");
  assert.equal(health.thresholds.anonymousPreviewsExcluded, true);
  assert.equal(JSON.stringify(health).includes("account"), false);
});

test("archive health endpoint is admin-only", async () => {
  const data = store();
  const denied = createArchiveAccessOperationsHandler({
    auth: { authenticateAdmin: async () => { const error = new Error("No"); error.status = 403; throw error; } },
    getStore: () => data,
  });
  assert.equal((await denied(new Request("https://example.test/report"), {})).status, 403);
});

test("billing persistence requires consecutive populated hours", async () => {
  const data = store();
  const now = new Date("2026-09-20T12:30:00.000Z");
  await recordArchiveAccessCheck(data, { outcome: "billing_delay", authenticated: true }, now);
  await recordArchiveAccessCheck(
    data,
    { outcome: "billing_delay", authenticated: true },
    new Date("2026-09-20T10:30:00.000Z"),
  );
  const health = await archiveAccessHealth(data, now);
  assert.equal(health.status.consecutiveBillingHours, 1);
  assert.equal(health.status.billing, "normal");
});

test("recent-hour alerts include checks immediately before the hour boundary", async () => {
  const data = store();
  const beforeBoundary = new Date("2026-09-20T11:59:00.000Z");
  for (let index = 0; index < 5; index += 1) {
    await recordArchiveAccessCheck(
      data,
      { outcome: "billing_delay", authenticated: true },
      beforeBoundary,
    );
  }
  for (let index = 0; index < 5; index += 1) {
    await recordArchiveAccessCheck(
      data,
      { outcome: "allowed", authenticated: true },
      new Date("2026-09-20T12:10:00.000Z"),
    );
  }
  const health = await archiveAccessHealth(data, new Date("2026-09-20T12:30:00.000Z"));
  assert.equal(health.recentHour.billing_delay, 5);
  assert.equal(health.recentHour.authenticated_checks, 10);
  assert.equal(health.status.billing, "critical");
});

test("recent-hour alerts recover after the failed checks leave the trailing window", async () => {
  const data = store();
  for (let index = 0; index < 5; index += 1) {
    await recordArchiveAccessCheck(
      data,
      { outcome: "billing_delay", authenticated: true },
      new Date("2026-09-20T11:59:00.000Z"),
    );
  }
  for (let index = 0; index < 10; index += 1) {
    await recordArchiveAccessCheck(
      data,
      { outcome: "allowed", authenticated: true },
      new Date("2026-09-20T12:45:00.000Z"),
    );
  }
  const health = await archiveAccessHealth(data, new Date("2026-09-20T13:00:01.000Z"));
  assert.equal(health.recentHour.billing_delay, 0);
  assert.equal(health.recentHour.authenticated_checks, 10);
  assert.equal(health.status.billing, "normal");
});

test("retention cleanup paginates high-volume records without changing the rolling report", async () => {
  const data = paginatedStore(37);
  const now = new Date("2026-09-20T12:30:00.000Z");
  const expired = new Date(now.getTime() - (ARCHIVE_ACCESS_RETENTION_DAYS * 24 + 1) * 60 * 60 * 1000);
  for (let index = 0; index < 1_250; index += 1) {
    await recordArchiveAccessCheck(data, { outcome: "allowed", authenticated: true }, expired);
  }
  for (let index = 0; index < 25; index += 1) {
    await recordArchiveAccessCheck(data, { outcome: "allowed", authenticated: true }, now);
  }

  const health = await archiveAccessHealth(data, now);

  assert.equal(health.totals.allowed, 25);
  assert.equal(data.values.size, 25);
});

test("retention keeps the exact boundary and cleanup is idempotent", async () => {
  const data = paginatedStore(1);
  const now = new Date("2026-09-20T12:30:00.000Z");
  const boundary = new Date(now.getTime() - ARCHIVE_ACCESS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = new Date(boundary.getTime() - 1);
  await recordArchiveAccessCheck(data, { outcome: "allowed", authenticated: true }, boundary);
  await recordArchiveAccessCheck(data, { outcome: "allowed", authenticated: true }, expired);

  await archiveAccessHealth(data, now);
  await archiveAccessHealth(data, now);

  assert.equal(data.values.size, 1);
  assert.equal([...data.values.values()][0].timestamp, boundary.toISOString());
});

test("retention matches Netlify Blobs paginated listing and repeated deletion contracts", async t => {
  const directory = await mkdtemp(join(tmpdir(), "archive-access-blobs-"));
  const server = new BlobsServer({ directory });
  const { address } = await server.start();
  t.after(async () => {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const data = getStore({
    edgeURL: address,
    name: "archive-access-contract",
    siteID: "test-site",
    token: "test-token",
  });
  const now = new Date("2026-09-20T12:30:00.000Z");
  const expired = new Date(now.getTime() - (ARCHIVE_ACCESS_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
  const writes = Array.from({ length: 1_001 }, (_, index) =>
    data.setJSON(
      `archive-access:hour:${expired.toISOString().slice(0, 13)}:${expired.getTime()}:${index}`,
      { timestamp: expired.toISOString(), outcome: "allowed", authenticated: true },
    ));
  await Promise.all(writes);

  assert.equal(await pruneExpiredArchiveAccessChecks(data, now), 1_001);
  assert.equal(await pruneExpiredArchiveAccessChecks(data, now), 0);
  assert.deepEqual((await data.list()).blobs, []);
  await assert.doesNotReject(data.delete(
    `archive-access:hour:${expired.toISOString().slice(0, 13)}:${expired.getTime()}:0`,
  ));
});

test("archive health matches Netlify Blobs strong JSON read contract", async t => {
  const directory = await mkdtemp(join(tmpdir(), "archive-access-health-blobs-"));
  const server = new BlobsServer({ directory });
  const { address } = await server.start();
  t.after(async () => {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const data = getStore({
    edgeURL: address,
    uncachedEdgeURL: address,
    name: "archive-access-health-contract",
    siteID: "test-site",
    token: "test-token",
  });
  const now = new Date("2026-09-20T12:30:00.000Z");
  await data.setJSON(
    `archive-access:hour:${now.toISOString().slice(0, 13)}:${now.getTime()}:current`,
    { timestamp: now.toISOString(), outcome: "allowed", authenticated: true },
  );

  const health = await archiveAccessHealth(data, now);

  assert.equal(health.totals.allowed, 1);
  assert.equal(health.recentHour.authenticated_checks, 1);
  assert.deepEqual(health.buckets, [{
    hour: "2026-09-20T12",
    counts: {
      sign_in: 0,
      upgrade: 0,
      billing_delay: 0,
      allowed: 1,
      authenticated_checks: 1,
    },
  }]);
});

test("cleanup failures do not fail or distort the rolling report", async () => {
  const data = paginatedStore(2);
  const now = new Date("2026-09-20T12:30:00.000Z");
  await recordArchiveAccessCheck(
    data,
    { outcome: "allowed", authenticated: true },
    new Date(now.getTime() - (ARCHIVE_ACCESS_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000),
  );
  await recordArchiveAccessCheck(data, { outcome: "billing_delay", authenticated: true }, now);
  data.delete = async () => { throw new Error("temporary delete failure"); };

  const health = await archiveAccessHealth(data, now);

  assert.equal(health.totals.billing_delay, 1);
  assert.equal(health.recentHour.authenticated_checks, 1);
});
test("concurrent report and scheduled retention cleanups are idempotent", async () => {
  const data = paginatedStore(2);
  const now = new Date("2026-09-20T12:30:00.000Z");
  const expired = new Date(now.getTime() - (ARCHIVE_ACCESS_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
  await recordArchiveAccessCheck(data, { outcome: "allowed", authenticated: true }, expired);
  await recordArchiveAccessCheck(data, { outcome: "allowed", authenticated: true }, expired);
  await recordArchiveAccessCheck(data, { outcome: "allowed", authenticated: true }, now);
  const originalDelete = data.delete;
  data.delete = async key => {
    await new Promise(resolve => setTimeout(resolve, 1));
    await originalDelete(key);
  };

  const [health] = await Promise.all([
    archiveAccessHealth(data, now),
    pruneExpiredArchiveAccessChecks(data, now),
  ]);

  assert.equal(health.totals.allowed, 1);
  assert.equal(data.values.size, 1);
  assert.equal([...data.values.values()][0].timestamp, now.toISOString());
});

test("scheduled retention can run repeatedly and isolates cleanup failures", async () => {
  const data = paginatedStore(1);
  const now = new Date("2026-09-20T12:30:00.000Z");
  const expired = new Date(now.getTime() - (ARCHIVE_ACCESS_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
  await recordArchiveAccessCheck(data, { outcome: "allowed", authenticated: true }, expired);
  const messages = [];
  const handler = createArchiveAccessRetentionHandler({
    getStore: () => data,
    now: () => now,
    logger: {
      log: message => messages.push(message),
      error: (...args) => messages.push(args),
    },
  });

  await handler(new Request("https://example.test/scheduled"), {});
  await handler(new Request("https://example.test/scheduled"), {});
  assert.equal(data.values.size, 0);
  assert.match(messages[0], /deleted 1/);
  assert.match(messages[1], /deleted 0/);

  data.list = async () => { throw new Error("temporary listing failure"); };
  await assert.doesNotReject(handler(new Request("https://example.test/scheduled"), {}));
  assert.equal(Array.isArray(messages[2]), true);
  assert.match(messages[2][0], /cleanup failed/);
});

test("warning, escalation, and recovery transitions notify once with aggregate fields only", async () => {
  const data = store();
  const sent = [];
  const base = {
    generatedAt: "2026-09-20T12:30:00.000Z",
    recentHour: {
      billing_delay: 4,
      upgrade: 0,
      authenticated_checks: 10,
      billingDelayRate: 0.4,
      deniedAccessRate: 0,
    },
    status: { billing: "warning", deniedAccess: "normal" },
  };
  const notify = async payload => sent.push(payload);
  await notifyArchiveAccessTransitions({ store: data, health: base, notify });
  await notifyArchiveAccessTransitions({ store: data, health: base, notify });
  await notifyArchiveAccessTransitions({
    store: data,
    health: { ...base, status: { ...base.status, billing: "critical" } },
    notify,
  });
  await notifyArchiveAccessTransitions({
    store: data,
    health: {
      ...base,
      recentHour: { ...base.recentHour, billing_delay: 0, billingDelayRate: 0 },
      status: { ...base.status, billing: "normal" },
    },
    notify,
  });
  assert.deepEqual(sent.map(item => item.status), ["warning", "critical", "resolved"]);
  assert.deepEqual(Object.keys(sent[0]).sort(), [
    "authenticatedChecks", "count", "kind", "rate", "signalCategory", "status",
    "windowMinutes",
  ]);
});

test("critical de-escalation is silent but a later re-escalation notifies", async () => {
  const data = store();
  const sent = [];
  const health = status => ({
    recentHour: {
      billing_delay: status === "critical" ? 5 : 3,
      authenticated_checks: 10,
      billingDelayRate: status === "critical" ? 0.5 : 0.3,
    },
    status: { billing: status, deniedAccess: "normal" },
  });
  const notify = async payload => sent.push(payload);
  await notifyArchiveAccessTransitions({ store: data, health: health("critical"), notify });
  await notifyArchiveAccessTransitions({ store: data, health: health("warning"), notify });
  await notifyArchiveAccessTransitions({ store: data, health: health("critical"), notify });
  assert.deepEqual(sent.map(item => item.status), ["critical", "critical"]);
});

test("concurrent transition evaluations claim a single notification", async () => {
  const data = store();
  const health = {
    recentHour: {
      billing_delay: 4,
      authenticated_checks: 10,
      billingDelayRate: 0.4,
    },
    status: { billing: "warning", deniedAccess: "normal" },
  };
  let release;
  const claimed = new Promise(resolve => { release = resolve; });
  let deliveries = 0;
  const notify = async () => {
    deliveries += 1;
    if (deliveries === 1) await claimed;
  };
  const first = notifyArchiveAccessTransitions({ store: data, health, notify });
  await new Promise(resolve => setImmediate(resolve));
  const second = await notifyArchiveAccessTransitions({ store: data, health, notify });
  release();
  const firstResult = await first;
  assert.equal(deliveries, 1);
  assert.equal(firstResult.length, 1);
  assert.deepEqual(second, []);
});

test("anonymous previews and sign-in gates cannot trigger notifications", async () => {
  const data = store();
  const now = new Date("2026-09-20T12:30:00.000Z");
  for (let index = 0; index < 100; index += 1) {
    await recordArchiveAccessCheck(data, { outcome: "sign_in", authenticated: false }, now);
  }
  const health = await archiveAccessHealth(data, now);
  const sent = [];
  const notifications = await notifyArchiveAccessTransitions({
    store: data,
    health,
    notify: async payload => sent.push(payload),
  });
  assert.deepEqual(notifications, []);
  assert.deepEqual(sent, []);
});

test("notification delivery failure never changes the health response", async () => {
  const data = store();
  const now = new Date("2026-09-20T12:30:00.000Z");
  for (let index = 0; index < 4; index += 1) {
    await recordArchiveAccessCheck(data, { outcome: "billing_delay", authenticated: true }, now);
  }
  for (let index = 0; index < 6; index += 1) {
    await recordArchiveAccessCheck(data, { outcome: "allowed", authenticated: true }, now);
  }
  const errors = [];
  const handler = createArchiveAccessOperationsHandler({
    auth: { authenticateAdmin: async () => {} },
    getStore: () => data,
    now: () => now,
    notify: async () => { throw new Error("delivery unavailable"); },
    logger: { error: (...args) => errors.push(args) },
  });
  const result = await handler(new Request("https://example.test/report"), {});
  const body = await result.json();
  assert.equal(result.status, 200);
  assert.equal(body.status.billing, "warning");
  assert.deepEqual(body.notifications, []);
  assert.deepEqual(body.notificationDelivery, {
    status: "failure",
    attemptedAt: now.toISOString(),
    lastSucceededAt: null,
    lastFailedAt: now.toISOString(),
    consecutiveFailures: 1,
  });
  assert.equal(errors.length, 1);
});

test("repeated delivery failures remain a bounded summary and success resets the streak", async () => {
  const data = store();
  const now = new Date("2026-09-20T12:30:00.000Z");
  const health = {
    recentHour: {
      billing_delay: 4,
      authenticated_checks: 10,
      billingDelayRate: 0.4,
    },
    status: { billing: "warning", deniedAccess: "normal" },
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(notifyArchiveAccessTransitions({
      store: data,
      health,
      now: new Date(now.getTime() + attempt * 60_000),
      notify: async () => { throw new Error("provider details must not be retained"); },
    }));
  }

  const failedState = data.values.get("archive-access:notification-state");
  assert.equal(failedState.delivery.status, "failure");
  assert.equal(failedState.delivery.consecutiveFailures, 3);
  assert.equal(JSON.stringify(failedState).includes("provider details"), false);
  assert.equal(Object.keys(failedState).length, 3);

  const successAt = new Date(now.getTime() + 3 * 60_000);
  await notifyArchiveAccessTransitions({
    store: data,
    health,
    now: successAt,
    notify: async () => {},
  });
  assert.deepEqual(data.values.get("archive-access:notification-state").delivery, {
    status: "success",
    attemptedAt: successAt.toISOString(),
    lastSucceededAt: successAt.toISOString(),
    lastFailedAt: new Date(now.getTime() + 2 * 60_000).toISOString(),
    consecutiveFailures: 0,
  });
});

test("scheduled archive health runs hourly through shared transitions and isolates failures", async () => {
  assert.equal(archiveAccessHealthSchedule.schedule, "@hourly");

  const data = store();
  const generatedAt = new Date("2026-09-20T12:30:00.000Z");
  const health = { status: { billing: "warning", deniedAccess: "normal" } };
  const calls = [];
  const errors = [];
  const handler = createArchiveAccessHealthScheduledHandler({
    getStore: context => {
      calls.push(["store", context]);
      return data;
    },
    getHealth: async (...args) => {
      calls.push(["health", ...args]);
      return health;
    },
    notifyTransitions: async options => {
      calls.push(["transitions", options]);
      await options.notify({ signalCategory: "billing_delay" });
    },
    notify: async () => { throw new Error("delivery unavailable for private account"); },
    now: () => generatedAt,
    logger: { error: (...args) => errors.push(args) },
  });
  const context = { requestId: "scheduled-test" };

  const deliveryFailure = await handler(new Request("https://example.test/scheduled"), context);

  assert.equal(deliveryFailure.status, 204);
  assert.deepEqual(calls[0], ["store", context]);
  assert.deepEqual(calls[1], ["health", data, generatedAt]);
  assert.equal(calls[2][0], "transitions");
  assert.equal(calls[2][1].store, data);
  assert.equal(calls[2][1].health, health);
  assert.equal(calls[2][1].now, generatedAt);
  assert.equal(errors.length, 1);
  assert.equal(await deliveryFailure.text(), "");

  const storageHandler = createArchiveAccessHealthScheduledHandler({
    getStore: () => data,
    getHealth: async () => { throw new Error("storage unavailable for private account"); },
    logger: { error: (...args) => errors.push(args) },
  });
  const storageFailure = await storageHandler(new Request("https://example.test/scheduled"), {});

  assert.equal(storageFailure.status, 204);
  assert.equal(errors.length, 2);
  assert.equal(await storageFailure.text(), "");
});

test("notification email contains aggregate operations data only", async () => {
  let request;
  await sendArchiveAccessNotification({
    payload: {
      kind: "incident",
      signalCategory: "billing_delay",
      status: "warning",
      count: 4,
      authenticatedChecks: 10,
      rate: 0.4,
      windowMinutes: 60,
    },
    env: {
      RESEND_API_KEY: "test-key",
      FANDOM_AUTH_FROM_EMAIL: "Fandom <ops@example.test>",
      FANDOM_ADMIN_EMAILS: "admin@example.test",
    },
    fetchImpl: async (...args) => {
      request = args;
      return new Response(null, { status: 202 });
    },
  });
  const message = JSON.parse(request[1].body);
  assert.deepEqual(message.to, ["admin@example.test"]);
  assert.match(message.text, /Count: 4/);
  assert.match(message.text, /Rate: 40%/);
  assert.doesNotMatch(message.text, /customer|account|session|email|url/i);
});
