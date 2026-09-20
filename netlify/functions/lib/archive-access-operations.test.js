import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveAccessHealth,
  createArchiveAccessOperationsHandler,
  recordArchiveAccessCheck,
} from "./archive-access-operations.js";

function store() {
  const values = new Map();
  return {
    async get(key) { return structuredClone(values.get(key) ?? null); },
    async setJSON(key, value) { values.set(key, structuredClone(value)); },
    async list({ prefix }) {
      return { blobs: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
  };
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