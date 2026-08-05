/** IndexedDB persistence for saved cards */

const DB_NAME = 'vibe-atlas-collection';
const DB_VERSION = 2;
const CARD_STORE = 'cards';
const GRID_STORE = 'grids';

export interface CardRecord {
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbSaveCard(card: CardRecord): Promise<void> {
  const db = await openDB();
  const record = { ...card, savedAt: new Date().toISOString() };
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CARD_STORE, 'readwrite');
    tx.objectStore(CARD_STORE).delete(imageUrl);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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
