import test from 'node:test';
import assert from 'node:assert/strict';
import { createMembershipCheckout, getMembershipStatus } from '../src/utils/membership.ts';

test('membership client exposes only a safe active entitlement', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    assert.equal(url, '/api/membership/status');
    return new Response(JSON.stringify({ state: 'active', renewsAt: '2026-04-01T00:00:00.000Z', card: 'never exposed' }));
  }) as typeof fetch;
  try {
    assert.deepEqual(await getMembershipStatus(), {
      state: 'active',
      isMember: true,
      renewsAt: '2026-04-01T00:00:00.000Z',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('membership checkout uses the authenticated checkout endpoint', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    assert.equal(url, '/api/membership/checkout');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'same-origin');
    return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay_test' }));
  }) as typeof fetch;
  try {
    assert.equal(await createMembershipCheckout(), 'https://checkout.stripe.com/c/pay_test');
  } finally {
    globalThis.fetch = originalFetch;
  }
});