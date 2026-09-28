import test from "node:test";
import assert from "node:assert/strict";
import {
  auditSubscriptionProducts,
  classifySubscription,
  PROGRESS_REPORTING_OPERATOR_ALERT,
  progressReportingAlertTransition,
  recordSharedProgressReportingHealth,
  sendProgressReportingOperatorAlert,
  settleProgressReportingAlertDelivery,
  settleSharedProgressReportingAlertDelivery,
  validateMembershipPriceMappings,
} from "./subscription-product-audit.js";

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

test("release configuration reports every supported canonical membership mapping", () => {
  const result = validateMembershipPriceMappings(env);
  assert.deepEqual(result, {
    valid: true,
    configured: [
      { product: "fandom_collector", envKey: "FANDOM_STRIPE_MEMBERSHIP_PRICE_ID" },
      { product: "creator_os", envKey: "FANDOM_CREATOR_OS_PRICE_ID" },
      { product: "fandom_creator_bridge", envKey: "FANDOM_CREATOR_BRIDGE_PRICE_ID" },
      { product: "ecosystem_bundle", envKey: "FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID" },
    ],
    missing: [],
    conflicting: [],
  });
});

test("release configuration rejects missing and conflicting canonical mappings", () => {
  const missing = validateMembershipPriceMappings({
    ...env,
    FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID: "",
  });
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missing, ["ecosystem_bundle"]);
  assert.deepEqual(missing.conflicting, []);

  const sharedPrice = validateMembershipPriceMappings({
    ...env,
    FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID: "price_collector",
  });
  assert.equal(sharedPrice.valid, false);
  assert.deepEqual(sharedPrice.missing, []);
  assert.deepEqual(sharedPrice.conflicting, [{
    products: ["fandom_collector", "ecosystem_bundle"],
    envKeys: ["FANDOM_STRIPE_MEMBERSHIP_PRICE_ID", "FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID"],
  }]);
});

