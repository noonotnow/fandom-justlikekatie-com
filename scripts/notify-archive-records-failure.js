import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { isPublishedThumbnailUrl } from "./check-archive-records.js";

export function isValidOperatorEmail(email) {
  if (email.length > 254) return false;
  const match = /^([a-z0-9!#$%&'*+/=?^_`{|}~.-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i.exec(email);
  if (!match) return false;
  const [, local, domain] = match;
  return local.length <= 64 && !local.startsWith(".") && !local.endsWith(".")
    && !local.includes("..") && domain.split(".").every(label =>
      label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"));
}

export async function notifyArchiveRecordsFailure(env = process.env, fetchImpl = fetch) {
  return sendArchiveOperatorAlert(env, fetchImpl, {
    subject: "[Fandom Vibes] Production Archive record verification failed",
    lines: ["The post-release Archive record check failed after bounded retries. Review the workflow run for the public route failures."],
  });
}

export async function notifyArchiveThumbnailFailure(env = process.env, fetchImpl = fetch) {
  if (env.ARCHIVE_THUMBNAIL_AUDIT_STATUS === "success") return;
  assert.equal(env.ARCHIVE_THUMBNAIL_AUDIT_STATUS, "failure",
    "Cannot notify operators without a failed thumbnail integrity audit");
  const url = env.ARCHIVE_THUMBNAIL_URL;
  assert.ok(!url || isPublishedThumbnailUrl(url), "Cannot notify operators with a non-public thumbnail URL");
  return sendArchiveOperatorAlert(env, fetchImpl, {
    subject: "[Fandom Vibes] Weekly Archive thumbnail integrity failed",
    lines: [
      "The weekly full-byte integrity audit of published Archive thumbnails failed.",
      url ? `Affected published thumbnail: ${url}` : "No affected thumbnail was identified; the audit failed before image verification.",
      "Review the failed audit before repairing or replacing the published asset. This is not a release-time Archive link alert.",
    ],
  });
}

async function sendArchiveOperatorAlert(env, fetchImpl, { subject, lines }) {
  const configured = env.FANDOM_ADMIN_EMAILS?.trim()
    ? env.FANDOM_ADMIN_EMAILS.split(",").map(email => email.trim())
    : [];
  const recipients = configured.filter(isValidOperatorEmail);
  if (configured.length !== recipients.length) {
    console.warn(`FANDOM_ADMIN_EMAILS has ${configured.length - recipients.length} invalid recipient entries; skipped.`);
  }
  const required = {
    RESEND_API_KEY: env.RESEND_API_KEY,
    FANDOM_AUTH_FROM_EMAIL: env.FANDOM_AUTH_FROM_EMAIL,
    FANDOM_ADMIN_EMAILS: recipients.length ? "configured" : undefined,
    GITHUB_REPOSITORY: env.GITHUB_REPOSITORY,
    GITHUB_RUN_ID: env.GITHUB_RUN_ID,
    GITHUB_SERVER_URL: env.GITHUB_SERVER_URL,
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  assert.deepEqual(missing, [], `Cannot notify operators because required configuration is missing: ${missing.join(", ")}`);

  const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FANDOM_AUTH_FROM_EMAIL,
      to: recipients,
       subject,
      text: [
         ...lines,
        "",
        `Repository: ${env.GITHUB_REPOSITORY}`,
        `Run: ${env.GITHUB_RUN_ID} (attempt ${env.GITHUB_RUN_ATTEMPT ?? "1"})`,
        `Review the failed workflow run: ${runUrl}`,
      ].join("\n"),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.ok(response.ok, `Operator notification delivery was rejected with HTTP ${response.status}`);
  console.log(`Operator notification sent for Archive check run ${env.GITHUB_RUN_ID}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await (process.argv.includes("--thumbnail-integrity")
    ? notifyArchiveThumbnailFailure()
    : notifyArchiveRecordsFailure());
}