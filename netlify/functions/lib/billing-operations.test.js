import test from "node:test";
import assert from "node:assert/strict";
import {
  createBillingOperationsHandler,
  createReceiptIndexHealthCheck,
  notifyReceiptIndexTransition,
  PROCESSED_RECEIPT_RETENTION_INDEX,
  RECEIPT_INDEX_NOTIFICATION_STATE_KEY,
  sendReceiptIndexNotification,
} from "./billing-operations.js";
import {
  config as receiptIndexSchedule,
  createReceiptIndexHealthScheduledHandler,
} from "../receipt-index-health-scheduled.js";

function notificationStore() {
  const values = new Map();
  let version = 0;
  return {
    values,
    async getWithMetadata(key) {
      return values.has(key)
        ? { data: structuredClone(values.get(key)), etag: String(version) }
        : null;
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && values.has(key)) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== String(version)) {
        return { modified: false };
      }
      values.set(key, structuredClone(value));
      version += 1;
      return { modified: true };
    },
  };
}

test("billing operations is admin-only", async () => {
  const handler = createBillingOperationsHandler({
    auth: {
      async authenticateAdmin() {
        const error = new Error("Forbidden");
        error.status = 403;
        throw error;
      },
    },
    getRepository: () => ({
      async identityConflictSummary() {
        assert.fail("storage must not be read before authorization");
      },
    }),
  });

  const result = await handler(new Request("https://example.test/billing-operations"), {});
  assert.equal(result.status, 403);
  assert.deepEqual(await result.json(), { error: "Forbidden" });
});

test("billing operations returns an explicit empty state", async () => {
  const handler = createBillingOperationsHandler({
    auth: { async authenticateAdmin() {} },
    getRepository: () => ({ async identityConflictSummary() { return null; } }),
  });

  const result = await handler(new Request("https://example.test/billing-operations"), {});
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    identityConflict: null,
    receiptIndex: { status: "unavailable", releaseReady: false },
  });
});

test("billing operations returns only the privacy-safe conflict projection", async () => {
  const safe = {
    reason: "stripe_identity_conflict",
    category: "checkout",
    count: 2,
    firstOccurredAt: "2026-09-20T10:00:00.000Z",
    lastOccurredAt: "2026-09-20T11:00:00.000Z",
    status: "active",
    resolutionTimestamp: null,
    handlingHistory: [
      {
        status: "acknowledged",
        timestamp: "2026-09-20T10:30:00.000Z",
        coveredOccurrenceCount: 1,
      },
    ],
  };
  const handler = createBillingOperationsHandler({
    auth: { async authenticateAdmin() {} },
    getRepository: () => ({ async identityConflictSummary() { return safe; } }),
  });

  const result = await handler(new Request("https://example.test/billing-operations"), {});
  const body = await result.json();
  assert.deepEqual(body, {
    identityConflict: safe,
    receiptIndex: { status: "unavailable", releaseReady: false },
  });
  assert.deepEqual(Object.keys(body.identityConflict).sort(), [
    "category", "count", "firstOccurredAt", "handlingHistory", "lastOccurredAt",
    "reason", "resolutionTimestamp", "status",
  ]);
  assert.doesNotMatch(JSON.stringify(body), /customer|account|email|eventId|signature|payload|resolvedBy|operator/i);
});

test("billing operations reports a healthy receipt index as release-ready", async () => {
  const handler = createBillingOperationsHandler({
    auth: { async authenticateAdmin() {} },
    getRepository: () => ({ async identityConflictSummary() { return null; } }),
    getReceiptIndexHealth: async () => ({ status: "release_ready", releaseReady: true }),
  });

  const result = await handler(new Request("https://example.test/billing-operations"), {});
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).receiptIndex, {
    status: "release_ready",
    releaseReady: true,
  });
});

