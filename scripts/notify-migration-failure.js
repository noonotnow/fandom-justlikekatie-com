import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

function isValidOperatorEmail(email) {
  if (email.length > 254) return false;
  const match = /^([a-z0-9!#$%&'*+/=?^_`{|}~.-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i.exec(email);
  if (!match) return false;
  const [, local, domain] = match;
  return local.length <= 64
    && !local.startsWith(".")
    && !local.endsWith(".")
    && !local.includes("..")
    && domain.split(".").every(label =>
      label.length <= 63 && !label.startsWith("-") && !label.endsWith("-")
    );
}

export async function notifyMigrationFailure(env = process.env, fetchImpl = fetch) {
  const configuredRecipients = (env.FANDOM_ADMIN_EMAILS ?? "")
    .split(",").map(email => email.trim());
  const recipients = configuredRecipients.filter(isValidOperatorEmail);
  const invalidCount = configuredRecipients.length - recipients.length;
  if (invalidCount > 0 && env.FANDOM_ADMIN_EMAILS?.trim()) {
    console.warn(`FANDOM_ADMIN_EMAILS has ${invalidCount} invalid recipient ${invalidCount === 1 ? "entry" : "entries"}; skipped.`);
  }

  const required = {
    RESEND_API_KEY: env.RESEND_API_KEY,
    FANDOM_AUTH_FROM_EMAIL: env.FANDOM_AUTH_FROM_EMAIL,
    FANDOM_ADMIN_EMAILS: recipients.length > 0 ? "configured" : undefined,
    POSTGRES_CANDIDATE: env.POSTGRES_CANDIDATE,
    GITHUB_REPOSITORY: env.GITHUB_REPOSITORY,
    GITHUB_RUN_ID: env.GITHUB_RUN_ID,
    GITHUB_SERVER_URL: env.GITHUB_SERVER_URL,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  assert.deepEqual(missing, [], `Cannot notify operators because required configuration is missing: ${missing.join(", ")}`);
  assert.match(env.POSTGRES_CANDIDATE, /^\d+$/, "PostgreSQL candidate must be a major version");

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
      subject: `[Fandom Vibes] PostgreSQL ${env.POSTGRES_CANDIDATE} candidate migration check failed`,
      text: [
        `The PostgreSQL ${env.POSTGRES_CANDIDATE} candidate migration check failed.`,
        "Review the failure before promoting this version to supported migrations.",
        "",
        `Repository: ${env.GITHUB_REPOSITORY}`,
        `Run: ${env.GITHUB_RUN_ID} (attempt ${env.GITHUB_RUN_ATTEMPT ?? "1"})`,
        `Review the failed workflow run: ${runUrl}`,
      ].join("\n"),
    }),
  });
  assert.ok(response.ok, `Operator notification delivery was rejected with HTTP ${response.status}`);
  console.log(`Operator notification sent for PostgreSQL ${env.POSTGRES_CANDIDATE} candidate run ${env.GITHUB_RUN_ID}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await notifyMigrationFailure();
}