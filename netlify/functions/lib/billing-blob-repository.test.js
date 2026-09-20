import test from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_EVENT_RETENTION_DAYS,
  createBlobBillingRepository,
} from "./billing-blob-repository.js";
import { applyBlobBillingEvent } from "./billing-blob-webhook.js";

function createMemoryStore() {
  const values = new Map();
  const versions = new Map();
  let pageSize = Infinity;
  return {
    async get(key) {
      return values.get(key) || null;
    },
    async getWithMetadata(key) {
      return values.has(key)
        ? { data: values.get(key), etag: `"${versions.get(key)}"` }
        : null;
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && values.has(key)) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== `"${versions.get(key)}"`) {
        return { modified: false };
      }
      values.set(key, value);
      versions.set(key, (versions.get(key) || 0) + 1);
      return { modified: true, etag: `"${versions.get(key)}"` };
    },
    async delete(key) {
      values.delete(key);
      versions.delete(key);
    },
    list({ prefix, paginate }) {
      const blobs = [...values.keys()]
        .filter(key => key.startsWith(prefix))
        .sort()
        .map(key => ({ key }));
      if (!paginate) return Promise.resolve({ blobs });
      return {
        async *[Symbol.asyncIterator]() {
          for (let index = 0; index < blobs.length; index += pageSize) {
            yield { blobs: blobs.slice(index, index + pageSize) };
          }
        },
      };
    },
    setPageSize(size) {
      pageSize = size;
    },
  };
}

function createRepository(store = createMemoryStore()) {
  return {
    store,
    repository: createBlobBillingRepository({
      getStore: () => store,
      context: {},
    }),
  };
}

test("blob billing links a customer and records an entitled subscription", async () => {
  const { repository } = createRepository();
  await applyBlobBillingEvent({
    repository,
    event: {
      id: "evt_created",
      created: 30,
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_test",
          customer: "cus_test",
          status: "trialing",
          current_period_end: 1790726400,
          cancel_at_period_end: false,
          metadata: { fandom_account_id: "account_one" },
        },
      },
    },
  });

  assert.deepEqual(await repository.membershipForAccount("account_one"), {
    status: "active",
    stripeStatus: "trialing",
    currentPeriodEnd: "2026-09-30T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  });
});

test("subscription webhook persists one canonical product capability", async () => {
  const { repository } = createRepository();
  await repository.linkCustomer("account_one", "cus_test");
  await applyBlobBillingEvent({
    repository,
    env: { FANDOM_STRIPE_MEMBERSHIP_PRICE_ID: "price_collector" },
    event: {
      id: "evt_product",
      created: 35,
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_test",
          customer: "cus_test",
          status: "active",
          current_period_end: 1790726400,
          cancel_at_period_end: false,
          metadata: { fandom_account_id: "account_one" },
          items: { data: [{ price: { id: "price_collector", product: "prod_provider" } }] },
        },
      },
    },
  });

  const membership = await repository.membershipForAccount("account_one");
  assert.equal(membership.product, "fandom_collector");
  assert.equal(membership.priceId, "price_collector");
});

test("deleted subscription webhooks remove entitlement", async () => {
  const { repository } = createRepository();
  await applyBlobBillingEvent({
    repository,
    event: {
      id: "evt_created",
      created: 30,
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_test",
          customer: "cus_test",
          status: "trialing",
          current_period_end: 1790726400,
          cancel_at_period_end: false,
          metadata: { fandom_account_id: "account_one" },
        },
      },
    },
  });

  assert.deepEqual(await repository.membershipForAccount("account_one"), {
    status: "active",
    stripeStatus: "trialing",
    currentPeriodEnd: "2026-09-30T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  });
});

test("deleted subscription webhooks remove entitlement", async () => {
  const { repository } = createRepository();
  await repository.linkCustomer("account_one", "cus_test");
  await applyBlobBillingEvent({
    repository,
    event: {
      id: "evt_deleted",
      created: 40,
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test",
          customer: "cus_test",
          status: "canceled",
          current_period_end: 1790726400,
          cancel_at_period_end: true,
          metadata: {},
        },
      },
    },
  });

  const membership = await repository.membershipForAccount("account_one");
  assert.equal(membership.status, "inactive");
  assert.equal(membership.stripeStatus, "canceled");
  assert.equal(membership.cancelAtPeriodEnd, true);
});

