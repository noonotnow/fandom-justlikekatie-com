import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  activateSyncState,
  buildSyncOperations,
  queueCardDelete,
  resolveDeleteAccount,
  type CardRecord,
  type CollectionSyncState,
  type GridRecord,
} from '../src/utils/collectionDB.ts';

function card(index: number): CardRecord {
  return {
    localId: `local-${index}`,
    imageUrl: `https://images.example/${index}.jpg`,
    thumbnailUrl: `https://images.example/${index}-thumb.jpg`,
    resultId: `result-${index}`,
    actor: 'Actor',
    actorEn: 'Actor',
    vibe: 'Vibe',
    vibeEn: 'Vibe',
    vibeEmoji: '✨',
    capturedDate: '2026-08-10',
    savedAt: '2026-08-10T01:00:00Z',
  };
}

function grid(): GridRecord {
  return {
    localId: 'grid-local-1',
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: 'grid-1',
    actorId: 'actor-1',
    actor: 'Actor',
    actorEn: 'Actor',
    actorAccentColor: '#c9a96e',
    vibe: 'Vibe',
    vibeEn: 'Vibe',
    vibeEmoji: '✨',
    vibeSubtitle: 'Aesthetic description',
    vibeSubtitleEn: 'Aesthetic description',
    searchSpell: 'editorial search spell',
    edition: { provider: 'brave', misprint: false, legendary: false },
    capturedDate: '2026-08-10',
    generatedAt: '2026-08-10T00:00:00Z',
    savedAt: '2026-08-10T01:00:00Z',
    sourceRoute: '/',
    images: [{
      resultId: 'grid-result-1',
      imageUrl: '/api/image-proxy?url=https%3A%2F%2Fimages.example%2Fgrid.jpg',
      sourceUrl: 'https://publisher.example/grid',
      title: 'Grid result',
      gridPosition: 0,
    }],
  };
}

function state(): CollectionSyncState {
  return {
    key: 'state',
    clientId: 'device-1',
    activeAccountId: 'account-a',
    cursors: {},
    mergeDecisions: { 'account-a': true, 'account-b': true },
    mappingsByAccount: {},
    pendingDeletesByAccount: {
      'account-a': [{ mutationId: 'delete-a', localId: 'removed-a', serverId: 'server-a' }],
      'account-b': [{ mutationId: 'delete-b', localId: 'removed-b', serverId: 'server-b' }],
    },
    acknowledgedUpsertsByAccount: {},
  };
}

test('large collections advance beyond the first 100 acknowledged upserts', () => {
  const cards = Array.from({ length: 150 }, (_, index) => card(index));
  const syncState = state();
  const first = buildSyncOperations(cards, syncState, 'account-a');
  assert.equal(first.length, 151);
  assert.equal(first.some(operation => operation.mutationId === 'delete-b'), false);

  syncState.acknowledgedUpsertsByAccount['account-a'] = Object.fromEntries(
    first
      .filter(operation => operation.type === 'upsert')
      .slice(0, 99)
      .map(operation => [operation.localId, operation.mutationId]),
  );
  syncState.pendingDeletesByAccount['account-a'] = [];
  const second = buildSyncOperations(cards, syncState, 'account-a');
  assert.equal(second.length, 51);
  assert.equal(second[0].localId, 'local-99');
});

test('saved grids sync as first-class artifacts without flattening their source results', () => {
  const operations = buildSyncOperations([card(1)], state(), 'account-a', [grid()]);
  const gridOperation = operations.find(operation => operation.localId === 'grid-local-1');
  assert.equal(gridOperation?.type, 'upsert');
  assert.equal(Reflect.get(gridOperation?.item || {}, 'kind'), 'grid');
  assert.equal(Reflect.get(gridOperation?.item || {}, 'searchSpell'), 'editorial search spell');
  assert.equal(Reflect.get(gridOperation?.item || {}, 'images').length, 1);
  assert.equal(operations.filter(operation => operation.type === 'upsert').length, 2);
});

