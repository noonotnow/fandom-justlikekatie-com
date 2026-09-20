import test from "node:test";
import assert from "node:assert/strict";
import { createBillingHandlers, createBillingServices, createEntitlementChecker } from "./billing.js";
import {
  BILLING_EVENT_RETENTION_DAYS,
  createBillingRepository,
  membershipStatus,
} from "./billing-repository.js";
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

test("SQL event claims suppress duplicates and can be released after failure", async () => {
  const claimed = new Set();
  let claimIsStale = false;
  const repository = createBillingRepository({
    query: async (sql, params = []) => {
      if (sql.startsWith("INSERT INTO public.fandom_billing_events")) {
        if (claimed.has(params[0]) && !(claimIsStale && sql.includes("INTERVAL '5 minutes'"))) {
          return { rows: [] };
        }
        claimed.add(params[0]);
        claimIsStale = false;
        return { rows: [{ stripe_event_id: params[0] }] };
      }
      if (sql.startsWith("DELETE FROM public.fandom_billing_events")) {
        claimed.delete(params[0]);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  const event = { id: "evt_sql", type: "customer.subscription.updated", created: 1 };
  assert.equal(await repository.claimEvent(event), true);
  assert.equal(await repository.claimEvent(event), false);
  claimIsStale = true;
  assert.equal(await repository.claimEvent(event), true);
  await repository.releaseEvent(event.id);
  assert.equal(await repository.claimEvent(event), true);
});

test("SQL receipt cleanup deletes only a bounded expired batch", async () => {
  let cleanup;
  const repository = createBillingRepository({
    query: async (sql, params) => {
      cleanup = { sql, params };
      return { rows: [{ stripe_event_id: "evt_old" }] };
    },
  });
  assert.equal(await repository.pruneProcessedEvents(), 1);
  assert.match(cleanup.sql, /state = 'processed'/);
  assert.match(cleanup.sql, /ORDER BY processed_at, stripe_event_id/);
  assert.match(cleanup.sql, /LIMIT \$2/);
  assert.deepEqual(cleanup.params, [BILLING_EVENT_RETENTION_DAYS, 25]);
});

test("application schema idempotently indexes processed receipt retention order", async () => {
  let schemaSql;
  const repository = createBillingRepository({
    query: async sql => {
      schemaSql = sql;
      return { rows: [] };
    },
  });

  await repository.ensureApplicationSchema();

  assert.match(
    schemaSql,
    /CREATE INDEX IF NOT EXISTS fandom_billing_events_processed_retention_idx/,
  );
  assert.match(
    schemaSql,
    /ON public\.fandom_billing_events \(processed_at, stripe_event_id\)\s+WHERE state = 'processed'/,
  );
  assert.doesNotMatch(schemaSql, /fandom_billing_accounts[\s\S]*CREATE INDEX/);
});

test("protected membership reads never run receipt cleanup", async () => {
  let cleanupCalls = 0;
  const handlers = createBillingHandlers({
    auth,
    billing: {
      initialize: async () => {},
      repository: () => ({
        membershipForAccount: async () => ({ status: "active" }),
        pruneProcessedEvents: async () => { cleanupCalls += 1; },
      }),
    },
  });
  assert.equal((await handlers.status(request("/api/billing/status", { method: "GET" }), {})).status, 200);
  assert.equal(cleanupCalls, 0);
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
      checkout: { sessions: { create: async (input, options) => { calls.push(["checkout", input, options]); return { url: "https://checkout.test" }; } } },
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
  assert.match(calls[1][2].idempotencyKey, /^collector-checkout:usr_member:price_real123:/);
});

test("checkout accepts only configured campaign attribution and promotion codes", async () => {
  const inputs = [];
  const billing = {
    initialize: async () => {},
    repository: () => ({ customerForAccount: async () => "cus_saved" }),
    stripe: async () => ({
      customers: { retrieve: async () => ({ id: "cus_saved", deleted: false }) },
      checkout: { sessions: { create: async input => {
        inputs.push(input);
        return { url: "https://checkout.test" };
      } } },
    }),
  };
  const handlers = createBillingHandlers({
    auth,
    billing,
    env: {
      FANDOM_STRIPE_MEMBERSHIP_PRICE_ID: "price_real123",
      FANDOM_STRIPE_ALLOW_PROMOTION_CODES: "true",
      FANDOM_STRIPE_CAMPAIGNS: "founding,archive",
    },
  });
  await handlers.checkout(request("/api/billing/checkout", {
    body: JSON.stringify({ campaign: "founding", price: "price_attacker" }),
    headers: { "Content-Type": "application/json" },
  }), {});
  await handlers.checkout(request("/api/billing/checkout", {
    body: JSON.stringify({ campaign: "untrusted" }),
    headers: { "Content-Type": "application/json" },
  }), {});
  assert.equal(inputs[0].metadata.campaign, "founding");
  assert.equal(inputs[0].allow_promotion_codes, true);
  assert.equal(inputs[0].line_items[0].price, "price_real123");
  assert.equal("campaign" in inputs[1].metadata, false);
});

test("archive checkout restores only a validated requested edition", async () => {
  const inputs = [];
  const billing = {
    initialize: async () => {},
    repository: () => ({
      customerForAccount: async () => "cus_saved",
      membershipForAccount: async () => ({ status: "inactive" }),
    }),
    stripe: async () => ({
      customers: { retrieve: async () => ({ id: "cus_saved", deleted: false }) },
      checkout: { sessions: { create: async input => {
        inputs.push(input);
        return { url: "https://checkout.test" };
      } } },
    }),
  };
  const handlers = createBillingHandlers({
    auth,
    billing,
    env: { FANDOM_STRIPE_MEMBERSHIP_PRICE_ID: "price_real123" },
  });
  await handlers.checkout(request("/api/billing/checkout", {
    body: JSON.stringify({ returnDate: "2026-09-01" }),
    headers: { "Content-Type": "application/json" },
  }), {});
  assert.equal(inputs[0].success_url, "https://example.test/vibe-atlas?date=2026-09-01&membership=success");
  assert.equal(inputs[0].cancel_url, "https://example.test/vibe-atlas?date=2026-09-01&membership=cancelled");

  await handlers.checkout(request("/api/billing/checkout", {
    body: JSON.stringify({ returnDate: "https://evil.test/" }),
    headers: { "Content-Type": "application/json" },
  }), {});
  assert.equal(inputs[1].success_url, "https://example.test/vibe-atlas?view=membership&membership=success");
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
    id: "evt_external",
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
      subscriptions: { retrieve: async () => event.data.object },
    }),
    getStore: () => ({
      async get(key) { return values.get(key) || null; },
      async getWithMetadata(key) {
        return values.has(key) ? { data: values.get(key), etag: `"${key}"` } : null;
      },
      async setJSON(key, value, options = {}) {
        if (options.onlyIfNew && values.has(key)) return { modified: false };
        values.set(key, value);
        return { modified: true };
      },
      async delete(key) { values.delete(key); },
      list({ prefix, paginate }) {
        const page = {
          blobs: [...values.keys()]
            .filter(key => key.startsWith(prefix))
            .map(key => ({ key })),
        };
        if (!paginate) return Promise.resolve(page);
        return {
          async *[Symbol.asyncIterator]() {
            yield page;
          },
        };
      },
    }),
    runStripeMigrations: async () => { throw new Error("Postgres migrations must not run on Netlify."); },
  });

  await billing.initialize();
  await billing.processWebhook(Buffer.from('{"id":"evt_external"}'), "t=1,v1=signed", {});
  assert.equal((await billing.repository({}).membershipForAccount(user.accountId)).status, "active");
});

