import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkLaunchpadAlertConfiguration,
  notifyLaunchpadPreviewFailure,
} from '../scripts/check-launchpad-preview.js';

const notificationEnv = {
  RESEND_API_KEY: 'resend-secret',
  RESEND_DOMAIN_READ_API_KEY: 'domain-read-secret',
  FANDOM_AUTH_FROM_EMAIL: 'Fandom Vibes <alerts@example.test>',
  FANDOM_ADMIN_EMAILS: 'one@example.test, two@example.test',
  GITHUB_REPOSITORY: 'owner/fandom-vibes',
  GITHUB_RUN_ID: '123456',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_SERVER_URL: 'https://github.example.test',
  GITHUB_WORKFLOW: 'Tests',
  GITHUB_EVENT_NAME: 'deployment_status',
};

test('no-email readiness checks the verified sending domain using only the separate verification key', async () => {
  let request: { input: string | URL | Request; init?: RequestInit } | undefined;
  await checkLaunchpadAlertConfiguration(notificationEnv, async (input, init) => {
    request = { input, init };
    return Response.json({
      data: [{ name: 'example.test', status: 'verified', capabilities: { sending: 'enabled' } }],
      has_more: false,
    });
  });
  assert.equal(request?.input, 'https://api.resend.com/domains');
  assert.equal(request?.init?.method, undefined);
  assert.equal(
    (request?.init?.headers as Record<string, string>).Authorization,
    'Bearer domain-read-secret',
  );
});

test('no-email readiness fails closed without a distinct verification key', async () => {
  for (const key of ['', notificationEnv.RESEND_API_KEY]) {
    let called = false;
    await assert.rejects(
      checkLaunchpadAlertConfiguration(
        { ...notificationEnv, RESEND_DOMAIN_READ_API_KEY: key },
        async () => { called = true; return Response.json({ data: [], has_more: false }); },
      ),
      error => {
        assert.doesNotMatch(String(error), /resend-secret|example\.test/);
        return true;
      },
    );
    assert.equal(called, false);
  }
});

test('no-email readiness rejects unverified domains and redacts provider responses', async () => {
  await assert.rejects(
    checkLaunchpadAlertConfiguration(notificationEnv, async () => Response.json({
      data: [{ name: 'example.test', status: 'pending', capabilities: { sending: 'enabled' } }],
      has_more: false,
    })),
    /not verified and enabled/,
  );
  await assert.rejects(
    checkLaunchpadAlertConfiguration(notificationEnv, async () =>
      new Response('private provider response', { status: 401 })),
    error => {
      assert.match(String(error), /HTTP 401/);
      assert.doesNotMatch(String(error), /private provider response|example\.test|domain-read-secret|resend-secret/);
      return true;
    },
  );
});
test('failed launchpad preview notification includes the run link without exposing the API key', async () => {
  let request: { input: string | URL | Request; init?: RequestInit } | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    request = { input, init };
    return new Response(null, { status: 200 });
  };

  await notifyLaunchpadPreviewFailure(notificationEnv, fetchImpl);

  assert.ok(request);
  assert.equal(request.input, 'https://api.resend.com/emails');
  assert.equal(request.init?.method, 'POST');
  assert.equal(
    (request.init?.headers as Record<string, string>).Authorization,
    'Bearer resend-secret',
  );
  const message = JSON.parse(String(request.init?.body));
  assert.deepEqual(message.to, ['one@example.test', 'two@example.test']);
  assert.match(message.subject, /Production launchpad preview check failed/);
  assert.match(message.text, /Run: 123456 \(attempt 2\)/);
  assert.match(
    message.text,
    /https:\/\/github\.example\.test\/owner\/fandom-vibes\/actions\/runs\/123456/,
  );
  assert.doesNotMatch(JSON.stringify(message), /resend-secret/);
});

test('notification fails explicitly when operator delivery is not configured', async () => {
  await assert.rejects(
    notifyLaunchpadPreviewFailure(
      { ...notificationEnv, FANDOM_ADMIN_EMAILS: '' },
      async () => new Response(null, { status: 200 }),
    ),
    /FANDOM_ADMIN_EMAILS/,
  );
});

test('invalid operator entries are skipped without exposing addresses in logs', async () => {
  const requests: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  try {
    await notifyLaunchpadPreviewFailure(
      {
        ...notificationEnv,
        FANDOM_ADMIN_EMAILS: 'one@example.test, broken@@private.test, two@example.test, no-domain@private,',
      },
      async (input, init) => {
        requests.push({ input, init });
        return new Response(null, { status: 200 });
      },
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)).to, [
    'one@example.test',
    'two@example.test',
  ]);
  assert.match(warnings.join('\n'), /FANDOM_ADMIN_EMAILS.*3 invalid recipient entries/);
  assert.doesNotMatch(warnings.join('\n'), /private|example\.test|resend-secret/);
});

test('notification fails without a delivery attempt when all operator entries are invalid', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  let called = false;
  try {
    await assert.rejects(
      notifyLaunchpadPreviewFailure(
        { ...notificationEnv, FANDOM_ADMIN_EMAILS: 'bad@@private.test, no-domain@private' },
        async () => {
          called = true;
          return new Response(null, { status: 200 });
        },
      ),
      error => {
        assert.match(String(error), /FANDOM_ADMIN_EMAILS/);
        assert.doesNotMatch(String(error), /private|resend-secret/);
        return true;
      },
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(called, false);
});

test('notification rejection reports status without exposing provider details', async () => {
  await assert.rejects(
    notifyLaunchpadPreviewFailure(
      notificationEnv,
      async () => new Response('private provider response', { status: 422 }),
    ),
    error => {
      assert.match(String(error), /HTTP 422/);
      assert.doesNotMatch(String(error), /private provider response|resend-secret/);
      return true;
    },
  );
});