test("duplicate event deliveries are recorded once and remain harmless", async () => {
  const { repository, store } = createRepository();
  const event = (id, type, status) => ({
    id,
    created: 110,
    type,
    data: { object: {
      id: "sub_test",
      customer: "cus_test",
      status,
      metadata: { fandom_account_id: "account_one" },
    } },
  });
  const duplicate = event("evt_duplicate", "customer.subscription.created", "active");
  assert.deepEqual(await applyBlobBillingEvent({ repository, event: duplicate }), { applied: true });
  assert.deepEqual(await applyBlobBillingEvent({ repository, event: duplicate }), { duplicate: true });
  assert.equal((await store.get("events/evt_duplicate")).eventId, "evt_duplicate");
});

test("receipt cleanup preserves recent duplicate protection across the retention boundary", async () => {
  const { repository, store } = createRepository();
  const event = id => ({
    id,
    created: 110,
    type: "customer.subscription.created",
    data: { object: {
      id: `sub_${id}`,
      customer: `cus_${id}`,
      status: "active",
      metadata: { fandom_account_id: `account_${id}` },
    } },
  });
  const oldEvent = event("old");
  const recentEvent = event("recent");
  await applyBlobBillingEvent({ repository, event: oldEvent });
  await applyBlobBillingEvent({ repository, event: recentEvent });
  const now = Date.parse("2026-09-20T00:00:00.000Z");
  const oldProcessedAt = new Date(
    now - (BILLING_EVENT_RETENTION_DAYS * 24 * 60 * 60_000) - 1,
  ).toISOString();
  const recentProcessedAt = new Date(
    now - (BILLING_EVENT_RETENTION_DAYS * 24 * 60 * 60_000) + 1,
  ).toISOString();
  await store.setJSON("events/old", {
    ...await store.get("events/old"),
    processedAt: oldProcessedAt,
  });
  await store.setJSON("events/recent", {
    ...await store.get("events/recent"),
    processedAt: recentProcessedAt,
  });
  for (const key of await listedKeys(store, "event-expirations/")) await store.delete(key);
  await store.setJSON(
    `event-expirations/${new Date(now - 1).toISOString()}/old`,
    { eventKey: "events/old", processedAt: oldProcessedAt },
  );
  await store.setJSON(
    `event-expirations/${new Date(now + 1).toISOString()}/recent`,
    { eventKey: "events/recent", processedAt: recentProcessedAt },
  );

  assert.deepEqual(await applyBlobBillingEvent({ repository, event: recentEvent }), { duplicate: true });
  assert.equal(await repository.pruneProcessedEvents({ now }), 1);
  assert.equal(await store.get("events/old"), null);
  assert.equal((await store.get("events/recent")).state, "processed");
  assert.deepEqual(await applyBlobBillingEvent({ repository, event: recentEvent }), { duplicate: true });
});

test("receipt cleanup is bounded and never removes active claims", async () => {
  const { repository, store } = createRepository();
  const old = "2020-01-01T00:00:00.000Z";
  for (let index = 0; index < 30; index += 1) {
    await store.setJSON(`events/expired_${index}`, {
      eventId: `expired_${index}`,
      state: "processed",
      processedAt: old,
    });
    await store.setJSON(`event-expirations/2020-01-31T00:00:00.000Z/expired_${index}`, {
      eventKey: `events/expired_${index}`,
      processedAt: old,
    });
  }
  await store.setJSON("events/processing", {
    eventId: "processing",
    state: "processing",
    claimedAt: old,
  });

  assert.equal(await repository.pruneProcessedEvents(), 25);
  assert.notEqual(await store.get("events/processing"), null);
  const remainingExpired = await Promise.all(
    Array.from({ length: 30 }, (_, index) => store.get(`events/expired_${index}`)),
  );
  assert.equal(remainingExpired.filter(Boolean).length, 5);
});

