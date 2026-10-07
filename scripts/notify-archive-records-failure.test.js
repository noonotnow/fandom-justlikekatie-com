import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { notifyArchiveRecordsFailure, notifyArchiveThumbnailFailure } from "./notify-archive-records-failure.js";

const env = {
  RESEND_API_KEY: "private-api-key",
  FANDOM_AUTH_FROM_EMAIL: "Fandom Vibes <alerts@example.test>",
  FANDOM_ADMIN_EMAILS: "one@example.test, two@example.test",
  GITHUB_REPOSITORY: "owner/fandom-vibes",
  GITHUB_RUN_ID: "123456",
  GITHUB_RUN_ATTEMPT: "2",
  GITHUB_SERVER_URL: "https://github.example.test",
};

const thumbnailUrl = `https://images.xhs.justlikekatie.com/images/sha256/${"a".repeat(64)}.jpg`;
const thumbnailEnv = {
  ...env, ARCHIVE_THUMBNAIL_AUDIT_STATUS: "failure", ARCHIVE_THUMBNAIL_URL: thumbnailUrl,
};

test("thumbnail integrity alert is distinct from release alerts and includes the affected URL and run", async () => {
  await notifyArchiveThumbnailFailure(thumbnailEnv, async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    const message = JSON.parse(init.body);
    assert.match(message.subject, /Weekly Archive thumbnail integrity failed/);
    assert.ok(message.text.includes(thumbnailUrl));
    assert.match(message.text, /actions\/runs\/123456/);
    assert.match(message.text, /attempt 2/);
    assert.doesNotMatch(JSON.stringify(message), /private-api-key/);
    return new Response(null, { status: 200 });
  });
});

test("successful audits and recovery do not require mail configuration or send email", async () => {
  await notifyArchiveThumbnailFailure({ ARCHIVE_THUMBNAIL_AUDIT_STATUS: "success" }, async () => {
    assert.fail("success must not send mail");
  });
});

test("missing alert configuration is visible and does not attempt delivery", async () => {
  for (const key of [
    "RESEND_API_KEY", "FANDOM_AUTH_FROM_EMAIL", "FANDOM_ADMIN_EMAILS",
    "GITHUB_REPOSITORY", "GITHUB_RUN_ID", "GITHUB_SERVER_URL",
  ]) {
    await assert.rejects(notifyArchiveThumbnailFailure({ ...thumbnailEnv, [key]: "" }, async () => {
      assert.fail("missing configuration must not send mail");
    }), new RegExp(key));
  }
});

test("thumbnail alerts reject unsafe URLs and unknown audit status before delivery", async () => {
  for (const url of [
    "https://private.example/images/sha256/a.jpg",
    `${thumbnailUrl}?token=private`, `${thumbnailUrl}#private`, `${thumbnailUrl}\nstatus=success`,
  ]) {
    await assert.rejects(notifyArchiveThumbnailFailure({ ...thumbnailEnv, ARCHIVE_THUMBNAIL_URL: url }, async () => {
      assert.fail("unsafe URL must not send mail");
    }), /non-public thumbnail URL/);
  }
  await assert.rejects(notifyArchiveThumbnailFailure(env), /failed thumbnail integrity audit/);
});

test("prerequisite failures do not invent URLs and provider rejection stays visible", async () => {
  await notifyArchiveThumbnailFailure({ ...thumbnailEnv, ARCHIVE_THUMBNAIL_URL: "" }, async (_, init) => {
    assert.match(JSON.parse(init.body).text, /No affected thumbnail was identified/);
    return new Response(null, { status: 200 });
  });
  await assert.rejects(notifyArchiveThumbnailFailure(thumbnailEnv, async () =>
    new Response("private provider response", { status: 503 })), error => {
    assert.match(error.message, /HTTP 503/);
    assert.doesNotMatch(error.message, /private provider response/);
    return true;
  });
});

test("weekly audit has a main-only failure notification separate from release-time checks", async () => {
  const workflow = await readFile(new URL("../.github/workflows/test.yml", import.meta.url), "utf8");
  const job = workflow.split("  weekly-archive-thumbnail-integrity:\n")[1].split("\n  test:")[0];
  assert.match(job, /github\.event_name == 'schedule'/);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /id: thumbnail_audit\n\s+run: npm run audit:archive-thumbnails/);
  const alert = job.split("      - name: Notify operators about failed weekly Archive thumbnail integrity\n")[1];
  assert.match(alert, /if: failure\(\) && steps\.thumbnail_audit\.outcome == 'failure'/);
  assert.match(alert, /ARCHIVE_THUMBNAIL_AUDIT_STATUS: failure/);
  assert.match(alert, /ARCHIVE_THUMBNAIL_URL: \$\{\{ steps\.thumbnail_audit\.outputs\.thumbnail_url \}\}/);
  for (const secret of ["RESEND_API_KEY", "FANDOM_AUTH_FROM_EMAIL", "FANDOM_ADMIN_EMAILS"]) {
    assert.match(alert, new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`));
  }
  assert.match(alert, /run: node scripts\/notify-archive-records-failure\.js --thumbnail-integrity/);
  assert.doesNotMatch(job.split("      - name: Notify operators")[0], /RESEND_API_KEY/);
});

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