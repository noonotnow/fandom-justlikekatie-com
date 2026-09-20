import test from "node:test";
import assert from "node:assert/strict";
import {
  createBillingOperationsHandler,
  createReceiptIndexHealthCheck,
  PROCESSED_RECEIPT_RETENTION_INDEX,
} from "./billing-operations.js";

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