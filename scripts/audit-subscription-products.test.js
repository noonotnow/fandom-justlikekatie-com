import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = new URL("./audit-subscription-products.js", import.meta.url);
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