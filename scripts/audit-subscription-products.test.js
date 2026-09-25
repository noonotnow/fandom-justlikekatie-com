import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = new URL("./audit-subscription-products.js", import.meta.url);
const FAKE_STRIPE_REGISTER = new URL(
  "./test-fixtures/register-fake-stripe.js",
  import.meta.url,
);
const PRICE_ENV_KEYS = [
  "FANDOM_STRIPE_MEMBERSHIP_PRICE_ID",
  "FANDOM_CREATOR_OS_PRICE_ID",
  "FANDOM_CREATOR_BRIDGE_PRICE_ID",
  "FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID",
];

function runAudit(env = {}) {
  const cleanEnv = { ...process.env };
  for (const key of PRICE_ENV_KEYS) delete cleanEnv[key];

  return spawnSync(
    process.execPath,
    [SCRIPT.pathname, "--config-only", "--allow-missing"],
    {
      encoding: "utf8",
      env: { ...cleanEnv, ...env },
    },
  );
}

function runLiveAudit(args = [], env = {}) {
  const cleanEnv = { ...process.env };
  for (const key of PRICE_ENV_KEYS) delete cleanEnv[key];

  return spawnSync(
    process.execPath,
    ["--import", FAKE_STRIPE_REGISTER.pathname, SCRIPT.pathname, ...args],
    {
      encoding: "utf8",
      env: {
        ...cleanEnv,
        STRIPE_SECRET_KEY: "sk_test_local",
        FANDOM_STRIPE_MEMBERSHIP_PRICE_ID: "price_collector",
        FANDOM_CREATOR_OS_PRICE_ID: "price_creator",
        FANDOM_CREATOR_BRIDGE_PRICE_ID: "price_bridge",
        FANDOM_ECOSYSTEM_BUNDLE_PRICE_ID: "price_bundle",
        ...env,
      },
    },
  );
}

test("allows missing membership mappings during configuration preflight", () => {
  const result = runAudit();

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    configuration: {
      valid: false,
      configured: [],
      missing: [
        "fandom_collector",
        "creator_os",
        "fandom_creator_bridge",
        "ecosystem_bundle",
      ],
      conflicting: [],
    },
  });
});

test("rejects shared price IDs even when missing mappings are allowed", () => {
  const result = runAudit({
    FANDOM_STRIPE_MEMBERSHIP_PRICE_ID: "price_shared",
    FANDOM_CREATOR_OS_PRICE_ID: "price_shared",
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    configuration: {
      valid: false,
      configured: [
        {
          product: "fandom_collector",
          envKey: "FANDOM_STRIPE_MEMBERSHIP_PRICE_ID",
        },
        {
          product: "creator_os",
          envKey: "FANDOM_CREATOR_OS_PRICE_ID",
        },
      ],
      missing: ["fandom_creator_bridge", "ecosystem_bundle"],
      conflicting: [
        {
          products: ["fandom_collector", "creator_os"],
          envKeys: [
            "FANDOM_STRIPE_MEMBERSHIP_PRICE_ID",
            "FANDOM_CREATOR_OS_PRICE_ID",
          ],
        },
      ],
    },
  });
  assert.doesNotMatch(result.stderr, /price_shared/);
});

test("configuration reports contain only reachable mapping fields", () => {
  const result = runAudit({
    FANDOM_STRIPE_MEMBERSHIP_PRICE_ID: "price_private_value",
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.configuration.configured, [
    {
      product: "fandom_collector",
      envKey: "FANDOM_STRIPE_MEMBERSHIP_PRICE_ID",
    },
  ]);
  assert.deepEqual(
    Object.keys(report.configuration.configured[0]).sort(),
    ["envKey", "product"],
  );
  assert.doesNotMatch(result.stdout, /price_private_value/);
});

test("live audit exits 2 and reports ambiguous subscriptions", () => {
  const result = runLiveAudit([], { FAKE_STRIPE_SCENARIO: "ambiguous" });

  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(typeof report.auditedAt, "string");
  delete report.auditedAt;
  assert.deepEqual(report, {
    apply: false,
    activeSubscriptions: 1,
    identified: 0,
    updated: 0,
    ambiguous: [{
      subscriptionId: "sub_ambiguous",
      status: "active",
      reason: "unconfigured_price",
      priceIds: ["price_unknown"],
    }],
  });
});

test("live audit exits 0 with the clean report shape", () => {
  const result = runLiveAudit();

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.match(report.auditedAt, /^\d{4}-\d{2}-\d{2}T/);
  delete report.auditedAt;
  assert.deepEqual(report, {
    apply: false,
    activeSubscriptions: 1,
    identified: 1,
    updated: 0,
    ambiguous: [],
  });
});

test("live audit forwards apply mode", () => {
  const result = runLiveAudit(["--apply"]);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.apply, true);
  assert.equal(report.updated, 1);
});

test("live audit reports Stripe authentication failures without secrets", () => {
  const result = runLiveAudit([], {
    FAKE_STRIPE_SCENARIO: "authentication_failure",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe authentication failed. Verify the configured secret key and Stripe account, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stderr, /sk_test_local|Invalid key|StripeAuthenticationError/);
});

test("live audit distinguishes transient Stripe connection failures", () => {
  const result = runLiveAudit([], {
    FAKE_STRIPE_SCENARIO: "connection_timeout",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe connection failed. Check network access and Stripe service status, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stderr, /sk_test_local|Timed out|ETIMEDOUT|StripeConnectionError/);
});