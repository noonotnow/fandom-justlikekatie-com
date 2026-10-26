import assert from 'node:assert/strict';
import { test } from 'node:test';

type Gate = NonNullable<Window['__audienceGate']>;

function installWindow(state: 'pending' | 'public' | 'operator' | 'unknown' | 'absent') {
  const sent: string[] = [];
  const buffered: Array<() => void> = [];
  const windowStub: Record<string, unknown> = {
    umami: { track: (name: string) => sent.push(`umami:${name}`) },
    gtag: (_command: string, name: string) => sent.push(`gtag:${name}`),
  };
  if (state !== 'absent') {
    const gate: Gate = {
      state: () => state,
      run: fn => { if (state === 'public') fn(); else if (state === 'pending') buffered.push(fn); },
      classify: () => undefined,
      unknown: () => undefined,
      refresh: () => undefined,
    };
    windowStub.__audienceGate = gate;
  }
  (globalThis as unknown as { window: unknown }).window = windowStub;
  return { sent, buffered };
}

const { trackEvent } = await import('../src/utils/analytics.ts');

test('public visitors send each event once to each configured destination (positive control)', () => {
  const { sent } = installWindow('public');
  trackEvent('card_saved', { a: 1 });
  assert.deepEqual(sent, ['umami:card_saved', 'gtag:card_saved']);
});

test('operators and unknown sessions send nothing to Umami or Google', () => {
  for (const state of ['operator', 'unknown'] as const) {
    const { sent, buffered } = installWindow(state);
    trackEvent('card_saved');
    assert.deepEqual(sent, []);
    assert.equal(buffered.length, 0);
  }
});

test('events during classification are held, then sent exactly once when the visitor is public', () => {
  const { sent, buffered } = installWindow('pending');
  trackEvent('card_saved');
  assert.deepEqual(sent, []);
  assert.equal(buffered.length, 1);
  buffered[0]();
  assert.deepEqual(sent, ['umami:card_saved', 'gtag:card_saved']);
});

test('without the gate (tests, non-page contexts) events behave as before', () => {
  const { sent } = installWindow('absent');
  trackEvent('card_saved');
  assert.deepEqual(sent, ['umami:card_saved', 'gtag:card_saved']);
});