test("billing operations reports an unavailable probe without hiding other operations", async () => {
  const handler = createBillingOperationsHandler({
    auth: { async authenticateAdmin() {} },
    getRepository: () => ({ async identityConflictSummary() { return null; } }),
    getReceiptIndexHealth: async () => { throw new Error("private database details"); },
  });

  const result = await handler(new Request("https://example.test/billing-operations"), {});
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    identityConflict: null,
    receiptIndex: { status: "unavailable", releaseReady: false },
  });
});

test("receipt index health reads pg_index without reading billing data", async () => {
  const cases = [
    [[], { status: "missing", releaseReady: false }],
    [[{ indisvalid: false, indisready: false }], { status: "invalid", releaseReady: false }],
    [[{ indisvalid: true, indisready: false }], { status: "not_ready", releaseReady: false }],
    [[{ indisvalid: true, indisready: true }], { status: "release_ready", releaseReady: true }],
  ];

  for (const [rows, expected] of cases) {
    let statement;
    let parameters;
    const check = createReceiptIndexHealthCheck({
      query: async (sql, values) => {
        statement = sql;
        parameters = values;
        return { rows };
      },
    });
    assert.deepEqual(await check(), expected);
    assert.match(statement, /FROM pg_index/);
    assert.doesNotMatch(statement, /FROM public\.fandom_billing_events(?:\s|$)/);
    assert.deepEqual(parameters, [PROCESSED_RECEIPT_RETENTION_INDEX]);
  }
});

test("receipt index notifications are transition-bounded and represent recovery", async () => {
  const store = notificationStore();
  const notifications = [];
  const notify = async payload => notifications.push(payload);
  const times = [
    "2026-09-20T12:00:00.000Z",
    "2026-09-20T13:00:00.000Z",
    "2026-09-20T14:00:00.000Z",
    "2026-09-20T15:00:00.000Z",
    "2026-09-20T16:00:00.000Z",
  ];

  await notifyReceiptIndexTransition({
    store, health: { status: "release_ready" }, notify, now: new Date(times[0]),
  });
  await notifyReceiptIndexTransition({
    store, health: { status: "invalid" }, notify, now: new Date(times[1]),
  });
  await notifyReceiptIndexTransition({
    store, health: { status: "invalid" }, notify, now: new Date(times[2]),
  });
  await notifyReceiptIndexTransition({
    store, health: { status: "missing" }, notify, now: new Date(times[3]),
  });
  await notifyReceiptIndexTransition({
    store, health: { status: "release_ready" }, notify, now: new Date(times[4]),
  });

  assert.deepEqual(notifications, [
    { kind: "incident", status: "invalid", observedAt: times[1] },
    { kind: "resolved", status: "release_ready", observedAt: times[4] },
  ]);
  assert.equal(store.values.get(RECEIPT_INDEX_NOTIFICATION_STATE_KEY).status, "release_ready");
});

test("an initially unhealthy receipt index establishes a baseline without alerting", async () => {
  const store = notificationStore();
  const notifications = [];
  await notifyReceiptIndexTransition({
    store,
    health: { status: "not_ready" },
    notify: async payload => notifications.push(payload),
    now: new Date("2026-09-20T12:00:00.000Z"),
  });
  assert.deepEqual(notifications, []);
  assert.equal(store.values.get(RECEIPT_INDEX_NOTIFICATION_STATE_KEY).status, "not_ready");
});

test("failed receipt index delivery remains retryable without storing failure details", async () => {
  const store = notificationStore();
  await notifyReceiptIndexTransition({
    store,
    health: { status: "release_ready" },
    notify: async () => {},
    now: new Date("2026-09-20T12:00:00.000Z"),
  });
  await assert.rejects(notifyReceiptIndexTransition({
    store,
    health: { status: "missing" },
    notify: async () => { throw new Error("private provider failure"); },
    now: new Date("2026-09-20T13:00:00.000Z"),
  }));
  assert.equal(store.values.get(RECEIPT_INDEX_NOTIFICATION_STATE_KEY).status, "release_ready");
  assert.doesNotMatch(
    JSON.stringify(store.values.get(RECEIPT_INDEX_NOTIFICATION_STATE_KEY)),
    /private provider failure/,
  );
});

