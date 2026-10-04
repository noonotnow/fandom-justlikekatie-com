import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createArchiveActorDiscovery,
  trackArchiveActorDirectoryOutcome,
  type ArchiveInventoryOutcome,
} from '../src/utils/analytics';

test('actor discovery uses only allowlisted public IDs and verifies pages before attribution', () => {
  const events: { name: string; data?: Record<string, string | number | boolean> }[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { umami: { track: (name: string, data?: Record<string, string | number | boolean>) => events.push({ name, data }) } },
  });
  const page = (overrides: Partial<ArchiveInventoryOutcome> = {}): ArchiveInventoryOutcome => ({
    actorId: 'public-actor', phase: 'initial', result: 'verified', editionCount: 1, hasMore: true, ...overrides,
  });
  try {
    const discovery = createArchiveActorDiscovery();
    const unfiltered = discovery.capture();
    discovery.select('private-actor', ['public-actor']);
    discovery.select('someone@example.com', ['someone@example.com']);
    assert.equal(events.length, 0);
    discovery.select('public-actor', ['public-actor']);
    discovery.complete(unfiltered, 'exported');
    assert.equal(discovery.capture(), null);
    discovery.inventory(page({ result: 'failed', failure: 'transport', editionCount: 0 }));
    discovery.complete(discovery.capture(), 'saved');
    discovery.inventory(page({ result: 'verified_empty', editionCount: 0 }));
    assert.equal(discovery.capture(), null);
    discovery.inventory(page({ result: 'partial', editionCount: 0 }));
    assert.equal(discovery.capture(), null);
    discovery.inventory(page({ phase: 'more', result: 'partial' }));
    const first = discovery.capture();
    assert.ok(first);
    discovery.complete(first, 'saved');
    discovery.inventory(page({ phase: 'more', result: 'failed', failure: 'http', editionCount: 0 }));
    discovery.complete(first, 'exported'); // Existing verified cards survive a failed next page.
    discovery.select('public-actor', ['public-actor']);
    discovery.complete(first, 'saved'); // Same actor, new choice: old operation is stale.
    discovery.inventory(page({ actorId: 'other-actor' }));
    assert.equal(discovery.capture(), null);
    discovery.inventory(page());
    discovery.inventory(page({ result: 'verified_empty', editionCount: 0 })); // Initial retry resets proof.
    assert.equal(discovery.capture(), null);
    discovery.select('', []);
    discovery.complete(first, 'saved');
    discovery.complete(discovery.capture(), 'saved');
    assert.deepEqual(events.filter(event => event.name === 'archive_grid_completed'), [
      { name: 'archive_grid_completed', data: { actor_id: 'public-actor', discovery_source: 'published_actor_directory', completion: 'saved' } },
      { name: 'archive_grid_completed', data: { actor_id: 'public-actor', discovery_source: 'published_actor_directory', completion: 'exported' } },
      { name: 'archive_grid_completed', data: { discovery_source: 'unfiltered_archive', completion: 'saved' } },
    ]);
    assert.deepEqual(events.find(event => event.name === 'archive_actor_page_failed')?.data, {
      actor_id: 'public-actor', phase: 'initial', result: 'failed', edition_count: 0, has_more: true, failure: 'transport',
    });
    const allowed = new Set(['actor_id', 'phase', 'result', 'edition_count', 'has_more', 'failure', 'discovery_source', 'completion']);
    for (const event of events) {
      assert.ok(event.name.length < 50);
      assert.ok(Object.keys(event.data ?? {}).every(key => allowed.has(key)));
    }
  } finally { Reflect.deleteProperty(globalThis, 'window'); }
});

test('discovery completions adapt successful grid save/export boundaries, not proposal or handoff preparation', async () => {
  const source = await readFile(new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url), 'utf8');
  const save = source.slice(source.indexOf('async function saveGrid()'), source.indexOf('async function removeGrid()'));
  assert.ok(save.indexOf('await dbSaveGrid(grid);') < save.indexOf("archiveDiscovery.complete(discoveryContext, 'saved')"));
  const exported = source.slice(source.indexOf('async function exportGrid('), source.indexOf('async function shareToDevice()'));
  assert.ok(exported.indexOf('await saveShareCard(') < exported.indexOf("archiveDiscovery.complete(discoveryContext, 'exported')"));
  assert.ok(exported.indexOf("archiveDiscovery.complete(discoveryContext, 'exported')") < exported.indexOf('const preparedProposal = proposal;'));
  assert.match(exported, /sourceKind === 'archive'\) archiveDiscovery\.complete/);
  const shared = source.slice(source.indexOf('async function shareToDevice()'), source.indexOf('const actorDirectory ='));
  assert.ok(shared.indexOf('await navigator.share(shareData);')
    < shared.indexOf("archiveDiscovery.complete(handoffState.discoveryContext, 'exported')"));
  assert.match(exported, /expiresAt: Date\.now\(\) \+ 120_000, discoveryContext/);
});

test('directory diagnostic outcomes and optional broken trackers never break discovery', () => {
  const events: unknown[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      umami: { track() { throw new Error('blocked tracker'); } },
      gtag(_command: string, name: string, data: unknown) { events.push({ name, data }); },
    },
  });
  try {
    trackArchiveActorDirectoryOutcome('verified_empty', 0);
    trackArchiveActorDirectoryOutcome('partial', 2);
    trackArchiveActorDirectoryOutcome('failed', 2, 'unavailable');
    assert.deepEqual(events, [
      { name: 'archive_actor_directory_ready', data: { result: 'verified_empty', actor_count: 0 } },
      { name: 'archive_actor_directory_ready', data: { result: 'partial', actor_count: 2 } },
      { name: 'archive_actor_directory_failed', data: { result: 'failed', actor_count: 2, failure: 'unavailable' } },
    ]);
  } finally { Reflect.deleteProperty(globalThis, 'window'); }
  assert.doesNotThrow(() => {
    const discovery = createArchiveActorDiscovery();
    discovery.select('public-actor', ['public-actor']);
    trackArchiveActorDirectoryOutcome('verified', 1);
  });
});