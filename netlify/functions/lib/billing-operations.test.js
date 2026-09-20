import test from "node:test";
import assert from "node:assert/strict";
import { createBillingOperationsHandler } from "./billing-operations.js";

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
  assert.deepEqual(await result.json(), { identityConflict: null });
});

test("billing operations returns only the privacy-safe conflict projection", async () => {
  const safe = {
    reason: "stripe_identity_conflict",
    category: "checkout",
    count: 2,
    firstOccurredAt: "2026-09-20T10:00:00.000Z",
    lastOccurredAt: "2026-09-20T11:00:00.000Z",
  };
  const handler = createBillingOperationsHandler({
    auth: { async authenticateAdmin() {} },
    getRepository: () => ({ async identityConflictSummary() { return safe; } }),
  });

  const result = await handler(new Request("https://example.test/billing-operations"), {});
  const body = await result.json();
  assert.deepEqual(body, { identityConflict: safe });
  assert.deepEqual(Object.keys(body.identityConflict).sort(), [
    "category", "count", "firstOccurredAt", "lastOccurredAt", "reason",
  ]);
  assert.doesNotMatch(JSON.stringify(body), /customer|account|email|eventId|signature|payload/i);
});