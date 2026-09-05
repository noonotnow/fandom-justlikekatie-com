/** IndexedDB persistence for saved cards */
import type {
  CollectionMediaRecovery,
  MediaReference,
} from './mediaReference';
import type { MemeReworkMetadata } from './memeRework';
import type { ReleaseCandidateProvenance } from './approvedBoardProvenance';

const DB_NAME = 'vibe-atlas-collection';
const DB_VERSION = 3;
const CARD_STORE = 'cards';
const GRID_STORE = 'grids';
const SYNC_STORE = 'sync';

export type CollectionScope = 'vibe-atlas' | 'middle-earth';

export interface LegendaryMisprint {
  kind: 'legendary-misprint';
  confirmedByCreator: true;
  markedAt: string;
  intendedIdentity: {
    actor: string;
    actorEn: string;
    vibe: string;
    vibeEn: string;
    collectionScope: CollectionScope;
  };
  unexpectedImageIdentity: {
    label: string;
    collectionScope?: CollectionScope;
  };
  provenance: {
    imageUrl: string;
    resultId?: string;
    sourceUrl?: string;
    publisher?: string;
    searchQuery?: string;
    batchKey?: string;
  };
}

export interface CardRecord {
  localId?: string;
  serverId?: string;
  ownerAccountId?: string;
  imageUrl: string;
  thumbnailUrl: string;
  actor: string;
  actorEn: string;
  vibe: string;
  vibeEn: string;
  vibeEmoji: string;
  capturedDate: string;
  savedAt?: string;
  resultId?: string;
  sourceUrl?: string;
  contentKind?: 'middle-earth-meme';
  title?: string;
  publisher?: string;
  searchQuery?: string;
  sourceRoute?: string;
  media?: MediaReference;
  mediaRecovery?: CollectionMediaRecovery;
  /** Logical collection namespace. Optional only for records saved before namespacing. */
  collectionScope?: CollectionScope;
  /** Creator-confirmed only. Never populated by image or metadata inference. */
  legendaryMisprint?: LegendaryMisprint;
  /** Non-destructive edit recipe and immutable source relationship for MemeForge derivatives. */
  memeRework?: MemeReworkMetadata;
  gridContext?: {
    batchKey?: string;
    position: number;
  };
}

type SyncableCollectionRecord = {
  localId?: string;
  serverId?: string;
  ownerAccountId?: string;
};

export interface GridMediaSnapshot {
  resultId: string;
  imageUrl: string;
  sourceUrl: string;
  title: string;
  publisher?: string;
  batchKey?: string;
  batchRank?: number;
  familyId?: string;
  familyLabel?: string;
  familyEvidence?: 'persisted-event' | 'batch' | 'publisher' | 'fallback';
  gridPosition: number;
  media?: MediaReference;
  mediaRecovery?: CollectionMediaRecovery;
  legendaryMisprint?: LegendaryMisprint;
}

export interface GridRecord {
  localId?: string;
  serverId?: string;
  artifactId?: string;
  ownerAccountId?: string;
  kind: 'grid';
  schemaVersion: 1;
  rendererVersion: 'vibe-atlas-v1';
  id: string;
  actorId: string;
  actor: string;
  actorEn: string;
  actorAccentColor: string;
  vibe: string;
  vibeEn: string;
  vibeEmoji: string;
  vibeSubtitle: string;
  vibeSubtitleEn: string;
  searchSpell: string;
  generationPrompt?: string;
  ctaSeed?: string;
  edition: {
    provider: string | null;
    misprint: boolean;
    legendary: boolean;
  };
  capturedDate: string;
  generatedAt: string;
  savedAt: string;
  sourceRoute: string;
  vibeKey?: string;
  images: GridMediaSnapshot[];
  releaseCandidateProvenance?: ReleaseCandidateProvenance;
  editorial?: {
    mode: 'event' | 'compiled';
    compositionSize: 9 | 12;
    arrangement: 'automatic' | 'creator-arranged';
    primaryFamilyId?: string;
    primaryFamilyLabel?: string;
    evidenceBasis?: 'persisted-event' | 'batch';
  };
  legacyCompositeUrl?: string;
  media?: MediaReference;
  mediaRecovery?: CollectionMediaRecovery;
  intent?: 'standard' | 'legendary-misprint';
  misprintMetadata?: {
    confirmedByCreator: true;
    intendedIdentities: string[];
    unexpectedImageIdentities: string[];
    sourceResultIds: string[];
  };
  legendaryMisprint?: {
    schemaVersion: 1;
    markedAt: string;
    intendedStudio: 'vibe-atlas';
    unexpectedActor: {
      id: string;
      name: string;
      nameEn: string;
    };
  };
}