test("expiration ordering reaches old receipts beyond the first event-ledger page", async () => {
  const { repository, store } = createRepository();
  store.setPageSize(2);
  const now = Date.parse("2026-09-20T00:00:00.000Z");
  const recent = new Date(now - 60_000).toISOString();
  const old = new Date(now - (BILLING_EVENT_RETENTION_DAYS + 1) * 24 * 60 * 60_000).toISOString();
  await store.setJSON("events/a_recent", { state: "processed", processedAt: recent });
  await store.setJSON("events/b_processing", { state: "processing", claimedAt: recent });
  await store.setJSON("events/z_expired", { state: "processed", processedAt: old });
  await store.setJSON(
    `event-expirations/${new Date(Date.parse(old) + BILLING_EVENT_RETENTION_DAYS * 24 * 60 * 60_000).toISOString()}/z_expired`,
    { eventKey: "events/z_expired", processedAt: old },
  );
  await store.setJSON(
    `event-expirations/${new Date(Date.parse(recent) + BILLING_EVENT_RETENTION_DAYS * 24 * 60 * 60_000).toISOString()}/a_recent`,
    { eventKey: "events/a_recent", processedAt: recent },
  );

  assert.equal(await repository.pruneProcessedEvents({ now }), 1);
  assert.equal(await store.get("events/z_expired"), null);
  assert.notEqual(await store.get("events/a_recent"), null);
  assert.notEqual(await store.get("events/b_processing"), null);
});

async function listedKeys(store, prefix) {
  return (await store.list({ prefix })).blobs.map(blob => blob.key);
}

test("an abandoned event claim can be recovered after its lease expires", async () => {
  const { repository, store } = createRepository();
  const event = (id, type, status) => ({
    id,
    created: 110,
    type,
    data: { object: {
      id: "sub_test",
      customer: "cus_test",
      status,
      metadata: { fandom_account_id: "account_one" },
    } },
  });
  const abandonedEvent = event("evt_abandoned", "customer.subscription.created", "active");
  assert.equal(await repository.claimEvent(abandonedEvent), true);
  const abandoned = await store.get("events/evt_abandoned");
  await store.setJSON("events/evt_abandoned", {
    ...abandoned,
    claimedAt: "2020-01-01T00:00:00.000Z",
  });
  assert.deepEqual(await applyBlobBillingEvent({ repository, event: abandonedEvent }), { applied: true });
  assert.equal((await repository.membershipForAccount("account_one")).status, "active");
  assert.equal((await store.get("events/evt_abandoned")).state, "processed");
});

test("reordered lifecycle events preserve the newest authoritative state", async () => {
  const { repository } = createRepository();
  const apply = (id, created, type, status) => applyBlobBillingEvent({
    repository,
    event: {
      id,
      created,
      type,
      data: { object: {
        id: "sub_test",
        customer: "cus_test",
        status,
        metadata: { fandom_account_id: "account_one" },
      } },
    },
  });
  await apply("evt_resubscribed", 80, "customer.subscription.updated", "active");
  await apply("evt_deleted_old", 70, "customer.subscription.deleted", "canceled");
  await apply("evt_created_oldest", 60, "customer.subscription.created", "trialing");
  assert.equal((await repository.membershipForAccount("account_one")).stripeStatus, "active");
});

test("equal-second lifecycle events reconcile deterministically", async () => {
  const { repository } = createRepository();
  const event = (id, type, status, subscriptionId = "sub_test") => ({
    id,
    created: 110,
    type,
    data: { object: {
      id: subscriptionId,
      customer: "cus_test",
      status,
      metadata: { fandom_account_id: "account_one" },
    } },
  });
  await applyBlobBillingEvent({
    repository,
    event: event("evt_deleted", "customer.subscription.deleted", "canceled"),
  });
  await applyBlobBillingEvent({
    repository,
    event: event("evt_updated", "customer.subscription.updated", "active"),
  });
  assert.equal((await repository.membershipForAccount("account_one")).status, "inactive");

  await applyBlobBillingEvent({
    repository,
    event: event("evt_resubscribed", "customer.subscription.created", "active", "sub_new"),
  });
  assert.equal((await repository.membershipForAccount("account_one")).status, "active");
});

