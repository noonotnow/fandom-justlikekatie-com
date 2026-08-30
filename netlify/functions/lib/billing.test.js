import test from "node:test";
import assert from "node:assert/strict";
import { createBillingHandlers, createBillingServices, createEntitlementChecker } from "./billing.js";
import { membershipStatus } from "./billing-repository.js";
import { createGridExportHandlers } from "./grid-exports.js";

const user = { accountId: "usr_member", email: "member@example.test" };
const auth = { authenticate: async () => ({ user }) };
const request = (path, options = {}) => new Request(`https://example.test${path}`, {
  method: options.method || "POST",
  headers: { Origin: "https://example.test", ...(options.headers || {}) },
  body: options.body,
});

test("membership maps only active and trialing subscriptions to entitlement", () => {
  assert.equal(membershipStatus("active"), "active");
  assert.equal(membershipStatus("trialing"), "active");
  assert.equal(membershipStatus("past_due"), "past_due");
  assert.equal(membershipStatus("canceled"), "inactive");
  assert.equal(membershipStatus(null), "inactive");
});

test("billing status requires passwordless authentication", async () => {
  const handlers = createBillingHandlers({
    auth: { authenticate: async () => { const e = new Error("Sign in is required."); e.status = 401; throw e; } },
    billing: { initialize: async () => {}, repository: () => ({ membershipForAccount: async () => ({ status: "active" }) }) },
  });
  assert.equal((await handlers.status(request("/api/billing/status", { method: "GET" }), {})).status, 401);
});

test("checkout and portal are bound to the authenticated account", async () => {
  const calls = [];
  const repository = {
    customerForAccount: async id => { calls.push(["lookup", id]); return id === user.accountId ? "cus_saved" : null; },
    membershipForAccount: async () => ({ status: "inactive" }),
  };
  const billing = {
    initialize: async () => {},
    repository: () => repository,
    stripe: async () => ({
      customers: { retrieve: async customer => ({ id: customer, deleted: false }) },
      checkout: { sessions: { create: async input => { calls.push(["checkout", input]); return { url: "https://checkout.test" }; } } },
      billingPortal: { sessions: { create: async input => { calls.push(["portal", input]); return { url: "https://portal.test" }; } } },
    }),
  };
  const handlers = createBillingHandlers({ auth, billing, env: { FANDOM_STRIPE_MEMBERSHIP_PRICE_ID: "price_real123" } });
  assert.equal((await handlers.checkout(request("/api/billing/checkout"), {})).status, 200);
  assert.equal((await handlers.portal(request("/api/billing/portal"), {})).status, 200);
  assert.equal(calls[1][1].customer, "cus_saved");
  assert.equal(calls[3][1].customer, "cus_saved");
  assert.equal(calls[1][1].line_items[0].price, "price_real123");
  assert.deepEqual(calls[1][1].managed_payments, { enabled: false });
});

test("checkout retries without a stale customer when Stripe reports a missing resource", async () => {
  const inputs = [];
  const repository = {
    customerForAccount: async () => "cus_old_account",
    linkCustomer: async () => "cus_new_account",
    membershipForAccount: async () => ({ status: "inactive" }),
  };
  const billing = {
    initialize: async () => {},
    repository: () => repository,
    stripe: async () => ({
      customers: { retrieve: async () => ({ id: "cus_old_account", deleted: false }) },
      checkout: {
        sessions: {
          create: async input => {
            inputs.push(input);
            if (inputs.length === 1) {
              const error = new Error("No such customer");
              error.code = "resource_missing";
              throw error;
            }
            return { url: "https://checkout.test" };
          },
        },
      },
    }),
  };
  const handlers = createBillingHandlers({ auth, billing, env: { FANDOM_STRIPE_MEMBERSHIP_PRICE_ID: "price_real123" } });
  assert.equal((await handlers.checkout(request("/api/billing/checkout"), {})).status, 200);
  assert.equal(inputs[0].customer, "cus_old_account");
  assert.equal(inputs[1].customer_email, user.email);
  assert.equal("customer" in inputs[1], false);
});

test("webhook delegates the exact raw body and signature to Stripe sync", async () => {
  let processed;
  const handlers = createBillingHandlers({
    billing: {
      initialize: async () => ({ processWebhook: async (body, signature) => { processed = { body, signature }; } }),
    },
  });
  const res = await handlers.webhook(request("/api/billing/webhook", {
    body: '{"id":"evt_1"}', headers: { "stripe-signature": "t=1,v1=signed" },
  }));
  assert.equal(res.status, 200);
  assert.equal(processed.body.toString(), '{"id":"evt_1"}');
  assert.equal(processed.signature, "t=1,v1=signed");
});

test("grid export enforcement is injected and can reject inactive accounts", async () => {
  const checker = createEntitlementChecker({
    billing: {
      initialize: async () => {},
      repository: () => ({ membershipForAccount: async () => ({ status: "inactive" }) }),
    },
  });
  const handler = createGridExportHandlers({
    auth, getStore: () => { throw new Error("storage must not be accessed"); }, requireMembership: checker,
  }).handler;
  const res = await handler(request("/grid-exports?gridId=grid"), {});
  assert.equal(res.status, 403);
});

test("external Netlify billing does not require the internal Replit database host", async () => {
  const values = new Map();
  const event = {
    created: 50,
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_external",
        customer: "cus_external",
        status: "active",
        current_period_end: 1790726400,
        cancel_at_period_end: false,
        metadata: { fandom_account_id: user.accountId },
      },
    },
  };
  const billing = createBillingServices({
    env: {
      NETLIFY: "true",
      STRIPE_SECRET_KEY: "sk_test_external",
      STRIPE_WEBHOOK_SECRET: "whsec_external",
    },
    stripeClient: async () => ({
      webhooks: { constructEvent: () => event },
    }),
    getStore: () => ({
      async get(key) { return values.get(key) || null; },
      async setJSON(key, value) { values.set(key, value); },
    }),
    runStripeMigrations: async () => { throw new Error("Postgres migrations must not run on Netlify."); },
  });

  await billing.initialize();
  await billing.processWebhook(Buffer.from('{"id":"evt_external"}'), "t=1,v1=signed", {});
  assert.equal((await billing.repository({}).membershipForAccount(user.accountId)).status, "active");
});