import test from "node:test";
import assert from "node:assert/strict";
import { capabilitiesForMembership } from "./capabilities.js";
import { createCapabilityChecker } from "./billing.js";

const env = {
  FANDOM_STRIPE_MEMBERSHIP_PRICE_ID: "price_collector",
  FANDOM_CREATOR_OS_PRICE_ID: "price_creator",
  FANDOM_CREATOR_BRIDGE_PRICE_ID: "price_bridge",
  FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID: "price_bundle",
};
const membership = metadata => ({ status: "active", metadata });

test("capability matrix derives only the named active product", () => {
  assert.deepEqual(capabilitiesForMembership({ status: "inactive", metadata: { product: "ecosystem_bundle" } }, env), []);
  assert.deepEqual(capabilitiesForMembership({ status: "active" }, env), []);
  assert.deepEqual(capabilitiesForMembership(membership({ product: "fandom_collector" }), env), ["fandom_collector"]);
  assert.deepEqual(capabilitiesForMembership(membership({ product: "creator_os" }), env), ["creator_os"]);
  assert.deepEqual(capabilitiesForMembership(membership({ product: "fandom_creator_bridge" }), env), ["fandom_creator_bridge"]);
  assert.deepEqual(capabilitiesForMembership(membership({ product: "ecosystem_bundle" }), env), [
    "fandom_collector", "creator_os", "fandom_creator_bridge", "ecosystem_bundle",
  ]);
  assert.deepEqual(capabilitiesForMembership({ status: "past_due", priceId: "price_collector" }, env), []);
  assert.deepEqual(capabilitiesForMembership(membership({ product: "unknown_product" }), env), []);
});

test("unidentified and conflicting active products fail closed", () => {
  assert.deepEqual(capabilitiesForMembership({ status: "active" }, env), []);
  assert.deepEqual(capabilitiesForMembership({
    status: "active",
    priceId: "price_collector",
    metadata: { product: "creator_os" },
  }, env), []);
  assert.deepEqual(capabilitiesForMembership({
    status: "active",
    metadata: { product: "not_a_membership" },
  }, env), []);
});

test("configured price IDs preserve Collector and identify other products", () => {
  assert.deepEqual(capabilitiesForMembership({ status: "active", priceId: "price_collector" }, env), ["fandom_collector"]);
  assert.deepEqual(capabilitiesForMembership({ status: "active", priceId: "price_creator" }, env), ["creator_os"]);
  assert.deepEqual(capabilitiesForMembership({ status: "active", priceId: "price_bridge" }, env), ["fandom_creator_bridge"]);
  assert.deepEqual(capabilitiesForMembership({ status: "active", priceId: "price_bundle" }, env), [
    "fandom_collector", "creator_os", "fandom_creator_bridge", "ecosystem_bundle",
  ]);
});

test("legacy price aliases no longer identify membership products", () => {
  const legacyEnv = {
    FANDOM_CREATOR_OS_MEMBERSHIP_PRICE_ID: "price_legacy_creator",
    FANDOM_FANDOM_CREATOR_BRIDGE_PRICE_ID: "price_legacy_bridge",
  };
  assert.deepEqual(capabilitiesForMembership({
    status: "active",
    priceId: "price_legacy_creator",
  }, legacyEnv), []);
  assert.deepEqual(capabilitiesForMembership({
    status: "active",
    priceId: "price_legacy_bridge",
  }, legacyEnv), []);
});

test("capability enforcement rejects Collector-only handoff but accepts Creator products", async () => {
  const checker = capability => createCapabilityChecker({
    env,
    capability,
    billing: {
      initialize: async () => {},
      repository: () => ({ membershipForAccount: async () => membership({ product: "fandom_collector" }) }),
    },
  });
  await assert.rejects(() => checker("creator_os")({ user: { accountId: "a" } }, {}), error => error.status === 403);
  const creator = createCapabilityChecker({
    env,
    capability: ["creator_os", "fandom_creator_bridge"],
    billing: {
      initialize: async () => {},
      repository: () => ({ membershipForAccount: async () => membership({ product: "creator_os" }) }),
    },
  });
  await assert.doesNotReject(() => creator({ user: { accountId: "a" } }, {}));
});

test("enforcement matrix keeps product boundaries isolated", async () => {
  const products = [
    ["inactive", { status: "inactive" }, []],
    ["unidentified", { status: "active" }, []],
    ["collector", membership({ product: "fandom_collector" }), ["fandom_collector"]],
    ["creator", membership({ product: "creator_os" }), ["creator_os"]],
    ["bridge", membership({ product: "fandom_creator_bridge" }), ["fandom_creator_bridge"]],
    ["bundle", membership({ product: "ecosystem_bundle" }), [
      "fandom_collector", "creator_os", "fandom_creator_bridge", "ecosystem_bundle",
    ]],
  ];
  for (const [, record, allowed] of products) {
    for (const capability of ["fandom_collector", "creator_os", "fandom_creator_bridge"]) {
      const checker = createCapabilityChecker({
        env, capability,
        billing: {
          initialize: async () => {},
          repository: () => ({ membershipForAccount: async () => record }),
        },
      });
      const result = checker({ user: { accountId: "a" } }, {});
      if (allowed.includes(capability)) await assert.doesNotReject(result);
      else await assert.rejects(result, error => error.status === 403);
    }
  }
});