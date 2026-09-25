import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { injectLaunchpadCanonical } from '../vite.config.js';

const RESEND_URL = 'https://api.resend.com/emails';

const RESEND_DOMAINS_URL = 'https://api.resend.com/domains';
export function launchpadOgImageUrl(html: string) {
  const transformedHtml = injectLaunchpadCanonical(html);
  const match = transformedHtml.match(
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']\s*\/?>/i,
  );
  assert.ok(match, 'Launchpad metadata must emit an Open Graph image URL');
  return match[1];
}

export async function checkLaunchpadPreview(
  fetchImpl: typeof fetch = fetch,
  html?: string,
) {
  const sourceHtml = html ?? await readFile(
    new URL('../index.html', import.meta.url),
    'utf8',
  );
  const imageUrl = launchpadOgImageUrl(sourceHtml);
  const response = await fetchImpl(imageUrl, { redirect: 'manual' });

  assert.equal(
    response.status,
    200,
    `Launchpad Open Graph image ${imageUrl} returned HTTP ${response.status}`,
  );
  assert.match(
    response.headers.get('content-type') ?? '',
    /^image\/jpeg(?:\s*;|$)/i,
    `Launchpad Open Graph image ${imageUrl} did not return image/jpeg`,
  );
  return imageUrl;
}

type NotificationEnvironment = Record<string, string | undefined>;

export async function checkLaunchpadAlertConfiguration(
  env: NotificationEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  const missing = ['RESEND_API_KEY', 'RESEND_DOMAIN_READ_API_KEY', 'FANDOM_AUTH_FROM_EMAIL', 'FANDOM_ADMIN_EMAILS']
    .filter(name => !env[name]?.trim());
  assert.equal(
    missing.length,
    0,
    `Operator alert configuration is missing: ${missing.join(', ')}`,
  );
  assert.notEqual(
    env.RESEND_API_KEY!.trim(),
    env.RESEND_DOMAIN_READ_API_KEY!.trim(),
    'Operator alert domain verification must use a separate key from the send-only delivery key.',
  );

  const sender = env.FANDOM_AUTH_FROM_EMAIL!.trim();
  const senderAddress = sender.includes('<')
    ? sender.match(/<([^<>]+)>$/)?.[1]
    : sender;
  const emailPattern = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;
  assert.ok(
    senderAddress && emailPattern.test(senderAddress),
    'Operator alert sender address is invalid (FANDOM_AUTH_FROM_EMAIL).',
  );
  const recipients = env.FANDOM_ADMIN_EMAILS!.split(',').map(email => email.trim());
  assert.ok(
    recipients.every(email => emailPattern.test(email)),
    'Operator alert recipient configuration is invalid (FANDOM_ADMIN_EMAILS).',
  );

  let response: Response;
  try {
    response = await fetchImpl(RESEND_DOMAINS_URL, {
      headers: { Authorization: `Bearer ${env.RESEND_DOMAIN_READ_API_KEY}` },
    });
  } catch {
    throw new Error('Operator alert configuration could not reach Resend to verify delivery.');
  }
  assert.ok(
    response.ok,
    `Operator alert configuration could not verify Resend domains (HTTP ${response.status}). Check the separate domain-read key; Resend requires full access for domain reads.`,
  );

  let domains: unknown;
  try {
    domains = await response.json();
  } catch {
    throw new Error('Operator alert configuration received an invalid Resend domains response.');
  }
  assert.ok(
    domains && typeof domains === 'object' && 'data' in domains &&
      Array.isArray(domains.data) && domains.has_more === false,
    'Operator alert configuration received an incomplete Resend domains response.',
  );
  const senderDomain = senderAddress.split('@')[1].toLowerCase();
  assert.ok(
    domains.data.some((domain: unknown) =>
      domain && typeof domain === 'object' && 'name' in domain &&
      typeof domain.name === 'string' &&
      domain.name.toLowerCase() === senderDomain &&
      'status' in domain && domain.status === 'verified' &&
      'capabilities' in domain && domain.capabilities &&
      typeof domain.capabilities === 'object' &&
      'sending' in domain.capabilities && domain.capabilities.sending === 'enabled'
    ),
    'Operator alert sender domain is not verified and enabled for sending in Resend.',
  );
  console.log('Operator alert configuration and sender domain are valid in the verification account; no email sent.');
}

function isValidOperatorEmail(email: string) {
  if (email.length > 254) return false;
  const match = /^([a-z0-9!#$%&'*+/=?^_`{|}~.-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i.exec(email);
  if (!match) return false;
  const [, local, domain] = match;
  return local.length <= 64
    && !local.startsWith('.')
    && !local.endsWith('.')
    && !local.includes('..')
    && domain.split('.').every(label =>
      label.length <= 63 && !label.startsWith('-') && !label.endsWith('-')
    );
}

export async function notifyLaunchpadPreviewFailure(
  env: NotificationEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  const configuredEmails = String(env.FANDOM_ADMIN_EMAILS ?? '').trim();
  const configuredRecipients = configuredEmails
    ? configuredEmails.split(',').map(email => email.trim())
    : [];
  const recipients = configuredRecipients.filter(isValidOperatorEmail);
  const invalidCount = configuredRecipients.length - recipients.length;
  if (invalidCount > 0) {
    console.warn(`FANDOM_ADMIN_EMAILS has ${invalidCount} invalid recipient ${invalidCount === 1 ? 'entry' : 'entries'}; skipped.`);
  }
  const required = {
    RESEND_API_KEY: env.RESEND_API_KEY,
    FANDOM_AUTH_FROM_EMAIL: env.FANDOM_AUTH_FROM_EMAIL,
    FANDOM_ADMIN_EMAILS: recipients.length > 0 ? 'configured' : undefined,
    GITHUB_REPOSITORY: env.GITHUB_REPOSITORY,
    GITHUB_RUN_ID: env.GITHUB_RUN_ID,
    GITHUB_SERVER_URL: env.GITHUB_SERVER_URL,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  assert.deepEqual(
    missing,
    [],
    `Cannot notify operators because required configuration is missing: ${missing.join(', ')}`,
  );

  const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  const workflow = env.GITHUB_WORKFLOW ?? 'Tests';
  const runAttempt = env.GITHUB_RUN_ATTEMPT ?? '1';
  const eventName = env.GITHUB_EVENT_NAME ?? 'unknown';
  const response = await fetchImpl(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FANDOM_AUTH_FROM_EMAIL,
      to: recipients,
      subject: `[Fandom Vibes] Production launchpad preview check failed`,
      text: [
        'The production launchpad social preview smoke check failed.',
        '',
        `Workflow: ${workflow}`,
        `Repository: ${env.GITHUB_REPOSITORY}`,
        `Run: ${env.GITHUB_RUN_ID} (attempt ${runAttempt})`,
        `Event: ${eventName}`,
        `Review the failed workflow run: ${runUrl}`,
      ].join('\n'),
    }),
  });

  assert.ok(
    response.ok,
    `Operator notification delivery was rejected with HTTP ${response.status}`,
  );
  console.log(`Operator notification sent for workflow run ${env.GITHUB_RUN_ID}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check-alert-configuration')) {
    await checkLaunchpadAlertConfiguration();
  } else if (process.argv.includes('--notify-failure')) {
    await notifyLaunchpadPreviewFailure();
  } else {
    const imageUrl = await checkLaunchpadPreview();
    console.log(`Launchpad Open Graph image is reachable: ${imageUrl}`);
  }
}
