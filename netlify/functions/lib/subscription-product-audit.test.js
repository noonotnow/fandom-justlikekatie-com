import test from "node:test";
import assert from "node:assert/strict";
import { auditSubscriptionProducts, classifySubscription } from "./subscription-product-audit.js";

const env = {
  FANDOM_STRIPE_MEMBERSHIP_PRICE_ID: "price_collector",
  FANDOM_CREATOR_OS_PRICE_ID: "price_creator",
  FANDOM_CREATOR_BRIDGE_PRICE_ID: "price_bridge",
  FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID: "price_bundle",
};

const subscription = (id, price, metadata = {}) => ({
  id,
  metadata,
  items: { data: price ? [{ price: { id: price } }] : [] },
});

test("classification never guesses unknown, conflicting, or multi-price products", () => {
  assert.equal(classifySubscription(subscription("one", "price_collector"), env).product, "fandom_collector");
  assert.equal(classifySubscription(subscription("two", "price_unknown"), env).reason, "unconfigured_price");
  assert.equal(classifySubscription(subscription("three", "price_collector", { product: "creator_os" }), env).reason, "metadata_price_conflict");
  assert.equal(classifySubscription(subscription("unknown", "price_collector", { capability: "mystery" }), env).reason, "invalid_product_metadata");
  assert.equal(classifySubscription({
    ...subscription("four", "price_collector"),
    items: { data: [{ price: { id: "price_collector" } }, { price: { id: "price_creator" } }] },
  }, env).reason, "subscription_must_have_one_identifiable_price");
});

test("audit reports safe identifiers and backfills only unambiguous subscriptions", async () => {
  const rows = {
    active: [
      subscription("sub_supported", "price_collector"),
      subscription("sub_unknown", "price_unknown"),
    ],
    trialing: [subscription("sub_complete", "price_creator", {
      product: "creator_os",
      capability: "creator_os",
    })],
  };
  const updates = [];
  const stripe = {
    subscriptions: {
      list: ({ status }) => ({
        async *[Symbol.asyncIterator]() { yield* rows[status]; },
      }),
      update: async (id, input) => updates.push([id, input]),
    },
  };
  const report = await auditSubscriptionProducts({
    stripe, env, apply: true, now: () => "2026-09-20T00:00:00.000Z",
  });
  assert.equal(report.activeSubscriptions, 3);
  assert.equal(report.identified, 2);
  assert.equal(report.updated, 1);
  assert.deepEqual(report.ambiguous, [{
    subscriptionId: "sub_unknown",
    status: "active",
    reason: "unconfigured_price",
    priceIds: ["price_unknown"],
  }]);
  assert.deepEqual(updates, [["sub_supported", {
    metadata: { product: "fandom_collector", capability: "fandom_collector" },
  }]]);
  assert.equal(JSON.stringify(report).includes("customer"), false);
});