import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canUseCollectorFeatures,
  canUseCreatorOsHandoff,
  createMembershipCheckout,
  getMembershipStatus,
  parseMembershipCapabilities,
} from '../src/utils/membership.ts';

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

test('explicit capability matrix never derives paid access from billing state', () => {
  const matrix = [
    { capabilities: [], collector: false, handoff: false },
    { capabilities: ['fandom_collector'], collector: true, handoff: false },
    { capabilities: ['creator_os'], collector: false, handoff: true },
    { capabilities: ['fandom_creator_bridge'], collector: false, handoff: true },
    { capabilities: ['ecosystem_bundle'], collector: true, handoff: true },
  ] as const;

  for (const row of matrix) {
    const capabilities = parseMembershipCapabilities(row.capabilities);
    assert.equal(canUseCollectorFeatures({ capabilities }), row.collector);
    assert.equal(canUseCreatorOsHandoff({ capabilities }), row.handoff);
  }

  assert.deepEqual(parseMembershipCapabilities(['creator_os', 'unknown', null]), ['creator_os']);
  assert.equal(canUseCollectorFeatures({ capabilities: ['creator_os'] }), false);
  assert.equal(canUseCreatorOsHandoff({ capabilities: ['fandom_collector'] }), false);
});

test('Collector capability gates cloud sync and premium creation', async () => {
  const [collectionSource, membershipSource, syncFunction] = await Promise.all([
    readFile(new URL('../src/components/Collection/Collection.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Membership/Membership.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../netlify/functions/collection-sync.js', import.meta.url), 'utf8'),
  ]);

  assert.match(collectionSource, /shouldSync = canSyncCloud && decided && await shouldSyncCollection/);
  assert.match(collectionSource, /activeType === 'builder' && !hasCollectorAccess/);
  assert.doesNotMatch(collectionSource, /Cloud sync is available with Founding Member/);
  assert.match(membershipSource, /Collection sync with Collector access/);
  assert.match(collectionSource, /if \(canSyncCloud\) schedulePublicCollectionSync/);
  assert.match(collectionSource, /if \(canSyncCloud\) await persistRemoval/);
  assert.doesNotMatch(membershipSource, /Cloud Collection sync across devices/);
  assert.doesNotMatch(syncFunction, /createEntitlementChecker|requireMembership/);
});