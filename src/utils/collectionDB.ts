/** IndexedDB persistence for saved cards */

const DB_NAME = 'vibe-atlas-collection';
const DB_VERSION = 3;
const CARD_STORE = 'cards';
const GRID_STORE = 'grids';
const SYNC_STORE = 'sync';

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
  gridContext?: {
    batchKey?: string;
    position: number;
  };
}

export interface GridMediaSnapshot {
  resultId: string;
  imageUrl: string;
  sourceUrl: string;
  title: string;
  publisher?: string;
  batchKey?: string;
  gridPosition: number;
}

export interface GridRecord {
  id: string;
  actorId: string;
  actor: string;
  actorEn: string;
  vibe: string;
  vibeEn: string;
  vibeEmoji: string;
  capturedDate: string;
  generatedAt: string;
  savedAt: string;
  sourceRoute: string;
  images: GridMediaSnapshot[];
  legacyCompositeUrl?: string;
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
  const existing = await dbGetCard(card.imageUrl);
  const record = {
    ...card,
    localId: card.localId || existing?.localId || crypto.randomUUID(),
    savedAt: card.savedAt || new Date().toISOString(),
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
  const existing = await dbGetCard(imageUrl);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([CARD_STORE, SYNC_STORE], 'readwrite');
    tx.objectStore(CARD_STORE).delete(imageUrl);
    if (existing?.localId) {
      const syncStore = tx.objectStore(SYNC_STORE);
      const req = syncStore.get('state');
      req.onsuccess = () => {
        const state = normalizeSyncState(req.result);
        const accountId = resolveDeleteAccount(existing, state);
        const serverId = accountId ? state.mappingsByAccount[accountId]?.[existing.localId!] : undefined;
        if (!accountId || !serverId) return;
        const pending = state.pendingDeletesByAccount[accountId] || [];
        pending.push({
          mutationId: crypto.randomUUID(),
          localId: existing.localId!,
          serverId,
        });
        state.pendingDeletesByAccount[accountId] = pending;
        syncStore.put(state);
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function resolveDeleteAccount(
  card: CardRecord,
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

export interface CollectionSyncState {
  key: 'state';
  clientId: string;
  activeAccountId?: string;
  cursors: Record<string, number>;
  mergeDecisions: Record<string, boolean>;
  mappingsByAccount: Record<string, Record<string, string>>;
  pendingDeletesByAccount: Record<string, Array<{ mutationId: string; localId: string; serverId: string }>>;
  acknowledgedUpsertsByAccount: Record<string, Record<string, string>>;
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
  const state = await dbGetSyncState();
  state.activeAccountId = accountId;
  await dbPutSyncState(state);
}

export async function dbBuildSyncRequest(accountId: string): Promise<CollectionSyncRequest> {
  const [loadedCards, state] = await Promise.all([dbGetAllCards(), dbGetSyncState()]);
  const cards = await ensureLocalIds(loadedCards);
  return {
    schemaVersion: 1,
    clientId: state.clientId,
    expectedAccountId: accountId,
    cursor: state.cursors[accountId] || 0,
    operations: buildSyncOperations(cards, state, accountId).slice(0, 100),
  };
}

export function buildSyncOperations(
  cards: CardRecord[],
  state: CollectionSyncState,
  accountId: string,
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
      const mutationId = `upsert:${state.clientId}:${localId}:${card.savedAt || card.capturedDate}`;
      return {
        type: 'upsert',
        mutationId,
        localId,
        item: {
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
        },
      };
    })
    .filter(operation => acknowledged[operation.localId] !== operation.mutationId);
  return [...deletes, ...upserts];
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
  const byLocalId = new Map(cards.map(card => [card.localId, card]));
  const byServerId = new Map(cards.map(card => [card.serverId, card]));
  const tx = db.transaction([CARD_STORE, SYNC_STORE], 'readwrite');
  const cardStore = tx.objectStore(CARD_STORE);
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
    const existing = byServerId.get(serverId) || byLocalId.get(localId);
    const record = {
      ...(item as unknown as CardRecord),
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
  }
  tx.objectStore(SYNC_STORE).put(state);
  await transactionDone(tx);
}

export async function dbRemoveAccountCache(accountId: string): Promise<void> {
  const cards = await dbGetAllCards();
  const db = await openDB();
  const tx = db.transaction(CARD_STORE, 'readwrite');
  const store = tx.objectStore(CARD_STORE);
  for (const card of cards) {
    if (card.ownerAccountId === accountId) store.delete(card.imageUrl);
  }
  await transactionDone(tx);
}

export async function dbSaveGrid(grid: GridRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GRID_STORE, 'readwrite');
    tx.objectStore(GRID_STORE).put(grid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetAllGrids(): Promise<GridRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GRID_STORE, 'readonly');
    const req = tx.objectStore(GRID_STORE).getAll();
    req.onsuccess = () => resolve(req.result as GridRecord[]);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetCard(imageUrl: string): Promise<CardRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(CARD_STORE, 'readonly').objectStore(CARD_STORE).get(imageUrl);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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

function normalizeSyncState(value: Partial<CollectionSyncState> | undefined): CollectionSyncState {
  const legacy = value as Partial<CollectionSyncState> & {
    mappings?: Record<string, string>;
    pendingDeletes?: Array<{ mutationId: string; localId: string; serverId: string }>;
  };
  const activeAccountId = value?.activeAccountId;
  return {
    key: 'state',
    clientId: value?.clientId || crypto.randomUUID(),
    activeAccountId,
    cursors: value?.cursors || {},
    mergeDecisions: value?.mergeDecisions || {},
    mappingsByAccount: value?.mappingsByAccount || (
      activeAccountId && legacy.mappings ? { [activeAccountId]: legacy.mappings } : {}
    ),
    pendingDeletesByAccount: value?.pendingDeletesByAccount || (
      activeAccountId && legacy.pendingDeletes ? { [activeAccountId]: legacy.pendingDeletes } : {}
    ),
    acknowledgedUpsertsByAccount: value?.acknowledgedUpsertsByAccount || {},
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
