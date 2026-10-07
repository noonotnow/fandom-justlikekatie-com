import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createArchiveActorDiscovery,
  trackArchiveImageEditionOpened,
  trackArchiveCardSaveOutcome,
} from '../src/utils/analytics';
import { authorizeArchiveImageSave } from '../src/utils/archiveImageSave';

test('card authorization reports bounded outcomes and retries without copying request identities', async () => {
  const originalFetch = globalThis.fetch;
  const events: { name: string; data: Record<string, unknown> }[] = [];
  const date = '2026-08-22';
  const imageId = 'https://private.example.test/image?identity=never-collect';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { gtag(_command: string, name: string, data: Record<string, unknown>) { events.push({ name, data }); } },
  });
  try {
    const cases = [
      { response: Response.json({ allowed: true, date, imageId }), outcome: 'allowed' },
      { response: Response.json({ access: 'sign_in' }, { status: 401 }), outcome: 'sign_in' },
      { response: Response.json({ access: 'upgrade' }, { status: 403 }), outcome: 'upgrade' },
      { response: Response.json({ access: 'billing_delay' }, { status: 503 }), outcome: 'retry', category: 'billing_delay' },
      { response: Response.json({ error: imageId }, { status: 503 }), outcome: 'retry', category: 'http' },
      { response: Response.json({ allowed: true, date, imageId: 'mismatched' }), outcome: 'retry', category: 'invalid_response' },
      { response: new Response('<html>Not JSON</html>'), outcome: 'retry', category: 'invalid_response' },
      { response: null, outcome: 'retry', category: 'transport' },
    ];
    for (const fixture of cases) {
      globalThis.fetch = (async () => {
        if (!fixture.response) throw new TypeError(imageId);
        return fixture.response;
      }) as typeof fetch;
      if (fixture.outcome === 'allowed') await authorizeArchiveImageSave(date, imageId);
      else await assert.rejects(authorizeArchiveImageSave(date, imageId));
      assert.deepEqual(events.at(-1), {
        name: 'archive_card_authorization',
        data: { outcome: fixture.outcome, edition_date: date, ...(fixture.category ? { retry_category: fixture.category } : {}) },
      });
    }
    await assert.rejects(authorizeArchiveImageSave('private-date-value', imageId));
    assert.deepEqual(events.at(-1)?.data, { outcome: 'retry', retry_category: 'precondition' });
    assert.equal(events.some(event => event.name === 'archive_card_save_outcome'), false);
    trackArchiveCardSaveOutcome('persistence_failed', date);
    assert.deepEqual(events.at(-1)?.data, { outcome: 'persistence_failed', edition_date: date });
    assert.equal(JSON.stringify(events).includes(imageId), false);
    assert.equal(JSON.stringify(events).includes('private-date-value'), false);
  } finally {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('dated discovery requires verified inventory and rejects pre-retry completion contexts', () => {
  const events: { name: string; data: Record<string, unknown> }[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { dataLayer: { push(event: Record<string, unknown>) {
      const { event: name, ...data } = event;
      events.push({ name: String(name), data });
    } } },
  });
  try {
    const discovery = createArchiveActorDiscovery();
    discovery.selectEdition();
    assert.equal(discovery.capture(), null);
    discovery.inventory({ actorId: '', phase: 'initial', result: 'verified', editionCount: 1, hasMore: false });
    const prior = discovery.capture();
    discovery.complete(prior, 'saved');
    discovery.inventory({ actorId: '', phase: 'initial', retry: true, result: 'failed', failure: 'http', editionCount: 0, hasMore: false });
    discovery.complete(prior, 'exported');
    assert.equal(discovery.capture(), null);
    discovery.inventory({ actorId: '', phase: 'initial', retry: true, result: 'verified', editionCount: 1, hasMore: false });
    discovery.complete(prior, 'exported');
    discovery.complete(discovery.capture(), 'exported');
    trackArchiveImageEditionOpened('edition', 'slot');
    assert.deepEqual(events.filter(event => event.name === 'archive_grid_completed').map(event => event.data), [
      { discovery_source: 'edition_record', completion: 'saved' },
      { discovery_source: 'edition_record', completion: 'exported' },
    ]);
    assert.deepEqual(events.at(-1), { name: 'archive_image_edition_opened', data: { source: 'edition', placement: 'slot' } });
  } finally { Reflect.deleteProperty(globalThis, 'window'); }
});
