import test from "node:test";
import assert from "node:assert/strict";
import { createBlobBillingRepository } from "./billing-blob-repository.js";
import { applyBlobBillingEvent } from "./billing-blob-webhook.js";

function createMemoryStore() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) || null;
    },
    async setJSON(key, value) {
      values.set(key, value);
    },
  };
}

function createRepository() {
  const store = createMemoryStore();
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
