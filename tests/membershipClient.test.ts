import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canUseCollectorFeatures,
  canUseCreatorOsHandoff,
  createMembershipCheckout,
  createMembershipPortal,
  getMembershipStatus,
  parseMembershipCapabilities,
  refreshMembershipAfterBilling,
} from '../src/utils/membership.ts';

test('membership client exposes only a safe active entitlement', async () => {
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

test('billing portal returns the management URL', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    assert.equal(url, '/api/membership/portal');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'same-origin');
    return new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session_test' }));
  }) as typeof fetch;
  try {
    assert.equal(await createMembershipPortal(), 'https://billing.stripe.com/p/session_test');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('portal return refreshes cached capability state until the webhook is visible', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify(calls < 3
      ? { state: 'inactive', capabilities: [] }
      : { state: 'active', capabilities: ['fandom_collector'] }));
  }) as typeof fetch;
  try {
    const status = await refreshMembershipAfterBilling(4, 0);
    assert.equal(calls, 3);
    assert.equal(status.state, 'active');
    assert.deepEqual(status.capabilities, ['fandom_collector']);
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

test('free sign-in permits Collection sync while Collector gates premium creation', async () => {
  const [collectionSource, membershipSource, syncFunction] = await Promise.all([
    readFile(new URL('../src/components/Collection/Collection.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Membership/Membership.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../netlify/functions/collection-sync.js', import.meta.url), 'utf8'),
  ]);

  assert.match(collectionSource, /shouldSync = canSyncCloud && decided && await shouldSyncCollection/);
  assert.match(collectionSource, /const canSyncCloud = !isMiddleEarth \|\| hasCollectorAccess/);
  assert.match(collectionSource, /syncEnabled \? .*'Cloud sync enabled for'.* : 'Signed in as'/);
  assert.match(collectionSource, /activeType === 'builder' \?/);
  assert.doesNotMatch(collectionSource, /Upgrade to use Grid Builder/);
  assert.doesNotMatch(collectionSource, /Cloud sync is available with Founding Member/);
  assert.match(membershipSource, /Full Collection sync after sign-in/);
  assert.doesNotMatch(membershipSource, /Collection sync with Collector access/);
  assert.match(collectionSource, /if \(canSyncCloud\) schedulePublicCollectionSync/);
  assert.match(
    collectionSource,
    /await persistRemoval\(\s*pending,\s*canSyncCloud \? accountIdRef\.current : undefined,\s*canSyncCloud,\s*\)/,
  );
  assert.doesNotMatch(membershipSource, /Cloud Collection sync across devices/);
  assert.doesNotMatch(syncFunction, /createEntitlementChecker|requireMembership/);
  assert.doesNotMatch(syncFunction, /createCapabilityChecker|fandom_collector/);
});
