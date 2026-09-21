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
  archiveAccessNotificationDeliveryHealth,
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

test("notification state repairs malformed and invalid blobs through conditional strong reads", async t => {
  const directory = await mkdtemp(join(tmpdir(), "archive-access-notification-blobs-"));
  const server = new BlobsServer({ directory });
  const { address } = await server.start();
  t.after(async () => {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const data = getStore({
    edgeURL: address,
    uncachedEdgeURL: address,
    name: "archive-access-notification-contract",
    siteID: "test-site",
    token: "test-token",
  });
  const metadataReads = [];
  const writes = [];
  const originalGetWithMetadata = data.getWithMetadata.bind(data);
  const originalSetJSON = data.setJSON.bind(data);
  data.getWithMetadata = async (key, options) => {
    metadataReads.push({ method: "getWithMetadata", key, options });
    return originalGetWithMetadata(key, options);
  };
  data.setJSON = async (key, value, options) => {
    const result = await originalSetJSON(key, value, options);
    writes.push({ key, value, options, result });
    return result;
  };
  const health = status => ({
    recentHour: {
      billing_delay: status === "normal" ? 0 : 4,
      authenticated_checks: 10,
      billingDelayRate: status === "normal" ? 0 : 0.4,
    },
    status: { billing: status, deniedAccess: "normal" },
  });
  const firstNow = new Date("2026-09-20T12:30:00.000Z");

  await data.set("archive-access:notification-state", "{not-json");
  await notifyArchiveAccessTransitions({
    store: data,
    health: health("warning"),
    notify: async () => {},
    now: firstNow,
  });
  const first = await data.getWithMetadata(
    "archive-access:notification-state",
    { type: "json", consistency: "strong" },
  );
  const firstEtag = writes.at(-1).result.etag;

  assert.equal(typeof firstEtag, "string");
  assert.deepEqual(first.data.signals.billing, {
    status: "warning",
    notifiedAt: firstNow.toISOString(),
    updatedAt: firstNow.toISOString(),
  });
  assert.equal(typeof first.data, "object");
  assert.ok(metadataReads.length >= 2);
  assert.ok(metadataReads.every(read =>
    [
      "archive-access:notification-state",
      "archive-access:notification-repairs",
    ].includes(read.key)
    && read.options?.consistency === "strong"));
  assert.ok(metadataReads.some(read =>
    read.method === "getWithMetadata" && read.options?.type === "text"));

  const secondNow = new Date("2026-09-20T13:30:00.000Z");
  await data.setJSON("archive-access:notification-state", {
    signals: {
      billing: {
        pending: true,
        claimId: "corrupted-claim",
        claimedAt: "2999-01-01T00:00:00.000Z",
        previousStatus: "normal",
        targetStatus: "warning",
      },
    },
  });
  await notifyArchiveAccessTransitions({
    store: data,
    health: health("warning"),
    notify: async () => {},
    now: secondNow,
  });
  const second = await data.getWithMetadata(
    "archive-access:notification-state",
    { type: "json", consistency: "strong" },
  );
  const secondEtag = writes.at(-1).result.etag;

  assert.notEqual(secondEtag, firstEtag);
  assert.deepEqual(second.data.signals.billing, {
    status: "warning",
    notifiedAt: secondNow.toISOString(),
    updatedAt: secondNow.toISOString(),
  });
  assert.deepEqual(await data.setJSON(
    "archive-access:notification-state",
    { updatedAt: "stale", signals: {} },
    { onlyIfMatch: firstEtag },
  ), { modified: false });
  assert.deepEqual(
    (await data.getWithMetadata(
      "archive-access:notification-state",
      { type: "json", consistency: "strong" },
    )).data,
    second.data,
  );
});

test("corrupt-state repair does not overwrite a concurrent valid transition", async () => {
  const data = store();
  await data.setJSON("archive-access:notification-state", "{not-json");
  const originalSetJSON = data.setJSON;
  let injected = false;
  data.setJSON = async (key, value, options) => {
    if (!injected && options.onlyIfMatch) {
      injected = true;
      await originalSetJSON(key, {
        updatedAt: "2026-09-20T12:31:00.000Z",
        signals: { billing: { status: "warning", notifiedAt: "2026-09-20T12:31:00.000Z" } },
      });
    }
    return originalSetJSON(key, value, options);
  };
  let deliveries = 0;
  const repairs = [];

  const notifications = await notifyArchiveAccessTransitions({
    store: data,
    health: {
      recentHour: { billing_delay: 4, authenticated_checks: 10, billingDelayRate: 0.4 },
      status: { billing: "warning", deniedAccess: "normal" },
    },
    notify: async () => { deliveries += 1; },
    now: new Date("2026-09-20T12:30:00.000Z"),
    logger: { warn: (...args) => repairs.push(args) },
  });

  assert.deepEqual(notifications, []);
  assert.equal(deliveries, 0);
  assert.deepEqual(repairs, []);
  assert.equal(data.values.get("archive-access:notification-state").signals.billing.notifiedAt,
    "2026-09-20T12:31:00.000Z");
});

test("malformed notification state emits one bounded repair signal and exposes repair health", async () => {
  const data = store();
  const repairedAt = new Date("2026-09-20T12:30:00.000Z");
  const repairs = [];
  await data.setJSON("archive-access:notification-state", "{private-corrupt-contents");

  await notifyArchiveAccessTransitions({
    store: data,
    health: {
      recentHour: { billing_delay: 0, authenticated_checks: 1, billingDelayRate: 0 },
      status: { billing: "normal", deniedAccess: "normal" },
    },
    notify: async () => {},
    now: repairedAt,
    logger: { warn: (...args) => repairs.push(args) },
  });

  assert.deepEqual(repairs, [[
    "[archive-access] notification state repaired",
    { repairCount: 1, repairedAt: repairedAt.toISOString() },
  ]]);
  const handler = createArchiveAccessOperationsHandler({
    auth: { authenticateAdmin: async () => {} },
    getStore: () => data,
    now: () => repairedAt,
    logger: { warn: () => {}, error: () => {} },
  });
  const body = await (await handler(new Request("https://example.test/report"), {})).json();
  assert.deepEqual(body.notificationDelivery.repair, {
    count: 1,
    lastRepairedAt: repairedAt.toISOString(),
  });
  assert.equal(JSON.stringify(repairs).includes("private-corrupt-contents"), false);
});

test("same-status malformed signal is repaired once without recurring reports", async () => {
  const data = store();
  const repairedAt = new Date("2026-09-20T12:30:00.000Z");
  const repairs = [];
  await data.setJSON("archive-access:notification-state", {
    signals: { billing: { status: "broken", private: "must-not-be-logged" } },
  });
  const options = {
    store: data,
    health: {
      recentHour: { billing_delay: 0, authenticated_checks: 1, billingDelayRate: 0 },
      status: { billing: "normal", deniedAccess: "normal" },
    },
    notify: async () => {},
    now: repairedAt,
    logger: { warn: (...args) => repairs.push(args) },
  };

  await notifyArchiveAccessTransitions(options);
  await notifyArchiveAccessTransitions(options);

  assert.equal(repairs.length, 1);
  assert.deepEqual(repairs[0], [
    "[archive-access] notification state repaired",
    { repairCount: 1, repairedAt: repairedAt.toISOString() },
  ]);
  const state = data.values.get("archive-access:notification-state");
  assert.deepEqual(state.signals.billing, { status: "normal" });
  assert.deepEqual(state.repair, { count: 1, lastRepairedAt: repairedAt.toISOString() });
  assert.equal(JSON.stringify(repairs).includes("must-not-be-logged"), false);
});

test("three repairs in one day produce one aggregate privacy-safe warning", async () => {
  const data = store();
  const sent = [];
  const start = new Date("2026-09-20T08:00:00.000Z");
  const health = {
    recentHour: { billing_delay: 0, authenticated_checks: 1, billingDelayRate: 0 },
    status: { billing: "normal", deniedAccess: "normal" },
  };

  for (let index = 0; index < 3; index += 1) {
    await data.setJSON("archive-access:notification-state", {
      signals: { billing: { status: "broken", private: `secret-${index}` } },
    });
    await notifyArchiveAccessTransitions({
      store: data,
      health,
      notify: async payload => sent.push(payload),
      now: new Date(start.getTime() + index * 60 * 60 * 1000),
      logger: { warn: () => {} },
    });
  }

  await notifyArchiveAccessTransitions({
    store: data,
    health,
    notify: async payload => sent.push(payload),
    now: new Date(start.getTime() + 4 * 60 * 60 * 1000),
  });

  assert.deepEqual(sent, [{
    kind: "repair_warning",
    repairCount: 3,
    windowStartedAt: start.toISOString(),
    lastRepairedAt: new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    windowHours: 24,
  }]);
  assert.equal(JSON.stringify(sent).includes("secret-"), false);
});

test("isolated repairs outside the warning window do not notify", async () => {
  const data = store();
  const sent = [];
  const health = {
    recentHour: { billing_delay: 0, authenticated_checks: 1, billingDelayRate: 0 },
    status: { billing: "normal", deniedAccess: "normal" },
  };
  const times = [
    "2026-09-18T08:00:00.000Z",
    "2026-09-19T09:00:00.000Z",
    "2026-09-20T10:00:00.000Z",
  ];

  for (const timestamp of times) {
    await data.setJSON("archive-access:notification-state", "{broken");
    await notifyArchiveAccessTransitions({
      store: data,
      health,
      notify: async payload => sent.push(payload),
      now: new Date(timestamp),
      logger: { warn: () => {} },
    });
  }

  assert.deepEqual(sent, []);
});

test("conditional repair retries record one repair and cannot trigger a warning", async () => {
  const data = store();
  await data.setJSON("archive-access:notification-state", "{broken");
  const originalSetJSON = data.setJSON;
  let rejectedRepairWrite = false;
  data.setJSON = async (key, value, options) => {
    if (key === "archive-access:notification-state" && options.onlyIfMatch && !rejectedRepairWrite) {
      rejectedRepairWrite = true;
      return { modified: false };
    }
    return originalSetJSON(key, value, options);
  };
  const sent = [];

  await notifyArchiveAccessTransitions({
    store: data,
    health: {
      recentHour: { billing_delay: 0, authenticated_checks: 1, billingDelayRate: 0 },
      status: { billing: "normal", deniedAccess: "normal" },
    },
    notify: async payload => sent.push(payload),
    now: new Date("2026-09-20T12:30:00.000Z"),
    logger: { warn: () => {} },
  });

  assert.equal(rejectedRepairWrite, true);
  assert.deepEqual(sent, []);
  assert.equal(data.values.get("archive-access:notification-repairs").timestamps.length, 1);
});

test("concurrent repair warning evaluations deliver only once", async () => {
  const data = store();
  const timestamps = [
    "2026-09-20T08:00:00.000Z",
    "2026-09-20T09:00:00.000Z",
    "2026-09-20T10:00:00.000Z",
  ];
  await data.setJSON("archive-access:notification-repairs", { timestamps, warnedAt: null });
  const health = { status: { billing: "normal", deniedAccess: "normal" } };
  let release;
  const deliveryPending = new Promise(resolve => { release = resolve; });
  let deliveries = 0;
  const notify = async () => {
    deliveries += 1;
    await deliveryPending;
  };

  const first = notifyArchiveAccessTransitions({
    store: data,
    health,
    notify,
    now: new Date("2026-09-20T10:30:00.000Z"),
  });
  await new Promise(resolve => setImmediate(resolve));
  const second = await notifyArchiveAccessTransitions({
    store: data,
    health,
    notify,
    now: new Date("2026-09-20T10:30:00.000Z"),
  });
  release();
  const firstResult = await first;

  assert.equal(deliveries, 1);
  assert.deepEqual(second, []);
  assert.equal(firstResult[0].kind, "repair_warning");
});

test("repair warning delivery failures expose a bounded deduplicated health signal", async () => {
  const data = store();
  const timestamps = [
    "2026-09-20T08:00:00.000Z",
    "2026-09-20T09:00:00.000Z",
    "2026-09-20T10:00:00.000Z",
  ];
  await data.setJSON("archive-access:notification-repairs", { timestamps, warnedAt: null });
  const health = { status: { billing: "normal", deniedAccess: "normal" } };
  const escalations = [];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assert.rejects(notifyArchiveAccessTransitions({
      store: data,
      health,
      notify: async () => { throw new Error(`private provider failure ${attempt}`); },
      now: new Date(`2026-09-20T1${attempt}:30:00.000Z`),
      logger: { error: (...args) => escalations.push(args) },
    }));
  }

  const handler = createArchiveAccessOperationsHandler({
    auth: { authenticateAdmin: async () => {} },
    getStore: () => data,
    now: () => new Date("2026-09-20T14:00:00.000Z"),
    notify: async () => { throw new Error("private provider failure on health read"); },
    logger: { error: () => {} },
  });
  const body = await (await handler(new Request("https://example.test/report"), {})).json();

  assert.equal(escalations.length, 1);
  assert.deepEqual(escalations[0], [
    "[archive-access] repair warning delivery repeatedly failed",
    {
      consecutiveFailures: 3,
      lastFailedAt: "2026-09-20T12:30:00.000Z",
    },
  ]);
  assert.deepEqual(body.notificationDelivery.repairWarning, {
    status: "failure",
    attemptedAt: "2026-09-20T14:00:00.000Z",
    lastSucceededAt: null,
    lastFailedAt: "2026-09-20T14:00:00.000Z",
    consecutiveFailures: 5,
    escalatedAt: "2026-09-20T12:30:00.000Z",
  });
  assert.equal(JSON.stringify(data.values.get("archive-access:notification-repairs"))
    .includes("private provider"), false);
});

test("repair warning failure tracking survives real Netlify Blob contention", async t => {
  const directory = await mkdtemp(join(tmpdir(), "archive-access-repair-warning-blobs-"));
  const server = new BlobsServer({ directory });
  const { address } = await server.start();
  t.after(async () => {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const data = getStore({
    edgeURL: address,
    uncachedEdgeURL: address,
    name: "archive-access-repair-warning-contract",
    siteID: "test-site",
    token: "test-token",
  });
  const timestamps = [
    "2026-09-20T08:00:00.000Z",
    "2026-09-20T09:00:00.000Z",
    "2026-09-20T10:00:00.000Z",
  ];
  await data.setJSON("archive-access:notification-repairs", { timestamps, warnedAt: null });
  const health = { status: { billing: "normal", deniedAccess: "normal" } };
  const escalations = [];
  let deliveries = 0;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const now = new Date(`2026-09-20T1${attempt}:30:00.000Z`);
    let deliveryStarted;
    let releaseDelivery;
    const started = new Promise(resolve => { deliveryStarted = resolve; });
    const release = new Promise(resolve => { releaseDelivery = resolve; });
    const options = {
      store: data,
      health,
      notify: async () => {
        deliveries += 1;
        deliveryStarted();
        await release;
        throw new Error(`private provider failure ${attempt}`);
      },
      now,
      logger: { error: (...args) => escalations.push(args) },
    };
    const activeDelivery = notifyArchiveAccessTransitions(options);
    await started;
    const contenders = Array.from(
      { length: 7 },
      () => notifyArchiveAccessTransitions(options),
    );
    const competingResults = await Promise.all(contenders);
    releaseDelivery();
    const deliveryResult = await Promise.allSettled([activeDelivery]);

    assert.equal(deliveryResult[0].status, "rejected");
    assert.ok(competingResults.every(result => result.length === 0));
  }

  const stored = (await data.getWithMetadata(
    "archive-access:notification-repairs",
    { type: "json", consistency: "strong" },
  )).data;
  const deliveryHealth = await archiveAccessNotificationDeliveryHealth(
    data,
    new Date("2026-09-20T14:00:00.000Z"),
  );

  assert.equal(deliveries, 4);
  assert.equal(stored.delivery.consecutiveFailures, 4);
  assert.equal(deliveryHealth.repairWarning.consecutiveFailures, 4);
  assert.equal(deliveryHealth.repairWarning.escalatedAt, "2026-09-20T12:30:00.000Z");
  assert.deepEqual(escalations, [[
    "[archive-access] repair warning delivery repeatedly failed",
    {
      consecutiveFailures: 3,
      lastFailedAt: "2026-09-20T12:30:00.000Z",
    },
  ]]);
  assert.equal(JSON.stringify(stored).includes("private provider"), false);
});

test("successful repair warning delivery resets its failure streak and re-arms escalation", async () => {
  const data = store();
  const timestamps = [
    "2026-09-20T08:00:00.000Z",
    "2026-09-20T09:00:00.000Z",
    "2026-09-20T10:00:00.000Z",
  ];
  await data.setJSON("archive-access:notification-repairs", {
    timestamps,
    warnedAt: null,
    delivery: {
      status: "failure",
      attemptedAt: "2026-09-20T12:30:00.000Z",
      lastSucceededAt: null,
      lastFailedAt: "2026-09-20T12:30:00.000Z",
      consecutiveFailures: 3,
      escalatedAt: "2026-09-20T12:30:00.000Z",
    },
  });

  await notifyArchiveAccessTransitions({
    store: data,
    health: { status: { billing: "normal", deniedAccess: "normal" } },
    notify: async () => {},
    now: new Date("2026-09-20T13:30:00.000Z"),
  });

  assert.deepEqual(data.values.get("archive-access:notification-repairs").delivery, {
    status: "success",
    attemptedAt: "2026-09-20T13:30:00.000Z",
    lastSucceededAt: "2026-09-20T13:30:00.000Z",
    lastFailedAt: "2026-09-20T12:30:00.000Z",
    consecutiveFailures: 0,
    escalatedAt: null,
  });
});

test("repair warnings re-arm after the previous repair window expires", async () => {
  const data = store();
  const sent = [];
  const health = { status: { billing: "normal", deniedAccess: "normal" } };
  const firstWindow = [
    "2026-09-18T08:00:00.000Z",
    "2026-09-18T09:00:00.000Z",
    "2026-09-18T10:00:00.000Z",
  ];
  await data.setJSON("archive-access:notification-repairs", {
    timestamps: firstWindow,
    warnedAt: firstWindow.at(-1),
  });

  for (const timestamp of [
    "2026-09-20T08:00:00.000Z",
    "2026-09-20T09:00:00.000Z",
    "2026-09-20T10:00:00.000Z",
  ]) {
    await data.setJSON("archive-access:notification-state", "{broken");
    await notifyArchiveAccessTransitions({
      store: data,
      health,
      notify: async payload => sent.push(payload),
      now: new Date(timestamp),
      logger: { warn: () => {} },
    });
  }

  assert.equal(sent.length, 1);
  assert.equal(sent[0].windowStartedAt, "2026-09-20T08:00:00.000Z");
});

test("notification delivery health exposes only the active repair window aggregate", async () => {
  const data = store();
  const now = new Date("2026-09-20T12:30:00.000Z");
  await data.setJSON("archive-access:notification-repairs", {
    timestamps: [
      "2026-09-19T11:00:00.000Z",
      "2026-09-19T13:00:00.000Z",
      "2026-09-20T08:00:00.000Z",
      "2026-09-20T10:00:00.000Z",
    ],
    warnedAt: "2026-09-20T10:00:00.000Z",
    warningClaim: {
      claimId: "private-claim-id",
      claimedAt: "2026-09-20T10:00:00.000Z",
    },
  });

  const health = await archiveAccessNotificationDeliveryHealth(data, now);

  assert.deepEqual(health.repairWindow, {
    active: true,
    count: 3,
    firstRepairedAt: "2026-09-19T13:00:00.000Z",
    lastRepairedAt: "2026-09-20T10:00:00.000Z",
    warningSent: true,
  });
  assert.equal(JSON.stringify(health).includes("private-claim-id"), false);
  assert.equal(JSON.stringify(health).includes("warningClaim"), false);
  assert.equal(JSON.stringify(health).includes("warnedAt"), false);
});

test("notification delivery health reports an inactive repair window after expiry", async () => {
  const data = store();
  await data.setJSON("archive-access:notification-repairs", {
    timestamps: [
      "2026-09-18T08:00:00.000Z",
      "2026-09-18T09:00:00.000Z",
      "2026-09-18T10:00:00.000Z",
    ],
    warnedAt: "2026-09-18T10:00:00.000Z",
  });

  const health = await archiveAccessNotificationDeliveryHealth(
    data,
    new Date("2026-09-20T12:30:00.000Z"),
  );

  assert.deepEqual(health.repairWindow, {
    active: false,
    count: 0,
    firstRepairedAt: null,
    lastRepairedAt: null,
    warningSent: false,
  });
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
    repair: {
      count: 0,
      lastRepairedAt: null,
    },
    repairWarning: {
      status: "never_attempted",
      attemptedAt: null,
      lastSucceededAt: null,
      lastFailedAt: null,
      consecutiveFailures: 0,
      escalatedAt: null,
    },
    repairWindow: {
      active: false,
      count: 0,
      firstRepairedAt: null,
      lastRepairedAt: null,
      warningSent: false,
    },
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
  assert.equal(Object.keys(failedState).length, 4);
  assert.deepEqual(failedState.repair, { count: 0, lastRepairedAt: null });

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

test("scheduled archive health uses the production Netlify blob context safely", async () => {
  const data = store();
  const storeNames = [];
  const handler = createArchiveAccessHealthScheduledHandler({
    getHealth: async actualStore => {
      assert.equal(actualStore, data);
      return { status: { billing: "normal", deniedAccess: "normal" } };
    },
    notifyTransitions: async () => {},
  });
  const context = {
    blobs: {
      getStore(name) {
        storeNames.push(name);
        return data;
      },
    },
  };

  const response = await handler(new Request("https://example.test/scheduled"), context);

  assert.deepEqual(storeNames, ["archive-access-operations"]);
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");

  const errors = [];
  const missingContextHandler = createArchiveAccessHealthScheduledHandler({
    getHealth: async () => {
      throw new Error("private storage configuration details");
    },
    logger: { error: (...args) => errors.push(args) },
  });
  const malformedContextHandler = createArchiveAccessHealthScheduledHandler({
    logger: { error: (...args) => errors.push(args) },
  });

  const missingContextResponse = await missingContextHandler(
    new Request("https://example.test/scheduled"),
    {},
  );
  const malformedContextResponse = await malformedContextHandler(
    new Request("https://example.test/scheduled"),
    {
      blobs: {
        getStore() {
          throw new Error("private malformed blob context details");
        },
      },
    },
  );

  for (const failureResponse of [missingContextResponse, malformedContextResponse]) {
    assert.equal(failureResponse.status, 204);
    assert.equal(await failureResponse.text(), "");
  }
  assert.equal(errors.length, 2);
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

test("repair warning email contains only aggregate count and timestamps", async () => {
  let request;
  await sendArchiveAccessNotification({
    payload: {
      kind: "repair_warning",
      repairCount: 3,
      windowStartedAt: "2026-09-20T08:00:00.000Z",
      lastRepairedAt: "2026-09-20T10:00:00.000Z",
      windowHours: 24,
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
  assert.match(message.text, /Repair count: 3/);
  assert.match(message.text, /Window started: 2026-09-20T08:00:00.000Z/);
  assert.match(message.text, /Last repaired: 2026-09-20T10:00:00.000Z/);
  assert.doesNotMatch(message.text, /contents|customer|account|session|url/i);
});
