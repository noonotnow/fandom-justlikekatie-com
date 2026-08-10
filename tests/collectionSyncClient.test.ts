import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildSyncOperations,
  resolveDeleteAccount,
  type CardRecord,
  type CollectionSyncState,
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