test("concurrent equal-second deliveries converge through conditional writes", async () => {
  const store = createMemoryStore();
  const originalGetWithMetadata = store.getWithMetadata;
  let waiting = 0;
  let releaseReads;
  const readsReady = new Promise(resolve => { releaseReads = resolve; });
  store.getWithMetadata = async key => {
    if (key === "subscriptions/account_one" && waiting < 2) {
      waiting += 1;
      if (waiting === 2) releaseReads();
      await readsReady;
    }
    return originalGetWithMetadata(key);
  };
  const { repository } = createRepository();
  const event = (id, type, status) => ({
    id,
    created: 110,
    type,
    data: { object: {
      id: "sub_test",
      customer: "cus_test",
      status,
      metadata: { fandom_account_id: "account_one" },
    } },
  });
  await Promise.all([
    applyBlobBillingEvent({
      repository,
      event: event("evt_active", "customer.subscription.updated", "active"),
    }),
    applyBlobBillingEvent({
      repository,
      event: event("evt_deleted", "customer.subscription.deleted", "canceled"),
    }),
  ]);
  assert.equal((await repository.membershipForAccount("account_one")).status, "inactive");
});

test("customer and account mismatches never grant membership", async () => {
  const { repository, store } = createRepository();
  await repository.linkCustomer("account_owner", "cus_shared");
  const event = {
    id: "evt_mismatch",
    created: 90,
    type: "customer.subscription.updated",
    data: { object: {
      id: "sub_shared",
      customer: "cus_shared",
      status: "active",
      metadata: { fandom_account_id: "account_attacker" },
    } },
  };
  const result = await applyBlobBillingEvent({ repository, event });
  assert.equal(result.reason, "stripe_identity_conflict");
  const operation = await store.get("operations/stripe-identity-conflict");
  assert.deepEqual(
    Object.keys(operation).sort(),
    ["count", "eventCategory", "firstOccurredAt", "lastOccurredAt", "reason", "schemaVersion", "type"].sort(),
  );
  assert.equal(operation.eventCategory, "subscription");
  assert.equal(operation.count, 1);
  const operatorOutput = JSON.stringify(operation);
  assert.doesNotMatch(operatorOutput, /cus_shared|collector@example\.com|account_attacker|rawPayload/);
  assert.deepEqual(await applyBlobBillingEvent({ repository, event }), { duplicate: true });
  assert.equal((await store.get("operations/stripe-identity-conflict")).count, 1);
  assert.equal((await repository.membershipForAccount("account_attacker")).status, "inactive");
  assert.equal((await repository.membershipForAccount("account_owner")).status, "inactive");
});

test("checkout identity conflicts use a distinct bounded operational record", async () => {
  const { repository, store } = createRepository();
  await repository.linkCustomer("account_owner", "cus_shared");
  const result = await applyBlobBillingEvent({
    repository,
    event: {
      id: "evt_checkout_conflict",
      type: "checkout.session.completed",
      data: { object: {
        customer: { id: "cus_shared", email: "private@example.com" },
        metadata: { fandom_account_id: "account_other" },
      } },
    },
  });
  assert.equal(result.reason, "stripe_identity_conflict");
  const operation = await store.get("operations/stripe-identity-conflict");
  assert.equal(operation.eventCategory, "checkout");
  assert.doesNotMatch(JSON.stringify(operation), /cus_shared|private@example\.com|account_other/);
  assert.deepEqual(await repository.identityConflictSummary(), {
    reason: "stripe_identity_conflict",
    category: "checkout",
    count: 1,
    firstOccurredAt: operation.firstOccurredAt,
    lastOccurredAt: operation.lastOccurredAt,
  });
});
