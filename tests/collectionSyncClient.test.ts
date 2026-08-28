import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  activateSyncState,
  buildSyncOperations,
  collectionScopeForCard,
  createLegendaryMisprint,
  normalizeCardForCollection,
  markGridAsLegendaryMisprint,
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

test('saved Middle-earth memes keep attribution and treatment metadata through card sync', () => {
  const meme: CardRecord = {
    ...card(2),
    contentKind: 'middle-earth-meme',
    title: 'Gandalf reaction meme',
    publisher: 'Example publisher',
    searchQuery: 'Gandalf Friday meme',
    sourceUrl: 'https://publisher.example/gandalf',
    sourceRoute: '/memeforge/middle-earth',
    memeRework: {
      schemaVersion: 1,
      kind: 'meme-rework',
      createdAt: '2026-08-28T12:00:00.000Z',
      original: {
        resultId: 'gandalf-original',
        title: 'Gandalf reaction meme',
        sourceUrl: 'https://publisher.example/gandalf',
        publisher: 'Example publisher',
        searchQuery: 'Gandalf Friday meme',
        provider: 'brave',
        sourceType: 'archive',
      },
      edit: {
        type: 'text-overlay',
        mode: 'add-overlay',
        line1: 'You shall not deploy',
        line2: 'Without a rollback plan',
        layout: 'Classic top / bottom',
        tone: 'Dry',
      },
    },
  };
  const operation = buildSyncOperations([meme], state(), 'account-a')
    .find(candidate => candidate.localId === meme.localId);
  const item = operation?.item as Record<string, unknown>;

  assert.equal(item.contentKind, 'middle-earth-meme');
  assert.equal(item.title, 'Gandalf reaction meme');
  assert.equal(item.publisher, 'Example publisher');
  assert.equal(item.searchQuery, 'Gandalf Friday meme');
  assert.equal(item.sourceUrl, 'https://publisher.example/gandalf');
  assert.equal(item.sourceRoute, '/memeforge/middle-earth');
  assert.equal(item.collectionScope, 'middle-earth');
  assert.deepEqual(item.memeRework, meme.memeRework);
});

test('creator-entered Legendary Misprint identity and provenance survive card sync', () => {
  const marked: CardRecord = {
    ...card(7),
    actor: '刘学义',
    actorEn: 'Liu Xueyi',
    legendaryMisprint: {
      kind: 'legendary-misprint',
      confirmedByCreator: true,
      markedAt: '2026-08-28T12:00:00.000Z',
      intendedIdentity: {
        actor: '刘学义',
        actorEn: 'Liu Xueyi',
        vibe: 'Vibe',
        vibeEn: 'Vibe',
        collectionScope: 'vibe-atlas',
      },
      unexpectedImageIdentity: { label: 'Gandalf' },
      provenance: {
        imageUrl: 'https://images.example/7.jpg',
        resultId: 'result-7',
        searchQuery: '刘学义 editorial',
      },
    },
  };
  const operation = buildSyncOperations([marked], state(), 'account-a')
    .find(candidate => candidate.localId === marked.localId);
  const synced = Reflect.get(operation?.item || {}, 'legendaryMisprint');
  assert.deepEqual(synced, marked.legendaryMisprint);
});

test('Legendary Misprint metadata is created only by an explicit creator description', () => {
  const source = {
    ...card(8),
    actor: '刘学义',
    actorEn: 'Liu Xueyi',
    collectionScope: 'vibe-atlas' as const,
    searchQuery: '刘学义 editorial',
  };
  assert.equal(source.legendaryMisprint, undefined);
  assert.throws(() => createLegendaryMisprint(source, '   '), /Describe the unexpected image identity/);
  const marked = createLegendaryMisprint(source, '  Gandalf  ', new Date('2026-08-28T12:00:00.000Z'));
  assert.equal(marked.confirmedByCreator, true);
  assert.equal(marked.intendedIdentity.actor, '刘学义');
  assert.equal(marked.unexpectedImageIdentity.label, 'Gandalf');
  assert.equal(marked.provenance.resultId, source.resultId);
  assert.equal(marked.provenance.searchQuery, source.searchQuery);
});