test("release configuration ignores retired legacy price aliases", () => {
  const result = validateMembershipPriceMappings({
    ...env,
    FANDOM_CREATOR_OS_MEMBERSHIP_PRICE_ID: "price_legacy_creator",
    FANDOM_FANDOM_CREATOR_BRIDGE_PRICE_ID: "price_legacy_bridge",
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.configured, [
    { product: "fandom_collector", envKey: "FANDOM_STRIPE_MEMBERSHIP_PRICE_ID" },
    { product: "creator_os", envKey: "FANDOM_CREATOR_OS_PRICE_ID" },
    { product: "fandom_creator_bridge", envKey: "FANDOM_CREATOR_BRIDGE_PRICE_ID" },
    { product: "ecosystem_bundle", envKey: "FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID" },
  ]);
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
  assert.equal(report.progressReportingFailures, 0);
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

test("audit reports bounded progress only after successful updates", async () => {
  const rows = {
    active: [
      subscription("sub_first_private", "price_collector"),
      subscription("sub_second_private", "price_creator"),
    ],
    trialing: [],
  };
  const progress = [];
  let updateCalls = 0;
  const stripe = {
    subscriptions: {
      list: ({ status }) => ({
        async *[Symbol.asyncIterator]() { yield* rows[status]; },
      }),
      update: async () => {
        updateCalls += 1;
        if (updateCalls === 2) throw new Error("provider detail");
      },
    },
  };

  await assert.rejects(
    auditSubscriptionProducts({
      stripe,
      env,
      apply: true,
      onUpdateProgress: updateProgress => progress.push(updateProgress),
    }),
    /provider detail/,
  );
  assert.deepEqual(progress, [{ updated: 1 }]);
  assert.deepEqual(Object.keys(progress[0]), ["updated"]);
});

test("audit isolates progress observer failures after completed updates", async () => {
  const rows = {
    active: [
      subscription("sub_first_private", "price_collector"),
      subscription("sub_second_private", "price_creator"),
    ],
    trialing: [],
  };
  const progress = [];
  const updates = [];
  const stripe = {
    subscriptions: {
      list: ({ status }) => ({
        async *[Symbol.asyncIterator]() { yield* rows[status]; },
      }),
      update: async id => updates.push(id),
    },
  };

  const report = await auditSubscriptionProducts({
    stripe,
    env,
    apply: true,
    onUpdateProgress: async updateProgress => {
      progress.push(updateProgress);
      throw new Error("observer detail");
    },
  });

  assert.deepEqual(updates, ["sub_first_private", "sub_second_private"]);
  assert.equal(report.updated, 2);
  assert.equal(report.progressReportingFailures, 2);
  assert.equal(report.updated <= report.identified, true);
  assert.deepEqual(progress, [{ updated: 1 }, { updated: 2 }]);
  assert.deepEqual(progress.map(Object.keys), [["updated"], ["updated"]]);
  assert.equal(JSON.stringify(progress).includes("sub_"), false);
  assert.equal(JSON.stringify(progress).includes("price_"), false);
  assert.deepEqual(
    Object.keys(report).filter(key => key.toLowerCase().includes("progress")),
    ["progressReportingFailures"],
  );
  const reportingSignal = JSON.stringify({
    progressReportingFailures: report.progressReportingFailures,
  });
  assert.equal(reportingSignal.includes("observer detail"), false);
  assert.equal(reportingSignal.includes("sub_"), false);
  assert.equal(reportingSignal.includes("price_"), false);
  assert.equal(reportingSignal.includes("provider"), false);
});

test("progress reporting health alerts once at the repeated-run threshold", () => {
  const first = progressReportingAlertTransition({}, 3);
  const second = progressReportingAlertTransition(first.state, 1);
  const later = progressReportingAlertTransition(second.state, 9);

  assert.deepEqual(first, {
    state: { consecutiveFailureRuns: 1, alertDelivery: "not_attempted" },
    shouldAlert: false,
  });
  assert.deepEqual(second, {
    state: { consecutiveFailureRuns: 2, alertDelivery: "pending" },
    shouldAlert: true,
  });
  assert.deepEqual(later, {
    state: { consecutiveFailureRuns: 2, alertDelivery: "pending" },
    shouldAlert: false,
  });
});

test("progress reporting health recovers and can alert after a new streak", () => {
  const recovered = progressReportingAlertTransition(
    { consecutiveFailureRuns: 2 },
    0,
  );
  const firstAfterRecovery = progressReportingAlertTransition(recovered.state, 1);
  const secondAfterRecovery = progressReportingAlertTransition(firstAfterRecovery.state, 1);

  assert.deepEqual(recovered, {
    state: { consecutiveFailureRuns: 0, alertDelivery: "recovered" },
    shouldAlert: false,
  });
  assert.equal(firstAfterRecovery.shouldAlert, false);
  assert.equal(secondAfterRecovery.shouldAlert, true);
});

test("progress reporting alert state is bounded and contains no private details", () => {
  const privateState = {
    consecutiveFailureRuns: Number.MAX_SAFE_INTEGER,
    observerError: "observer detail",
    subscriptionId: "sub_private",
    priceId: "price_private",
    provider: "StripeAPIError",
  };
  const transition = progressReportingAlertTransition(privateState, 4);
  const serialized = JSON.stringify(transition);

  assert.deepEqual(transition, {
    state: { consecutiveFailureRuns: 2, alertDelivery: "not_attempted" },
    shouldAlert: false,
  });
  assert.doesNotMatch(
    `${serialized}\n${PROGRESS_REPORTING_OPERATOR_ALERT}`,
    /observer detail|sub_private|price_private|StripeAPIError/,
  );
  assert.equal(PROGRESS_REPORTING_OPERATOR_ALERT.length < 200, true);
});

test("progress reporting alerts use the operations channel and record delivery", async () => {
  const requests = [];
  await sendProgressReportingOperatorAlert({
    env: {
      RESEND_API_KEY: "test-key",
      FANDOM_AUTH_FROM_EMAIL: "Fandom <ops@example.test>",
      FANDOM_ADMIN_EMAILS: "one@example.test, two@example.test",
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true };
    },
  });

  assert.equal(requests[0].url, "https://api.resend.com/emails");
  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(payload.to, ["one@example.test", "two@example.test"]);
  assert.match(payload.subject, /^\[Fandom operations\]/);
  assert.doesNotMatch(
    JSON.stringify(payload),
    /sub_private|price_private|observer detail|StripeAPIError/,
  );
  assert.deepEqual(
    settleProgressReportingAlertDelivery(
      { consecutiveFailureRuns: 2, alertDelivery: "pending" },
      true,
    ),
    { consecutiveFailureRuns: 2, alertDelivery: "delivered" },
  );
});

test("rejected progress reporting alerts produce a bounded rejection receipt", async () => {
  await assert.rejects(
    sendProgressReportingOperatorAlert({
      env: {
        RESEND_API_KEY: "test-key",
        FANDOM_AUTH_FROM_EMAIL: "Fandom <ops@example.test>",
        FANDOM_ADMIN_EMAILS: "operator@example.test",
      },
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /delivery failed \(503\)/,
  );
  assert.deepEqual(
    settleProgressReportingAlertDelivery(
      { consecutiveFailureRuns: 2, alertDelivery: "pending" },
      false,
    ),
    { consecutiveFailureRuns: 2, alertDelivery: "rejected" },
  );
});

test("shared progress reporting health serializes concurrent threshold transitions", async () => {
  const store = sharedHealthStore({
    consecutiveFailureRuns: 1,
    alertDelivery: "not_attempted",
  });
  const transitions = await Promise.all([
    recordSharedProgressReportingHealth(store, 1),
    recordSharedProgressReportingHealth(store, 1),
  ]);

  assert.equal(transitions.filter(transition => transition.shouldAlert).length, 1);
  assert.deepEqual(store.value(), {
    consecutiveFailureRuns: 2,
    alertDelivery: "pending",
  });
});

test("shared progress reporting health stores bounded state and settles delivery safely", async () => {
  const store = sharedHealthStore({
    consecutiveFailureRuns: Number.MAX_SAFE_INTEGER,
    alertDelivery: "pending",
    observer: "private observer",
    subscription: "sub_private",
    price: "price_private",
    provider: "StripeAPIError",
  });

  const transition = await recordSharedProgressReportingHealth(store, 9);
  await settleSharedProgressReportingAlertDelivery(store, transition.state, false);

  assert.deepEqual(store.value(), {
    consecutiveFailureRuns: 2,
    alertDelivery: "rejected",
  });
  assert.doesNotMatch(
    JSON.stringify(store.value()),
    /observer|sub_private|price_private|StripeAPIError/,
  );
});

function sharedHealthStore(initialValue) {
  let revision = initialValue === undefined ? 0 : 1;
  let value = initialValue === undefined ? undefined : structuredClone(initialValue);
  return {
    async getWithMetadata() {
      return value === undefined
        ? null
        : { data: structuredClone(value), etag: `"${revision}"` };
    },
    async setJSON(_key, next, options = {}) {
      await new Promise(resolve => setImmediate(resolve));
      if (options.onlyIfNew && value !== undefined) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== `"${revision}"`) {
        return { modified: false };
      }
      revision += 1;
      value = structuredClone(next);
      return { modified: true, etag: `"${revision}"` };
    },
    value() {
      return structuredClone(value);
    },
  };
}