test('Lightbox save and remove schedule account-aware synchronization', async () => {
  const source = await readFile(new URL('../src/components/Lightbox/Lightbox.tsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ schedulePublicCollectionSync \}/);
  assert.match(source, /schedulePublicCollectionSync\(\);/);
});

test('delete routing uses card ownership or its unique account mapping, never an unrelated active tab', () => {
  const syncState = state();
  syncState.activeAccountId = 'account-b';
  syncState.mappingsByAccount = {
    'account-a': { 'local-1': 'server-a' },
    'account-b': {},
  };
  assert.equal(resolveDeleteAccount({ ...card(1), ownerAccountId: 'account-a' }, syncState), 'account-a');
  assert.equal(resolveDeleteAccount(card(1), syncState), 'account-a');
});

test('legacy PR #14 sync state migrates to the authenticated account without losing scoped state', () => {
  const activated = activateSyncState({
    key: 'state',
    clientId: 'device-1',
    cursors: { 'account-a': 7 },
    mergeDecisions: { 'account-a': true },
    mappings: { 'legacy-local': 'legacy-server' },
    pendingDeletes: [{
      mutationId: 'legacy-delete',
      localId: 'legacy-local',
      serverId: 'legacy-server',
    }],
    mappingsByAccount: { 'account-a': { 'current-local': 'current-server' } },
    pendingDeletesByAccount: {
      'account-a': [{
        mutationId: 'current-delete',
        localId: 'current-local',
        serverId: 'current-server',
      }],
    },
    acknowledgedUpsertsByAccount: { 'account-a': { 'acked-local': 'acked-mutation' } },
  }, 'account-a');

  assert.deepEqual(activated.mappingsByAccount['account-a'], {
    'legacy-local': 'legacy-server',
    'current-local': 'current-server',
  });
  assert.deepEqual(
    activated.pendingDeletesByAccount['account-a'].map(item => item.mutationId),
    ['legacy-delete', 'current-delete'],
  );
  assert.equal(activated.cursors['account-a'], 7);
  assert.equal(activated.acknowledgedUpsertsByAccount['account-a']['acked-local'], 'acked-mutation');
  assert.equal(activated.legacyUnscoped, undefined);
});

test('ambiguous legacy state is quarantined until an authenticated account can claim it safely', () => {
  const quarantined = activateSyncState({
    key: 'state',
    clientId: 'device-1',
    mappings: { 'legacy-local': 'legacy-server' },
    pendingDeletes: [{
      mutationId: 'legacy-delete',
      localId: 'legacy-local',
      serverId: 'legacy-server',
    }],
  });
  assert.deepEqual(quarantined.legacyUnscoped?.mappings, { 'legacy-local': 'legacy-server' });
  assert.equal(quarantined.legacyUnscoped?.pendingDeletes?.[0].mutationId, 'legacy-delete');

  const activated = activateSyncState(quarantined, 'account-a');
  assert.equal(activated.mappingsByAccount['account-a']['legacy-local'], 'legacy-server');
  assert.equal(activated.pendingDeletesByAccount['account-a'][0].mutationId, 'legacy-delete');
  assert.equal(activated.legacyUnscoped, undefined);
});

test('clearing a session binds quarantined legacy mutations to the prior account before switching users', () => {
  const cleared = activateSyncState({
    key: 'state',
    clientId: 'device-1',
    activeAccountId: 'account-a',
    cursors: {},
    mergeDecisions: {},
    mappingsByAccount: {},
    pendingDeletesByAccount: {},
    acknowledgedUpsertsByAccount: {},
    legacyUnscoped: {
      mappings: { 'legacy-local': 'legacy-server' },
      pendingDeletes: [{
        mutationId: 'legacy-delete',
        localId: 'legacy-local',
        serverId: 'legacy-server',
      }],
    },
  });
  const switched = activateSyncState(cleared, 'account-b');

  assert.equal(switched.mappingsByAccount['account-a']['legacy-local'], 'legacy-server');
  assert.equal(switched.pendingDeletesByAccount['account-a'][0].mutationId, 'legacy-delete');
  assert.equal(switched.mappingsByAccount['account-b'], undefined);
});

test('removing a card with a quarantined legacy mapping queues one delete for later account activation', async () => {
  const syncState = activateSyncState({
    key: 'state',
    clientId: 'device-1',
    mappings: { 'local-1': 'server-1' },
  });

  assert.equal(queueCardDelete(syncState, card(1), 'delete-1'), true);
  assert.equal(queueCardDelete(syncState, card(1), 'delete-duplicate'), true);
  assert.deepEqual(syncState.legacyUnscoped?.pendingDeletes, [{
    mutationId: 'delete-1',
    localId: 'local-1',
    serverId: 'server-1',
  }]);

  const activated = activateSyncState(syncState, 'account-a');
  assert.equal(buildSyncOperations([], activated, 'account-a')[0].mutationId, 'delete-1');

  const source = await readFile(new URL('../src/utils/collectionDB.ts', import.meta.url), 'utf8');
  const body = source.match(
    /export async function dbRemoveCard[\s\S]*?\n}\n\nexport function resolveDeleteAccount/,
  )?.[0] || '';
  assert.match(body, /db\.transaction\(\[CARD_STORE, SYNC_STORE\], 'readwrite'\)/);
  assert.match(body, /requestResult<CardRecord \| undefined>\(cardStore\.get\(imageUrl\)\)/);
  assert.doesNotMatch(body, /dbGetCard/);
});

test('active-account probes use one read-write transaction instead of stale read and write snapshots', async () => {
  const source = await readFile(new URL('../src/utils/collectionDB.ts', import.meta.url), 'utf8');
  const body = source.match(
    /export async function dbSetActiveAccount[\s\S]*?\n}\n\nexport async function dbBuildSyncRequest/,
  )?.[0] || '';
  assert.match(body, /db\.transaction\(SYNC_STORE, 'readwrite'\)/);
  assert.match(body, /requestResult\(store\.get\('state'\)\)/);
  assert.match(body, /store\.put\(activateSyncState\(value, accountId\)\)/);
  assert.doesNotMatch(body, /dbGetSyncState|dbPutSyncState/);
});
