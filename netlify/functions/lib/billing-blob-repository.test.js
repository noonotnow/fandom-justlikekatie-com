import test from "node:test";
import assert from "node:assert/strict";
import { createBlobBillingRepository } from "./billing-blob-repository.js";
import { applyBlobBillingEvent } from "./billing-blob-webhook.js";

function createMemoryStore() {
  const values = new Map();
  const versions = new Map();
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
  await repository.linkCustomer("account/one", "cus_test");
  await repository.recordSubscription({
    accountId: "account/one",
    customerId: "cus_test",
    subscriptionId: "sub_test",
    status: "active",
    currentPeriodEnd: "2026-09-30T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    eventCreated: 10,
  });

  assert.equal(await repository.customerForAccount("account/one"), "cus_test");
  assert.deepEqual(await repository.membershipForAccount("account/one"), {
    status: "active",
    stripeStatus: "active",
    currentPeriodEnd: "2026-09-30T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  });
});

test("older subscription webhooks cannot overwrite newer membership state", async () => {
  const { repository } = createRepository();
  await repository.recordSubscription({
    accountId: "account_one",
    customerId: "cus_test",
    subscriptionId: "sub_test",
    status: "active",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    eventCreated: 20,
  });
  await repository.recordSubscription({
    accountId: "account_one",
    customerId: "cus_test",
    subscriptionId: "sub_test",
    status: "canceled",
    currentPeriodEnd: null,
    eventCreated: 19,
  });

  const membership = await repository.membershipForAccount("account_one");
  assert.equal(membership.status, "active");
  assert.equal(membership.currentPeriodEnd, "2026-10-01T00:00:00.000Z");
});

test("subscription webhook metadata binds the account without exposing provider data", async () => {
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
  const event = {
    id: "evt_duplicate",
    created: 50,
    type: "customer.subscription.created",
    data: { object: {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      metadata: { fandom_account_id: "account_one" },
    } },
  };
  assert.deepEqual(await applyBlobBillingEvent({ repository, event }), { applied: true });
  assert.deepEqual(await applyBlobBillingEvent({ repository, event }), { duplicate: true });
  assert.equal((await store.get("events/evt_duplicate")).eventId, "evt_duplicate");
});

test("an abandoned event claim can be recovered after its lease expires", async () => {
  const { repository, store } = createRepository();
  const event = {
    id: "evt_abandoned",
    created: 55,
    type: "customer.subscription.updated",
    data: { object: {
      id: "sub_test",
      customer: "cus_test",
      status: "active",
      metadata: { fandom_account_id: "account_one" },
    } },
  };
  assert.equal(await repository.claimEvent(event), true);
  const abandoned = await store.get("events/evt_abandoned");
  await store.setJSON("events/evt_abandoned", {
    ...abandoned,
    claimedAt: "2020-01-01T00:00:00.000Z",
  });
  assert.deepEqual(await applyBlobBillingEvent({ repository, event }), { applied: true });
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
    created: 100,
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
  const { repository } = createRepository(store);
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
  const { repository } = createRepository();
  await repository.linkCustomer("account_owner", "cus_shared");
  await applyBlobBillingEvent({
    repository,
    event: {
      id: "evt_mismatch",
      created: 90,
      type: "customer.subscription.updated",
      data: { object: {
        id: "sub_shared",
        customer: "cus_shared",
        status: "active",
        metadata: { fandom_account_id: "account_attacker" },
      } },
    },
  });
  assert.equal((await repository.membershipForAccount("account_attacker")).status, "inactive");
  assert.equal((await repository.membershipForAccount("account_owner")).status, "inactive");
});
