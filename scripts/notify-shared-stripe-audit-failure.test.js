import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { notifySharedStripeAuditFailure } from "./notify-shared-stripe-audit-failure.js";

const env = {
  RESEND_API_KEY: "private-api-key",
  FANDOM_AUTH_FROM_EMAIL: "Fandom Vibes <alerts@example.test>",
  FANDOM_ADMIN_EMAILS: "one@example.test, two@example.test",
  SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID: "private-site-id",
  SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN: "private-blob-token",
  GITHUB_REPOSITORY: "owner/fandom-vibes",
  GITHUB_RUN_ID: "123456",
  GITHUB_RUN_ATTEMPT: "2",
  GITHUB_SERVER_URL: "https://github.example.test",
};

test("shared audit failure sends one clear notification identifying the workflow run, not Blob credentials", async () => {
  const requests = [];
  await notifySharedStripeAuditFailure(env, async (input, init) => {
    requests.push({ input, init });
    return new Response(null, { status: 200 });
  });
  assert.equal(requests.length, 1);
  const [{ input, init }] = requests;
  assert.equal(input, "https://api.resend.com/emails");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer private-api-key");
  const message = JSON.parse(init.body);
  assert.deepEqual(message.to, ["one@example.test", "two@example.test"]);
  assert.match(message.subject, /Shared Stripe audit consistency check failed/);
  assert.match(message.text, /Run: 123456 \(attempt 2\)/);
  assert.match(message.text, /https:\/\/github\.example\.test\/owner\/fandom-vibes\/actions\/runs\/123456/);
  assert.doesNotMatch(JSON.stringify(message), /private-site-id|private-blob-token|private-api-key/);
});

test("shared audit failure rejects missing recipients without sending", async () => {
  let calls = 0;
  await assert.rejects(
    notifySharedStripeAuditFailure({ ...env, FANDOM_ADMIN_EMAILS: "" }, async () => {
      calls++;
      return new Response(null, { status: 200 });
    }),
    /FANDOM_ADMIN_EMAILS/,
  );
  assert.equal(calls, 0);
});

test("shared audit failure skips invalid recipients without printing their addresses", async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    let message;
    await notifySharedStripeAuditFailure(
      { ...env, FANDOM_ADMIN_EMAILS: "one@example.test, invalid@@private.test" },
      async (_input, init) => {
        message = JSON.parse(init.body);
        return new Response(null, { status: 200 });
      },
    );
    assert.deepEqual(message.to, ["one@example.test"]);
    assert.match(warnings.join("\n"), /1 invalid recipient entry/);
    assert.doesNotMatch(warnings.join("\n"), /private\.test/);
  } finally {
    console.warn = originalWarn;
  }
});

test("shared audit notification delivery errors do not reveal provider responses or Blob credentials", async () => {
  await assert.rejects(
    notifySharedStripeAuditFailure(env, async () => new Response("private response", { status: 422 })),
    error => {
      assert.match(String(error), /HTTP 422/);
      assert.doesNotMatch(String(error), /private response|private-blob-token/);
      return true;
    },
  );
});

test("only failed scheduled or main-dispatched shared audit jobs attempt the notification", async () => {
  const workflow = await readFile(new URL("../.github/workflows/test.yml", import.meta.url), "utf8");
  const job = workflow.split("  shared-stripe-audit-consistency:\n")[1].split("\n  netlify-package-compatibility:")[0];
  const alert = job.split("      - name: Notify operators about failed shared Stripe audit consistency check\n")[1];
  assert.match(job, /if: github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/);
  assert.match(job, /node --test scripts\/audit-subscription-products\.blob-integration\.test\.js/);
  assert.match(alert, /if: failure\(\) && \(github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\)/);
  for (const secret of ["RESEND_API_KEY", "FANDOM_AUTH_FROM_EMAIL", "FANDOM_ADMIN_EMAILS"]) {
    assert.match(alert, new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`));
  }
  assert.doesNotMatch(alert, /SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_(SITE_ID|TOKEN)/);
  assert.match(alert, /run: node scripts\/notify-shared-stripe-audit-failure\.js/);
  assert.doesNotMatch(workflow.split("  test:\n")[1].split("\n  migration-retry:")[0], /notify-shared-stripe-audit-failure/);
});