test("blob billing logs identity conflicts without exposing Stripe or account identifiers", async () => {
  const values = new Map();
  const warnings = [];
  const event = {
    id: "evt_private",
    created: 50,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_private",
        customer: "cus_private",
        status: "active",
        metadata: {
          fandom_account_id: "account_other",
          email: "private@example.com",
        },
      },
    },
  };
  const store = {
    async get(key) { return values.get(key) || null; },
    async getWithMetadata(key) {
      return values.has(key) ? { data: values.get(key), etag: `"${key}"` } : null;
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && values.has(key)) return { modified: false };
      values.set(key, value);
      return { modified: true };
    },
    async delete(key) { values.delete(key); },
    list({ prefix, paginate }) {
      const page = {
        blobs: [...values.keys()]
          .filter(key => key.startsWith(prefix))
          .map(key => ({ key })),
      };
      if (!paginate) return Promise.resolve(page);
      return {
        async *[Symbol.asyncIterator]() {
          yield page;
        },
      };
    },
  };
  const billing = createBillingServices({
    env: {
      NETLIFY: "true",
      STRIPE_SECRET_KEY: "sk_test_private",
      STRIPE_WEBHOOK_SECRET: "whsec_private",
    },
    stripeClient: async () => ({
      webhooks: { constructEvent: () => event },
      subscriptions: { retrieve: async () => event.data.object },
    }),
    getStore: () => store,
    logger: { warn: (...args) => warnings.push(args) },
  });
  await billing.repository({}).linkCustomer("account_owner", "cus_private");

  await billing.processWebhook(
    Buffer.from(JSON.stringify(event)),
    "t=1,v1=private-signature",
    {},
  );

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "[billing] membership update rejected");
  const operatorOutput = JSON.stringify(warnings[0]);
  assert.match(operatorOutput, /stripe_identity_conflict/);
  assert.doesNotMatch(
    operatorOutput,
    /cus_private|sub_private|account_owner|account_other|private@example\.com|evt_private|private-signature/,
  );
});