test("scheduled receipt index health runs hourly and isolates private failures", async () => {
  assert.deepEqual(receiptIndexSchedule, { schedule: "@hourly" });
  const calls = [];
  const errors = [];
  const context = { requestId: "receipt-index-check" };
  const handler = createReceiptIndexHealthScheduledHandler({
    getStore: actual => {
      calls.push(["store", actual]);
      return notificationStore();
    },
    getHealth: async actual => {
      calls.push(["health", actual]);
      return { status: "release_ready", releaseReady: true };
    },
    notifyTransition: async options => calls.push(["transition", options.health]),
    now: () => new Date("2026-09-20T12:00:00.000Z"),
    logger: { error: (...args) => errors.push(args) },
  });
  const response = await handler(new Request("https://example.test/scheduled"), context);
  assert.equal(response.status, 204);
  assert.deepEqual(calls.slice(0, 2), [["store", context], ["health", context]]);
  assert.deepEqual(calls[2], ["transition", { status: "release_ready", releaseReady: true }]);

  const failure = createReceiptIndexHealthScheduledHandler({
    getHealth: async () => { throw new Error("private database details"); },
    logger: { error: (...args) => errors.push(args) },
  });
  assert.equal((await failure(new Request("https://example.test/scheduled"), {})).status, 204);
  assert.equal(errors.length, 1);
});

test("receipt index email contains only bounded readiness data", async () => {
  let request;
  await sendReceiptIndexNotification({
    payload: {
      kind: "incident",
      status: "invalid",
      observedAt: "2026-09-20T12:00:00.000Z",
      account: "must not pass",
    },
    env: {
      FANDOM_ADMIN_EMAILS: "operator@example.test",
      FANDOM_AUTH_FROM_EMAIL: "Fandom <ops@example.test>",
      RESEND_API_KEY: "test-key",
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true };
    },
  });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.match(body.subject, /processed-receipt retention index is invalid/);
  assert.doesNotMatch(JSON.stringify(body), /must not pass|account|billing event|customer/i);
});

test("billing operations resolution is admin-only", async () => {
  let mutated = false;
  const handler = createBillingOperationsHandler({
    auth: { async authenticateAdmin() { throw Object.assign(new Error("Forbidden"), { status: 403 }); } },
    getRepository: () => ({
      async resolveIdentityConflict() { mutated = true; },
    }),
  });
  const result = await handler(new Request("https://example.test/billing-operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resolve_identity_conflict", status: "resolved" }),
  }), {});
  assert.equal(result.status, 403);
  assert.equal(mutated, false);
});

test("billing operations passes a privacy-safe version-bound resolution", async () => {
  let received;
  const summary = {
    reason: "stripe_identity_conflict",
    category: "subscription",
    count: 3,
    firstOccurredAt: "2026-09-20T10:00:00.000Z",
    lastOccurredAt: "2026-09-20T12:00:00.000Z",
    status: "resolved",
    resolutionTimestamp: "2026-09-20T12:05:00.000Z",
    handlingHistory: [{
      status: "resolved",
      timestamp: "2026-09-20T12:05:00.000Z",
      coveredOccurrenceCount: 3,
    }],
  };
  const handler = createBillingOperationsHandler({
    auth: { async authenticateAdmin() { return { user: { accountId: "operator-1" } }; } },
    getRepository: () => ({
      async resolveIdentityConflict(input) {
        received = input;
        return { outcome: "applied", summary };
      },
    }),
  });
  const result = await handler(new Request("https://example.test/billing-operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "resolve_identity_conflict",
      status: "resolved",
      expectedCount: 3,
      expectedLastOccurredAt: summary.lastOccurredAt,
      customerId: "must-not-pass",
    }),
  }), {});
  assert.equal(result.status, 200);
  assert.deepEqual(received, {
    status: "resolved",
    expectedCount: 3,
    expectedLastOccurredAt: summary.lastOccurredAt,
    resolvedBy: "operator-1",
  });
  assert.deepEqual(await result.json(), { identityConflict: summary });
});