export function markGridAsLegendaryMisprint(
  grid: GridRecord,
  now = new Date(),
): GridRecord {
  return {
    ...grid,
    edition: {
      ...grid.edition,
      misprint: true,
      legendary: true,
    },
    legendaryMisprint: {
      schemaVersion: 1,
      markedAt: now.toISOString(),
      intendedStudio: 'vibe-atlas',
      unexpectedActor: {
        id: grid.actorId,
        name: grid.actor,
        nameEn: grid.actorEn,
      },
    },
    intent: 'legendary-misprint',
    misprintMetadata: {
      confirmedByCreator: true,
      intendedIdentities: ['Vibe Atlas'],
      unexpectedImageIdentities: [grid.actor],
      sourceResultIds: grid.images.map(image => image.resultId),
    },
  };
}

export function createLegendaryMisprint(
  card: CardRecord,
  unexpectedImageIdentity: string,
  now = new Date(),
): LegendaryMisprint {
  const label = unexpectedImageIdentity.trim().slice(0, 160);
  if (!label) throw new Error('Describe the unexpected image identity before marking a Legendary Misprint.');
  return {
    kind: 'legendary-misprint',
    confirmedByCreator: true,
    markedAt: now.toISOString(),
    intendedIdentity: {
      actor: card.actor,
      actorEn: card.actorEn,
      vibe: card.vibe,
      vibeEn: card.vibeEn,
      collectionScope: collectionScopeForCard(card),
    },
    unexpectedImageIdentity: { label },
    provenance: {
      imageUrl: card.imageUrl,
      ...(card.resultId ? { resultId: card.resultId } : {}),
      ...(card.sourceUrl ? { sourceUrl: card.sourceUrl } : {}),
      ...(card.publisher ? { publisher: card.publisher } : {}),
      ...(card.searchQuery ? { searchQuery: card.searchQuery } : {}),
      ...(card.gridContext?.batchKey ? { batchKey: card.gridContext.batchKey } : {}),
    },
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CARD_STORE)) {
        db.createObjectStore(CARD_STORE, { keyPath: 'imageUrl' });
      }
      if (!db.objectStoreNames.contains(GRID_STORE)) {
        db.createObjectStore(GRID_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbSaveCard(card: CardRecord): Promise<void> {
  const db = await openDB();
  const normalizedCard = normalizeCardForCollection(card);
  const existing = await dbGetCard(normalizedCard.imageUrl);
  const record = {
    ...normalizedCard,
    collectionScope: collectionScopeForCard(normalizedCard),
    localId: normalizedCard.localId || existing?.localId || crypto.randomUUID(),
    savedAt: normalizedCard.savedAt || new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CARD_STORE, 'readwrite');
    tx.objectStore(CARD_STORE).put(record);
    tx.oncomplete = () => {
      fetch('/.netlify/functions/log-engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'collection_save',
          actor: card.actor,
          vibe: card.vibe,
          imageUrl: card.imageUrl,
          batchKey: card.gridContext?.batchKey,
          capturedDate: card.capturedDate,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbRemoveCard(imageUrl: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([CARD_STORE, SYNC_STORE], 'readwrite');
  const cardStore = tx.objectStore(CARD_STORE);
  const syncStore = tx.objectStore(SYNC_STORE);
  const existing = await requestResult<CardRecord | undefined>(cardStore.get(imageUrl));
  cardStore.delete(imageUrl);
  if (existing?.localId) {
    const state = normalizeSyncState(await requestResult(syncStore.get('state')));
    if (queueCardDelete(state, existing, crypto.randomUUID())) syncStore.put(state);
  }
  await transactionDone(tx);
}

export function resolveDeleteAccount(
  card: SyncableCollectionRecord,
  state: CollectionSyncState,
): string | undefined {
  if (!card.localId) return undefined;
  if (card.ownerAccountId && state.mappingsByAccount[card.ownerAccountId]?.[card.localId]) {
    return card.ownerAccountId;
  }
  const candidates = Object.entries(state.mappingsByAccount)
    .filter(([, mappings]) => Boolean(mappings[card.localId!]))
    .map(([accountId]) => accountId);
  if (state.activeAccountId && candidates.includes(state.activeAccountId)) return state.activeAccountId;
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function queueCardDelete(
  state: CollectionSyncState,
  card: SyncableCollectionRecord,
  mutationId: string,
): boolean {
  if (!card.localId) return false;
  const accountId = resolveDeleteAccount(card, state);
  const serverId = accountId
    ? state.mappingsByAccount[accountId]?.[card.localId]
    : state.legacyUnscoped?.mappings?.[card.localId];
  if (!serverId) return false;
  const pending = accountId
    ? (state.pendingDeletesByAccount[accountId] || [])
    : (state.legacyUnscoped?.pendingDeletes || []);
  if (!pending.some(item => item.localId === card.localId && item.serverId === serverId)) {
    pending.push({ mutationId, localId: card.localId, serverId });
  }
  if (accountId) {
    state.pendingDeletesByAccount[accountId] = pending;
  } else {
    state.legacyUnscoped = { ...state.legacyUnscoped, pendingDeletes: pending };
  }
  return true;
}

export async function dbIsCardSaved(imageUrl: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CARD_STORE, 'readonly');
    const req = tx.objectStore(CARD_STORE).get(imageUrl);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAllCards(): Promise<CardRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CARD_STORE, 'readonly');
    const req = tx.objectStore(CARD_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetVisibleCards(accountId?: string): Promise<CardRecord[]> {
  const cards = await dbGetAllCards();
  return cards.filter(card => !card.ownerAccountId || card.ownerAccountId === accountId);
}

export function collectionScopeForCard(card: CardRecord): CollectionScope {
  if (card.collectionScope === 'vibe-atlas' || card.collectionScope === 'middle-earth') {
    return card.collectionScope;
  }
  if (
    card.contentKind === 'middle-earth-meme'
    || card.sourceRoute?.startsWith('/memeforge/middle-earth')
    || (
      card.media?.association.type === 'collection'
      && card.media.association.id === 'middle-earth'
    )
  ) return 'middle-earth';
  return 'vibe-atlas';
}

export function normalizeCardForCollection(card: CardRecord): CardRecord {
  if (
    collectionScopeForCard(card) !== 'middle-earth'
    || (
      !card.sourceRoute?.startsWith('/vibe-atlas')
      && !card.gridContext
    )
  ) return card;
  return {
    ...card,
    actor: 'Middle-earth',
    actorEn: 'Middle-earth',
    vibe: card.title || 'Existing Middle-earth meme',
    vibeEn: 'Existing meme · saved as-is',
    vibeEmoji: '🧙',
    title: card.title || 'Existing Middle-earth meme',
    searchQuery: undefined,
    gridContext: undefined,
    sourceRoute: '/memeforge/middle-earth?view=collection',
  };
}

export async function dbGetCardsByScope(scope: CollectionScope): Promise<CardRecord[]> {
  const cards = await dbGetAllCards();
  return cards.filter(card => collectionScopeForCard(card) === scope);
}

export async function dbGetVisibleCardsByScope(
  accountId: string | undefined,
  scope: CollectionScope,
): Promise<CardRecord[]> {
  const cards = await dbGetVisibleCards(accountId);
  return cards.filter(card => collectionScopeForCard(card) === scope);
}

export async function dbReplaceCardImage(
  oldImageUrl: string,
  media: MediaReference,
  mediaRecovery?: CollectionMediaRecovery,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(CARD_STORE, 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  const existing = await requestResult<CardRecord | undefined>(store.get(oldImageUrl));
  if (!existing) {
    await transactionDone(tx);
    return;
  }
  const cards = await requestResult<CardRecord[]>(store.getAll());
  store.delete(oldImageUrl);
  store.put({
    ...existing,
    imageUrl: media.deliveryUrl,
    thumbnailUrl: media.thumbnailUrl,
    sourceUrl: existing.sourceUrl === oldImageUrl ? media.deliveryUrl : existing.sourceUrl,
    localId: existing.localId || crypto.randomUUID(),
    media,
    ...(mediaRecovery ? { mediaRecovery } : {}),
  });
  for (const card of cards) {
    if (
      card.imageUrl === oldImageUrl
      || !existing.resultId
      || card.memeRework?.original.resultId !== existing.resultId
    ) continue;
    const original = card.memeRework.original;
    const sourceUrl = original.sourceType === 'upload'
      && (!original.sourceUrl || original.sourceUrl.startsWith('data:'))
      ? media.deliveryUrl
      : original.sourceUrl;
    store.put({
      ...card,
      sourceUrl: !card.sourceUrl || card.sourceUrl === oldImageUrl
        ? media.deliveryUrl
        : card.sourceUrl,
      memeRework: {
        ...card.memeRework,
        original: {
          ...original,
          ...(sourceUrl ? { sourceUrl } : {}),
        },
      },
    });
  }
  await transactionDone(tx);
}

export async function dbSaveCardMediaRecovery(
  imageUrl: string,
  mediaRecovery: CollectionMediaRecovery,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(CARD_STORE, 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  const existing = await requestResult<CardRecord | undefined>(store.get(imageUrl));
  if (!existing) {
    await transactionDone(tx);
    return;
  }
  store.put({ ...existing, mediaRecovery });
  await transactionDone(tx);
}
export interface CollectionSyncState {
  key: 'state';
  clientId: string;
  activeAccountId?: string;
  cursors: Record<string, number>;
  mergeDecisions: Record<string, boolean>;
  mappingsByAccount: Record<string, Record<string, string>>;
  pendingDeletesByAccount: Record<string, Array<{ mutationId: string; localId: string; serverId: string }>>;
  acknowledgedUpsertsByAccount: Record<string, Record<string, string>>;
  legacyUnscoped?: {
    mappings?: Record<string, string>;
    pendingDeletes?: Array<{ mutationId: string; localId: string; serverId: string }>;
  };
}

export interface CollectionSyncRequest {
  schemaVersion: 1;
  clientId: string;
  expectedAccountId: string;
  cursor: number;
  operations: Array<Record<string, unknown>>;
}

export async function dbGetSyncState(): Promise<CollectionSyncState> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(SYNC_STORE, 'readonly').objectStore(SYNC_STORE).get('state');
    req.onsuccess = () => resolve(normalizeSyncState(req.result));
    req.onerror = () => reject(req.error);
  });
}

export async function dbSetMergeDecision(accountId: string, merge: boolean): Promise<void> {
  const state = await dbGetSyncState();
  state.mergeDecisions[accountId] = merge;
  await dbPutSyncState(state);
}

export async function dbSetActiveAccount(accountId?: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_STORE, 'readwrite');
  const store = tx.objectStore(SYNC_STORE);
  const value = await requestResult(store.get('state'));
  store.put(activateSyncState(value, accountId));
  await transactionDone(tx);
}

export async function dbBuildSyncRequest(accountId: string): Promise<CollectionSyncRequest> {
  const [loadedCards, loadedGrids, state] = await Promise.all([
    dbGetAllCards(),
    dbGetAllGrids(),
    dbGetSyncState(),
  ]);
  const cards = await ensureLocalIds(loadedCards);
  const grids = await ensureGridLocalIds(loadedGrids);
  return {
    schemaVersion: 1,
    clientId: state.clientId,
    expectedAccountId: accountId,
    cursor: state.cursors[accountId] || 0,
    operations: buildSyncOperations(cards, state, accountId, grids).slice(0, 100),
  };
}

/**
 * Builds an explicit, single-grid upsert. This intentionally bypasses the
 * device merge preference: a creator has selected this one artifact to hand
 * off, rather than opting the account into merging its whole device cache.
 */
export async function dbBuildGridSyncRequest(
  accountId: string,
  gridId: string,
): Promise<CollectionSyncRequest> {
  const localId = await dbEnsureGridLocalId(gridId);
  if (!localId) throw new Error('The selected grid is no longer saved on this device.');
  const [grid, state] = await Promise.all([dbGetGrid(gridId), dbGetSyncState()]);
  if (!grid) throw new Error('The selected grid is no longer saved on this device.');
  if (grid.ownerAccountId && grid.ownerAccountId !== accountId) {
    throw new Error('The selected grid belongs to a different account.');
  }
  const identifiedGrid = { ...grid, localId };
  return {
    schemaVersion: 1,
    clientId: state.clientId,
    expectedAccountId: accountId,
    cursor: state.cursors[accountId] || 0,
    operations: [gridUpsertOperation(identifiedGrid, state)],
  };
}

export function buildSyncOperations(
  cards: CardRecord[],
  state: CollectionSyncState,
  accountId: string,
  grids: GridRecord[] = [],
): Array<Record<string, unknown>> {
  const deletes = (state.pendingDeletesByAccount[accountId] || []).map(operation => ({
    ...operation,
    type: 'delete',
  }));
  if (state.mergeDecisions[accountId] !== true) return deletes;
  const acknowledged = state.acknowledgedUpsertsByAccount[accountId] || {};
  const upserts = cards
    .filter(card => !card.ownerAccountId || card.ownerAccountId === accountId)
    .map(card => {
      const localId = card.localId!;
      const collectionScope = collectionScopeForCard(card);
      const mutationId = `upsert:${state.clientId}:${localId}:${card.savedAt || card.capturedDate}:${collectionScope}`;
      return {
        type: 'upsert',
        mutationId,
        localId,
        item: {
          kind: 'card',
          imageUrl: card.imageUrl,
          thumbnailUrl: card.thumbnailUrl,
          resultId: card.resultId,
          sourceUrl: card.sourceUrl,
          actor: card.actor,
          actorEn: card.actorEn,
          vibe: card.vibe,
          vibeEn: card.vibeEn,
          vibeEmoji: card.vibeEmoji,
          capturedDate: card.capturedDate,
          savedAt: card.savedAt,
          gridContext: card.gridContext,
          contentKind: card.contentKind,
          title: card.title,
          publisher: card.publisher,
          searchQuery: card.searchQuery,
          sourceRoute: card.sourceRoute,
          media: card.media,
          mediaRecovery: card.mediaRecovery,
          collectionScope,
          legendaryMisprint: card.legendaryMisprint,
          memeRework: card.memeRework,
        },
      };
    })
    .filter(operation => acknowledged[operation.localId] !== operation.mutationId);
  const gridUpserts = grids
    .filter(grid => !grid.ownerAccountId || grid.ownerAccountId === accountId)
    .map(grid => gridUpsertOperation(grid, state))
    .filter(operation => acknowledged[operation.localId] !== operation.mutationId);
  return [...deletes, ...upserts, ...gridUpserts];
}

export async function dbApplySyncResponse(
  accountId: string,
  response: {
    cursor: number;
    items: Array<Record<string, unknown>>;
    tombstones: Array<{ id: string }>;
    mappings: Record<string, string>;
    acknowledgedMutationIds: string[];
  },
  submittedOperations: Array<Record<string, unknown>>,
): Promise<void> {
  const db = await openDB();
  const cards = await dbGetAllCards();
  const grids = await dbGetAllGrids();
  const byLocalId = new Map(cards.map(card => [card.localId, card]));
  const byServerId = new Map(cards.map(card => [card.serverId, card]));
  const gridsByLocalId = new Map(grids.map(grid => [grid.localId, grid]));
  const gridsByServerId = new Map(grids.map(grid => [grid.serverId, grid]));
  const tx = db.transaction([CARD_STORE, GRID_STORE, SYNC_STORE], 'readwrite');
  const cardStore = tx.objectStore(CARD_STORE);
  const gridStore = tx.objectStore(GRID_STORE);
  const state = normalizeSyncState(await requestResult(tx.objectStore(SYNC_STORE).get('state')));
  const mappings = state.mappingsByAccount[accountId] || {};
  Object.assign(mappings, response.mappings);
  state.mappingsByAccount[accountId] = mappings;
  state.cursors[accountId] = response.cursor;
  const acknowledged = new Set(response.acknowledgedMutationIds);
  state.pendingDeletesByAccount[accountId] = (state.pendingDeletesByAccount[accountId] || []).filter(
    item => !response.acknowledgedMutationIds.includes(item.mutationId),
  );
  const acknowledgedUpserts = state.acknowledgedUpsertsByAccount[accountId] || {};
  for (const operation of submittedOperations) {
    if (
      operation.type === 'upsert'
      && typeof operation.localId === 'string'
      && typeof operation.mutationId === 'string'
      && acknowledged.has(operation.mutationId)
    ) acknowledgedUpserts[operation.localId] = operation.mutationId;
  }
  state.acknowledgedUpsertsByAccount[accountId] = acknowledgedUpserts;
  for (const item of response.items) {
    const serverId = String(item.id);
    const localId = String(item.localId || '');
    if (item.kind === 'grid') {
      const existing = gridsByServerId.get(serverId) || gridsByLocalId.get(localId);
      const record = {
        ...(item as unknown as GridRecord),
        id: typeof item.artifactId === 'string' ? item.artifactId : existing?.id || serverId,
        localId: existing?.localId || localId || crypto.randomUUID(),
        serverId,
        ownerAccountId: existing?.ownerAccountId || (existing ? undefined : accountId),
      };
      if (existing && existing.id !== record.id) gridStore.delete(existing.id);
      gridStore.put({ ...existing, ...record });
      continue;
    }
    const existing = byServerId.get(serverId) || byLocalId.get(localId);
    const record = {
      ...(item as unknown as CardRecord),
      collectionScope: collectionScopeForCard(item as unknown as CardRecord),
      localId: existing?.localId || localId || crypto.randomUUID(),
      serverId,
      // Preserve cards that began as anonymous device data; only cloud-only
      // downloads are account-scoped and removed from the local cache on logout.
      ownerAccountId: existing?.ownerAccountId || (existing ? undefined : accountId),
    };
    if (existing && existing.imageUrl !== record.imageUrl) cardStore.delete(existing.imageUrl);
    cardStore.put({ ...existing, ...record });
  }
  for (const tombstone of response.tombstones) {
    const mappedLocalId = Object.entries(mappings).find(([, serverId]) => serverId === tombstone.id)?.[0];
    const existing = byServerId.get(tombstone.id) || byLocalId.get(mappedLocalId);
    if (existing) cardStore.delete(existing.imageUrl);
    const existingGrid = gridsByServerId.get(tombstone.id) || gridsByLocalId.get(mappedLocalId);
    if (existingGrid) gridStore.delete(existingGrid.id);
  }
  tx.objectStore(SYNC_STORE).put(state);
  await transactionDone(tx);
}

export async function dbRemoveAccountCache(accountId: string): Promise<void> {
  const [cards, grids] = await Promise.all([dbGetAllCards(), dbGetAllGrids()]);
  const db = await openDB();
  const tx = db.transaction([CARD_STORE, GRID_STORE], 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  const gridStore = tx.objectStore(GRID_STORE);
  for (const card of cards) {
    if (card.ownerAccountId === accountId) store.delete(card.imageUrl);
  }
  for (const grid of grids) {
    if (grid.ownerAccountId === accountId) gridStore.delete(grid.id);
  }
  await transactionDone(tx);
}

export async function dbSaveGrid(grid: GridRecord): Promise<void> {
  const db = await openDB();
  const existing = await dbGetGrid(grid.id);
  const record = {
    ...grid,
    localId: grid.localId || existing?.localId || crypto.randomUUID(),
    savedAt: grid.savedAt || new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GRID_STORE, 'readwrite');
    tx.objectStore(GRID_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetAllGrids(): Promise<GridRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GRID_STORE, 'readonly');
    const req = tx.objectStore(GRID_STORE).getAll();
    req.onsuccess = () => resolve((req.result as Partial<GridRecord>[]).map(normalizeGridRecord));
    req.onerror = () => reject(req.error);
  });
}

export function normalizeGridRecord(grid: Partial<GridRecord>): GridRecord {
  const images = Array.isArray(grid.images) ? grid.images : [];
  return {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: grid.id || crypto.randomUUID(),
    actorId: grid.actorId || 'legacy-actor',
    actor: grid.actor || 'Unknown actor',
    actorEn: grid.actorEn || grid.actor || 'Unknown actor',
    actorAccentColor: grid.actorAccentColor || '#c9a96e',
    vibe: grid.vibe || 'Saved vibe',
    vibeEn: grid.vibeEn || grid.vibe || 'Saved vibe',
    vibeEmoji: grid.vibeEmoji || '✨',
    vibeSubtitle: grid.vibeSubtitle || '',
    vibeSubtitleEn: grid.vibeSubtitleEn || '',
    searchSpell: grid.searchSpell || images[0]?.batchKey || '',
    edition: {
      provider: grid.edition?.provider ?? null,
      misprint: grid.edition?.misprint === true,
      legendary: grid.edition?.legendary === true,
    },
    capturedDate: grid.capturedDate || new Date().toISOString().slice(0, 10),
    generatedAt: grid.generatedAt || grid.savedAt || new Date().toISOString(),
    savedAt: grid.savedAt || grid.generatedAt || new Date().toISOString(),
    sourceRoute: grid.sourceRoute || '/',
    ...(grid.vibeKey ? { vibeKey: grid.vibeKey } : {}),
    images,
    ...(grid.editorial ? { editorial: grid.editorial } : {}),
    ...(grid.localId ? { localId: grid.localId } : {}),
    ...(grid.serverId ? { serverId: grid.serverId } : {}),
    ...(grid.ownerAccountId ? { ownerAccountId: grid.ownerAccountId } : {}),
    ...(grid.generationPrompt ? { generationPrompt: grid.generationPrompt } : {}),
    ...(grid.ctaSeed ? { ctaSeed: grid.ctaSeed } : {}),
    ...(grid.legacyCompositeUrl ? { legacyCompositeUrl: grid.legacyCompositeUrl } : {}),
    ...(grid.media ? { media: grid.media } : {}),
    ...(grid.mediaRecovery ? { mediaRecovery: grid.mediaRecovery } : {}),
    ...(grid.legendaryMisprint ? { legendaryMisprint: grid.legendaryMisprint } : {}),
    ...(grid.intent ? { intent: grid.intent } : {}),
    ...(grid.misprintMetadata ? { misprintMetadata: grid.misprintMetadata } : {}),
    ...(grid.releaseCandidateProvenance
      ? { releaseCandidateProvenance: grid.releaseCandidateProvenance }
      : {}),
  };
}

export async function dbGetVisibleGrids(accountId?: string): Promise<GridRecord[]> {
  const grids = await dbGetAllGrids();
  return grids.filter(grid => !grid.ownerAccountId || grid.ownerAccountId === accountId);
}

export async function dbRemoveGrid(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([GRID_STORE, SYNC_STORE], 'readwrite');
  const gridStore = tx.objectStore(GRID_STORE);
  const syncStore = tx.objectStore(SYNC_STORE);
  const existing = await requestResult<GridRecord | undefined>(gridStore.get(id));
  gridStore.delete(id);
  if (existing?.localId) {
    const state = normalizeSyncState(await requestResult(syncStore.get('state')));
    if (queueCardDelete(state, existing, crypto.randomUUID())) syncStore.put(state);
  }
  await transactionDone(tx);
}

async function dbGetCard(imageUrl: string): Promise<CardRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(CARD_STORE, 'readonly').objectStore(CARD_STORE).get(imageUrl);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetGrid(id: string): Promise<GridRecord | undefined> {
  const db = await openDB();
  return requestResult(db.transaction(GRID_STORE, 'readonly').objectStore(GRID_STORE).get(id));
}

async function dbPutSyncState(state: CollectionSyncState): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_STORE, 'readwrite');
  tx.objectStore(SYNC_STORE).put(state);
  await transactionDone(tx);
}

async function ensureLocalIds(cards: CardRecord[]): Promise<CardRecord[]> {
  const missing = cards.filter(card => !card.localId);
  if (missing.length === 0) return cards;
  const db = await openDB();
  const tx = db.transaction(CARD_STORE, 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  const assigned = new Map<string, string>();
  for (const card of missing) {
    const localId = crypto.randomUUID();
    assigned.set(card.imageUrl, localId);
    store.put({ ...card, localId });
  }
  await transactionDone(tx);
  return cards.map(card => ({ ...card, localId: card.localId || assigned.get(card.imageUrl) }));
}

async function ensureGridLocalIds(grids: GridRecord[]): Promise<GridRecord[]> {
  const missing = grids.filter(grid => !grid.localId);
  if (missing.length === 0) return grids;
  const db = await openDB();
  const tx = db.transaction(GRID_STORE, 'readwrite');
  const store = tx.objectStore(GRID_STORE);
  const assigned = new Map<string, string>();
  for (const grid of missing) {
    const localId = crypto.randomUUID();
    assigned.set(grid.id, localId);
    store.put({ ...grid, localId });
  }
  await transactionDone(tx);
  return grids.map(grid => ({ ...grid, localId: grid.localId || assigned.get(grid.id) }));
}

function collectionGridSyncItem(grid: GridRecord): Record<string, unknown> {
  const item = { ...grid } as Record<string, unknown>;
  delete item.localId;
  delete item.serverId;
  delete item.ownerAccountId;
  return item;
}

function gridUpsertOperation(
  grid: GridRecord,
  state: CollectionSyncState,
): Record<string, unknown> & { localId: string; mutationId: string } {
  const localId = grid.localId;
  if (!localId) throw new Error('A grid must have a local identity before syncing.');
  return {
    type: 'upsert',
    mutationId: `upsert:${state.clientId}:${localId}:${grid.legendaryMisprint?.markedAt || grid.savedAt}`,
    localId,
    item: collectionGridSyncItem(grid),
  };
}

type LegacyCollectionSyncState = Partial<CollectionSyncState> & {
  mappings?: Record<string, string>;
  pendingDeletes?: Array<{ mutationId: string; localId: string; serverId: string }>;
};

export function activateSyncState(
  value: LegacyCollectionSyncState | undefined,
  accountId?: string,
): CollectionSyncState {
  const state = normalizeSyncState(value);
  const legacy = state.legacyUnscoped;
  const migrationAccountId = value?.activeAccountId || accountId;
  if (migrationAccountId && legacy) {
    state.mappingsByAccount[migrationAccountId] = {
      ...legacy.mappings,
      ...state.mappingsByAccount[migrationAccountId],
    };
    const pending = [
      ...(legacy.pendingDeletes || []),
      ...(state.pendingDeletesByAccount[migrationAccountId] || []),
    ];
    state.pendingDeletesByAccount[migrationAccountId] = Array.from(
      new Map(pending.map(item => [item.mutationId, item])).values(),
    );
    delete state.legacyUnscoped;
  }
  state.activeAccountId = accountId;
  return state;
}

function normalizeSyncState(value: LegacyCollectionSyncState | undefined): CollectionSyncState {
  const legacyMappings = {
    ...value?.mappings,
    ...value?.legacyUnscoped?.mappings,
  };
  const legacyDeletes = Array.from(new Map([
    ...(value?.pendingDeletes || []),
    ...(value?.legacyUnscoped?.pendingDeletes || []),
  ].map(item => [item.mutationId, item])).values());
  const legacyUnscoped = Object.keys(legacyMappings).length > 0 || legacyDeletes.length > 0
    ? { mappings: legacyMappings, pendingDeletes: legacyDeletes }
    : undefined;
  return {
    key: 'state',
    clientId: value?.clientId || crypto.randomUUID(),
    activeAccountId: value?.activeAccountId,
    cursors: value?.cursors || {},
    mergeDecisions: value?.mergeDecisions || {},
    mappingsByAccount: value?.mappingsByAccount || {},
    pendingDeletesByAccount: value?.pendingDeletesByAccount || {},
    acknowledgedUpsertsByAccount: value?.acknowledgedUpsertsByAccount || {},
    legacyUnscoped,
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbEnsureCardLocalId(imageUrl: string): Promise<string | undefined> {
  const db = await openDB();
  const tx = db.transaction(CARD_STORE, 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  const existing = await requestResult<CardRecord | undefined>(store.get(imageUrl));
  if (!existing) {
    await transactionDone(tx);
    return undefined;
  }
  const localId = existing.localId || crypto.randomUUID();
  if (!existing.localId) store.put({ ...existing, localId });
  await transactionDone(tx);
  return localId;
}

export async function dbEnsureGridLocalId(gridId: string): Promise<string | undefined> {
  const db = await openDB();
  const tx = db.transaction(GRID_STORE, 'readwrite');
  const store = tx.objectStore(GRID_STORE);
  const existing = await requestResult<GridRecord | undefined>(store.get(gridId));
  if (!existing) {
    await transactionDone(tx);
    return undefined;
  }
  const localId = existing.localId || crypto.randomUUID();
  if (!existing.localId) store.put({ ...existing, localId });
  await transactionDone(tx);
  return localId;
}

export async function dbSaveGridMediaRecovery(
  gridId: string,
  mediaRecovery: CollectionMediaRecovery,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(GRID_STORE, 'readwrite');
  const store = tx.objectStore(GRID_STORE);
  const existing = await requestResult<GridRecord | undefined>(store.get(gridId));
  if (!existing) {
    await transactionDone(tx);
    return;
  }
  store.put({ ...existing, mediaRecovery });
  await transactionDone(tx);
}

export async function dbReplaceGridImage(
  gridId: string,
  media: MediaReference,
  mediaRecovery?: CollectionMediaRecovery,
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(GRID_STORE, 'readwrite');
  const store = tx.objectStore(GRID_STORE);
  const existing = await requestResult<GridRecord | undefined>(store.get(gridId));
  if (!existing) {
    await transactionDone(tx);
    return;
  }
  const images = existing.images.map((image, index) => index === 0
    ? { ...image, imageUrl: media.deliveryUrl, media }
    : image);
  store.put({
    ...existing,
    images,
    media,
    ...(mediaRecovery ? { mediaRecovery } : {}),
  });
  await transactionDone(tx);
}