test('marking and restoring a previously acknowledged card produce new sync mutations', () => {
  const original = card(9);
  const syncState = state();
  const initial = buildSyncOperations([original], syncState, 'account-a')
    .find(operation => operation.localId === original.localId);
  syncState.acknowledgedUpsertsByAccount['account-a'] = {
    [original.localId!]: String(initial?.mutationId),
  };

  const marked: CardRecord = {
    ...original,
    savedAt: '2026-08-28T12:00:00.000Z',
    legendaryMisprint: createLegendaryMisprint(
      { ...original, actor: '刘学义', actorEn: 'Liu Xueyi' },
      'Gandalf',
      new Date('2026-08-28T12:00:00.000Z'),
    ),
  };
  const markOperation = buildSyncOperations([marked], syncState, 'account-a')
    .find(operation => operation.localId === original.localId);
  assert.ok(markOperation);
  assert.notEqual(markOperation.mutationId, initial?.mutationId);

  syncState.acknowledgedUpsertsByAccount['account-a'][original.localId!] = String(markOperation.mutationId);
  const restored: CardRecord = {
    ...marked,
    savedAt: '2026-08-28T13:00:00.000Z',
    legendaryMisprint: undefined,
  };
  const restoreOperation = buildSyncOperations([restored], syncState, 'account-a')
    .find(operation => operation.localId === original.localId);
  assert.ok(restoreOperation);
  assert.notEqual(restoreOperation.mutationId, markOperation.mutationId);
});

test('collection scope keeps legacy MemeForge records out of Vibe Atlas without guessing from imagery', () => {
  assert.equal(collectionScopeForCard(card(1)), 'vibe-atlas');
  assert.equal(collectionScopeForCard({
    ...card(2),
    sourceRoute: '/memeforge/middle-earth',
  }), 'middle-earth');
  assert.equal(collectionScopeForCard({
    ...card(3),
    collectionScope: 'middle-earth',
  }), 'middle-earth');
  assert.equal(collectionScopeForCard({
    ...card(4),
    sourceRoute: '/vibe-atlas?view=results',
  }), 'vibe-atlas');
});

test('moving an ambiguous Vibe Atlas card to Middle-earth clears C-drama metadata without changing its image identity', () => {
  const moved = normalizeCardForCollection({
    ...card(5),
    collectionScope: 'middle-earth',
    contentKind: 'middle-earth-meme',
    sourceRoute: '/vibe-atlas?view=results',
    title: 'Gandalf reaction meme',
    gridContext: { batchKey: '刘学义 cold jade', position: 2 },
    searchQuery: '刘学义 cold jade',
  });
  assert.equal(moved.actor, 'Middle-earth');
  assert.equal(moved.vibe, 'Gandalf reaction meme');
  assert.equal(moved.vibeEn, 'Existing meme · saved as-is');
  assert.equal(moved.sourceRoute, '/memeforge/middle-earth?view=collection');
  assert.equal(moved.resultId, 'result-5');
  assert.equal(moved.imageUrl, 'https://images.example/5.jpg');
  assert.equal(moved.gridContext, undefined);
  assert.equal(moved.searchQuery, undefined);
});

test('already-moved Middle-earth cards with Vibe grid context are repaired after the route was rewritten', () => {
  const repaired = normalizeCardForCollection({
    ...card(6),
    collectionScope: 'middle-earth',
    contentKind: 'middle-earth-meme',
    sourceRoute: '/memeforge/middle-earth?view=collection',
    actor: '刘学义',
    actorEn: 'Liu Xueyi',
    vibe: '仙门冷玉',
    gridContext: { batchKey: '刘学义 cold jade', position: 1 },
  });
  assert.equal(repaired.actor, 'Middle-earth');
  assert.equal(repaired.vibe, 'Existing Middle-earth meme');
  assert.equal(repaired.gridContext, undefined);
  assert.equal(repaired.sourceRoute, '/memeforge/middle-earth?view=collection');
});

test('Legendary Misprints preserve the unexpected actor while setting both export tier flags', () => {
  const markedAt = new Date('2026-08-28T19:47:00.000Z');
  const marked = markGridAsLegendaryMisprint({
    ...grid(),
    actorId: 'gandalf',
    actor: 'Gandalf',
    actorEn: 'Gandalf',
  }, markedAt);
  assert.deepEqual(marked.edition, {
    provider: 'brave',
    misprint: true,
    legendary: true,
  });
  assert.deepEqual(marked.legendaryMisprint, {
    schemaVersion: 1,
    markedAt: markedAt.toISOString(),
    intendedStudio: 'vibe-atlas',
    unexpectedActor: {
      id: 'gandalf',
      name: 'Gandalf',
      nameEn: 'Gandalf',
    },
  });
  assert.equal(marked.actor, 'Gandalf');
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
