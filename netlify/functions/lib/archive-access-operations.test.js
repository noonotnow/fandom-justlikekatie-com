import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_ACCESS_RETENTION_DAYS,
  archiveAccessHealth,
  createArchiveAccessOperationsHandler,
  createArchiveAccessRetentionHandler,
  pruneExpiredArchiveAccessChecks,
  recordArchiveAccessCheck,
} from "./archive-access-operations.js";

function store() {
  const values = new Map();
  return {
    values,
    async get(key) { return structuredClone(values.get(key) ?? null); },
    async setJSON(key, value) { values.set(key, structuredClone(value)); },
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
