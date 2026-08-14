import test from 'node:test';
import assert from 'node:assert/strict';
import { tierEventFor } from '../src/utils/cardMetrics.ts';

// The tier controls are toggles: clicking the already-active tier passes `null`
// to clear it. Recording a clear would let one indecisive session inflate a
// card's Legendary count, so only setting a tier produces an event.

test('setting a tier produces the matching event', () => {
  assert.equal(tierEventFor('legendary'), 'legendary');
  assert.equal(tierEventFor('misprint'), 'misprint');
});

test('clearing a tier produces no event', () => {
  assert.equal(tierEventFor(null), null);
});

test('a toggle cycle records the set but not the clear', () => {
  // Mark legendary, change mind, clear it: one event, not two.
  const recorded = (['legendary', null] as const)
    .map(tierEventFor)
    .filter((event): event is 'legendary' | 'misprint' => event !== null);
  assert.deepEqual(recorded, ['legendary']);
});

test('switching between tiers records each deliberate set', () => {
  const recorded = (['legendary', 'misprint'] as const).map(tierEventFor);
  assert.deepEqual(recorded, ['legendary', 'misprint']);
});
