import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { isValidOperatorEmail } from "./notify-archive-records-failure.js";

const PUBLIC_STATUSES = new Set([
  "publication-incomplete", "release-history-unavailable",
  "publication-history-mismatch", "release-catalog-incomplete",
  "unavailable", "unverified",
]);

export async function notifySitemapInventoryFailure(env = process.env, fetchImpl = fetch) {
  const status = env.PUBLIC_SITEMAP_INVENTORY_STATUS;
  assert.ok(PUBLIC_STATUSES.has(status), "Cannot notify operators without a known failing public sitemap inventory status");
  const configured = env.FANDOM_ADMIN_EMAILS?.trim()
    ? env.FANDOM_ADMIN_EMAILS.split(",").map(email => email.trim())
    : [];
  const recipients = configured.filter(isValidOperatorEmail);
  const required = {
    RESEND_API_KEY: env.RESEND_API_KEY,
    FANDOM_AUTH_FROM_EMAIL: env.FANDOM_AUTH_FROM_EMAIL,
    FANDOM_ADMIN_EMAILS: configured.length === recipients.length && recipients.length ? "configured" : undefined,
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
      subject: `[Fandom Vibes] Public sitemap inventory: ${status}`,
      text: [
        `The scheduled public sitemap inventory check still reports ${status} after three attempts.`,
        "Review the public release-history receipts and publication manifests; reconcile them before restoring dynamic records.",
        "",
        `Review the failed workflow run: ${runUrl}`,
      ].join("\n"),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.ok(response.ok, `Operator notification delivery was rejected with HTTP ${response.status}`);
  console.log(`Operator notification sent for public sitemap inventory status ${status}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await notifySitemapInventoryFailure();
}