import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const NOTIFICATION_ENV_KEYS = [
  "RESEND_API_KEY",
  "FANDOM_AUTH_FROM_EMAIL",
  "FANDOM_ADMIN_EMAILS",
];

const TEST_STATE_ROOT = mkdtempSync(join(tmpdir(), "subscription-audit-test-"));
process.on("exit", () => rmSync(TEST_STATE_ROOT, { recursive: true, force: true }));

function isolatedStatePath() {
  return join(
    TEST_STATE_ROOT,
    `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
}

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
  for (const key of NOTIFICATION_ENV_KEYS) delete cleanEnv[key];

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
        SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID: "site_test",
        SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN: "token_test",
        FAKE_BLOB_STATE_PATH: isolatedStatePath(),
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
    progressReportingFailures: 0,
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
    progressReportingFailures: 0,
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

test("apply mode does not require the Stripe update method to be replaceable", () => {
  const result = runLiveAudit(["--apply"], {
    FAKE_STRIPE_SCENARIO: "readonly_update_method",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
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

test("live audit classifies subscription-list authentication by status without a provider type", () => {
  const result = runLiveAudit([], {
    FAKE_STRIPE_SCENARIO: "authentication_status_only",
  });
  const providerDetails =
    /sk_test_local|Status-only invalid list key|401|StripeAuthenticationError/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe authentication failed. Verify the configured secret key and Stripe account, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stdout, providerDetails);
  assert.doesNotMatch(result.stderr, providerDetails);
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

for (const [scenario, code, providerMessage] of [
  ["connection_timeout_code_only", "ETIMEDOUT", "Code-only list timeout"],
  ["connection_reset_code_only", "ECONNRESET", "Code-only list reset"],
]) {
  test(`live audit classifies subscription-list connection failures by ${code} without a provider type`, () => {
    const result = runLiveAudit([], { FAKE_STRIPE_SCENARIO: scenario });
    const providerDetails = new RegExp(
      `sk_test_local|${providerMessage}|${code}|StripeConnectionError`,
    );

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "Stripe connection failed. Check network access and Stripe service status, then retry the audit.\n",
    );
    assert.doesNotMatch(result.stdout, providerDetails);
    assert.doesNotMatch(result.stderr, providerDetails);
  });
}

test("live audit reports unexpected Stripe API failures without provider details", () => {
  const result = runLiveAudit([], {
    FAKE_STRIPE_SCENARIO: "api_failure",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe audit request failed. Check Stripe access and service status, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stderr, /sk_test_local|Provider rejected|api_error|StripeAPIError/);
});

test("live audit reports Stripe client initialization failures without provider details", () => {
  const result = runLiveAudit([], {
    FAKE_STRIPE_SCENARIO: "initialization_failure",
  });
  const providerDetails =
    /sk_test_local|Provider initialization failed|client_initialization_failed|StripeAPIError/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe audit request failed. Check Stripe access and service status, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stdout, providerDetails);
  assert.doesNotMatch(result.stderr, providerDetails);
});

test("live audit reports Stripe authentication failures during client initialization", () => {
  const result = runLiveAudit([], {
    FAKE_STRIPE_SCENARIO: "initialization_authentication_failure",
  });
  const providerDetails =
    /sk_test_local|Invalid key during initialization|StripeAuthenticationError/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe authentication failed. Verify the configured secret key and Stripe account, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stdout, providerDetails);
  assert.doesNotMatch(result.stderr, providerDetails);
});

test("live audit classifies initialization authentication failures by status without a provider type", () => {
  const result = runLiveAudit([], {
    FAKE_STRIPE_SCENARIO: "initialization_authentication_status_only",
  });
  const providerDetails =
    /sk_test_local|Status-only invalid key during initialization|401|StripeAuthenticationError/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe authentication failed. Verify the configured secret key and Stripe account, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stdout, providerDetails);
  assert.doesNotMatch(result.stderr, providerDetails);
});

test("live audit reports Stripe connection failures during client initialization", () => {
  const result = runLiveAudit([], {
    FAKE_STRIPE_SCENARIO: "initialization_connection_timeout",
  });
  const providerDetails =
    /sk_test_local|Initialization timed out|ETIMEDOUT|StripeConnectionError/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe connection failed. Check network access and Stripe service status, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stdout, providerDetails);
  assert.doesNotMatch(result.stderr, providerDetails);
});

for (const [scenario, code, providerMessage] of [
  [
    "initialization_connection_timeout_code_only",
    "ETIMEDOUT",
    "Code-only initialization timeout",
  ],
  [
    "initialization_connection_reset_code_only",
    "ECONNRESET",
    "Code-only initialization reset",
  ],
]) {
  test(`live audit classifies initialization connection failures by ${code} without a provider type`, () => {
    const result = runLiveAudit([], { FAKE_STRIPE_SCENARIO: scenario });
    const providerDetails = new RegExp(
      `sk_test_local|${providerMessage}|${code}|StripeConnectionError`,
    );

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "Stripe connection failed. Check network access and Stripe service status, then retry the audit.\n",
    );
    assert.doesNotMatch(result.stdout, providerDetails);
    assert.doesNotMatch(result.stderr, providerDetails);
  });
}

test("apply mode reports failed Stripe updates without provider details", () => {
  const result = runLiveAudit(["--apply"], {
    FAKE_STRIPE_SCENARIO: "update_api_failure",
  });
  const providerDetails =
    /sk_test_local|Provider update rejected|subscription_update_failed|StripeAPIError/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe audit request failed. Check Stripe access and service status, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stdout, providerDetails);
  assert.doesNotMatch(result.stderr, providerDetails);
});

test("apply mode clearly reports a partially applied run when a later update fails", () => {
  const result = runLiveAudit(["--apply"], {
    FAKE_STRIPE_SCENARIO: "partial_update_failure",
  });
  const privateDetails =
    /sk_test_local|Provider rejected|later_subscription_update_failed|sub_first_private|sub_second_private|private_note|metadata_private_value|price_collector|price_creator/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe subscription updates stopped after 1 successful update. This run was partially applied. Review current Stripe subscription state before retrying.\n",
  );
  assert.doesNotMatch(result.stdout, privateDetails);
  assert.doesNotMatch(result.stderr, privateDetails);
});

test("apply mode reports the exact plural count after several successful updates", () => {
  const result = runLiveAudit(["--apply"], {
    FAKE_STRIPE_SCENARIO: "later_partial_update_failure",
  });
  const privateDetails =
    /sk_test_local|Provider rejected|third_subscription_update_failed|sub_first_private|sub_second_private|sub_third_private|private_note|metadata_private_value|later_private_note|later_metadata_private_value|price_collector|price_creator|price_bridge/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe subscription updates stopped after 2 successful updates. This run was partially applied. Review current Stripe subscription state before retrying.\n",
  );
  assert.doesNotMatch(result.stdout, privateDetails);
  assert.doesNotMatch(result.stderr, privateDetails);
});

test("apply mode keeps the cumulative successful count across subscription pages", () => {
  const result = runLiveAudit(["--apply"], {
    FAKE_STRIPE_SCENARIO: "paginated_partial_update_failure",
  });
  const privateDetails =
    /sk_test_local|Provider rejected|paginated_subscription_update_failed|sub_page_one_first_private|sub_page_one_second_private|sub_page_two_first_private|sub_page_two_second_private|first_page_private_note|first_page_metadata_private_value|second_page_private_note|second_page_metadata_private_value|failing_page_private_note|failing_page_metadata_private_value|price_collector|price_creator|price_bridge|price_bundle/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe subscription updates stopped after 3 successful updates. This run was partially applied. Review current Stripe subscription state before retrying.\n",
  );
  assert.doesNotMatch(result.stdout, privateDetails);
  assert.doesNotMatch(result.stderr, privateDetails);
});

test("apply mode keeps the cumulative successful count across active and trialing subscriptions", () => {
  const result = runLiveAudit(["--apply"], {
    FAKE_STRIPE_SCENARIO: "mixed_status_partial_update_failure",
  });
  const privateDetails =
    /sk_test_local|Provider rejected|trialing_subscription_update_failed|sub_active_first_private|sub_active_second_private|sub_trialing_first_private|sub_trialing_second_private|active_private_note|active_metadata_private_value|trialing_private_note|trialing_metadata_private_value|failing_trialing_private_note|failing_trialing_metadata_private_value|price_collector|price_creator|price_bridge|price_bundle/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe subscription updates stopped after 3 successful updates. This run was partially applied. Review current Stripe subscription state before retrying.\n",
  );
  assert.doesNotMatch(result.stdout, privateDetails);
  assert.doesNotMatch(result.stderr, privateDetails);
});

for (const [scenario, count, noun] of [
  ["trialing_list_failure_after_one_update", 1, "update"],
  ["trialing_list_failure_after_two_updates", 2, "updates"],
]) {
  test(`apply mode reports ${count} completed active ${noun} when trialing listing fails`, () => {
    const result = runLiveAudit(["--apply"], { FAKE_STRIPE_SCENARIO: scenario });
    const privateDetails =
      /sk_test_local|token_test|site_test|Provider rejected|trialing_subscription_list_failed|StripeAPIError|sub_active_first_private|sub_active_second_private|price_collector|price_creator|price_bridge|price_bundle|active_private_note|active_metadata_private_value|second_private_note|second_metadata_private_value/;

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      `Stripe subscription updates stopped after ${count} successful ${noun}. This run was partially applied. Review current Stripe subscription state before retrying.\n`,
    );
    assert.doesNotMatch(result.stdout, privateDetails);
    assert.doesNotMatch(result.stderr, privateDetails);
  });
}

test("apply mode reports Stripe update authentication failures without secrets", () => {
  const result = runLiveAudit(["--apply"], {
    FAKE_STRIPE_SCENARIO: "update_authentication_failure",
  });
  const providerDetails =
    /sk_test_local|Invalid update key|401|StripeAuthenticationError/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe authentication failed. Verify the configured secret key and Stripe account, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stdout, providerDetails);
  assert.doesNotMatch(result.stderr, providerDetails);
});

test("apply mode reports Stripe update connection failures without secrets", () => {
  const result = runLiveAudit(["--apply"], {
    FAKE_STRIPE_SCENARIO: "update_connection_timeout",
  });
  const providerDetails =
    /sk_test_local|Update timed out|ETIMEDOUT|StripeConnectionError/;

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Stripe connection failed. Check network access and Stripe service status, then retry the audit.\n",
  );
  assert.doesNotMatch(result.stdout, providerDetails);
  assert.doesNotMatch(result.stderr, providerDetails);
});

for (const [scenario, code, providerMessage] of [
  ["update_connection_timeout_code_only", "ETIMEDOUT", "Code-only update timeout"],
  ["update_connection_reset_code_only", "ECONNRESET", "Code-only update reset"],
]) {
  test(`apply mode classifies update connection failures by ${code} without a provider type`, () => {
    const result = runLiveAudit(["--apply"], { FAKE_STRIPE_SCENARIO: scenario });
    const providerDetails = new RegExp(
      `sk_test_local|${providerMessage}|${code}|StripeConnectionError`,
    );

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "Stripe connection failed. Check network access and Stripe service status, then retry the audit.\n",
    );
    assert.doesNotMatch(result.stdout, providerDetails);
    assert.doesNotMatch(result.stderr, providerDetails);
  });
}

test("separate audits share failure streaks, alert once, and reset after recovery", () => {
  const statePath = isolatedStatePath();
  const failingEnv = {
    FAKE_STRIPE_SCENARIO: "progress_reporting_failure",
    FAKE_BLOB_STATE_PATH: statePath,
  };
  const first = runLiveAudit(["--apply"], failingEnv);
  const second = runLiveAudit(["--apply"], failingEnv);
  const later = runLiveAudit(["--apply"], failingEnv);
  const recovered = runLiveAudit([], { FAKE_BLOB_STATE_PATH: statePath });
  const afterRecovery = runLiveAudit(["--apply"], failingEnv);
  const privateDetails =
    /private observer failure|sub_private|price_private|StripeAPIError/;

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(later.status, 0, later.stderr);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(afterRecovery.status, 0, afterRecovery.stderr);
  assert.equal(JSON.parse(first.stdout).updated, 1);
  assert.equal(JSON.parse(second.stdout).progressReportingFailures, 1);
  assert.equal(first.stderr, "");
  assert.equal(
    second.stderr,
    [
      "Operator alert: Stripe audit progress reporting failed in repeated runs. Audit results and completed subscription updates were not affected.",
      "Operator alert delivery was rejected. Stripe audit results and completed subscription updates were not affected.",
      "",
    ].join("\n"),
  );
  assert.equal(later.stderr, "");
  assert.equal(recovered.stderr, "");
  assert.equal(afterRecovery.stderr, "");
  assert.deepEqual(
    JSON.parse(readFileSync(statePath, "utf8")).value,
    { consecutiveFailureRuns: 1, alertDelivery: "not_attempted" },
  );
  assert.doesNotMatch(
    [first, second, later, recovered, afterRecovery]
      .map(result => `${result.stdout}${result.stderr}`)
      .join(""),
    privateDetails,
  );
});

test("shared health storage failures warn without changing audit outcomes", () => {
  const result = runLiveAudit(["--apply"], {
    FAKE_STRIPE_SCENARIO: "progress_reporting_failure",
    SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID: "",
    SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN: "",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).updated, 1);
  assert.equal(JSON.parse(result.stdout).progressReportingFailures, 1);
  assert.equal(
    result.stderr,
    "Operator warning: Stripe audit outage history was not updated in shared storage. Configure SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID and SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN, then retry.\n",
  );
});
