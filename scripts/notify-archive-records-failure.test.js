import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { notifyArchiveRecordsFailure } from "./notify-archive-records-failure.js";

const env = {
  RESEND_API_KEY: "private-api-key",
  FANDOM_AUTH_FROM_EMAIL: "Fandom Vibes <alerts@example.test>",
  FANDOM_ADMIN_EMAILS: "one@example.test, two@example.test",
  GITHUB_REPOSITORY: "owner/fandom-vibes",
  GITHUB_RUN_ID: "123456",
  GITHUB_RUN_ATTEMPT: "2",
  GITHUB_SERVER_URL: "https://github.example.test",
};

test("Archive failure notification contains only workflow context, not secrets or record data", async () => {
  let request;
  await notifyArchiveRecordsFailure(env, async (url, init) => {
    request = { url, init };
    return new Response(null, { status: 200 });
  });
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.init.headers.Authorization, "Bearer private-api-key");
  const message = JSON.parse(request.init.body);
  assert.deepEqual(message.to, ["one@example.test", "two@example.test"]);
  assert.match(message.text, /actions\/runs\/123456/);
  assert.doesNotMatch(JSON.stringify(message), /private-api-key|archive=1|publicRecord/);
});

test("Archive failure notification fails safely without a recipient or on provider failure", async () => {
  await assert.rejects(notifyArchiveRecordsFailure({ ...env, FANDOM_ADMIN_EMAILS: "" }, async () => {
    throw new Error("should not send");
  }), /FANDOM_ADMIN_EMAILS/);
  await assert.rejects(
    notifyArchiveRecordsFailure(env, async () => new Response("private response", { status: 422 })),
    error => {
      assert.match(String(error), /HTTP 422/);
      assert.doesNotMatch(String(error), /private response/);
      return true;
    },
  );
});

test("production success triggers the Archive check with bounded retries and failure-only alert", async () => {
  const workflow = await readFile(new URL("../.github/workflows/test.yml", import.meta.url), "utf8");
  const job = workflow.split("  production-archive-records:\n")[1].split("\n  test:")[0];
  assert.match(job, /github\.event_name == 'deployment_status'/);
  assert.match(job, /github\.event\.deployment_status\.state == 'success'/);
  assert.match(job, /github\.event\.deployment\.environment == 'production'/);
  assert.match(job, /for attempt in 1 2 3; do[\s\S]*npm run check:archive-records; then[\s\S]*sleep 20[\s\S]*exit 1/);
  const alert = job.split("      - name: Notify operators about failed Archive record verification\n")[1];
  assert.match(alert, /if: failure\(\)/);
  for (const secret of ["RESEND_API_KEY", "FANDOM_AUTH_FROM_EMAIL", "FANDOM_ADMIN_EMAILS"]) {
    assert.match(alert, new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`));
  }
  assert.match(alert, /run: node scripts\/notify-archive-records-failure\.js/);
  assert.doesNotMatch(job.split("      - name: Check every Archive")[0], /RESEND_API_KEY/);
});