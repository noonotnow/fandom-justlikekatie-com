/** IndexedDB persistence for saved cards */

const DB_NAME = 'vibe-atlas-collection';
const DB_VERSION = 1;
const STORE_NAME = 'cards';

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
  gridContext?: {
    batchKey?: string;
    position: number;
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'imageUrl' });
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
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbRemoveCard(imageUrl: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(imageUrl);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbIsCardSaved(imageUrl: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(imageUrl);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAllCards(): Promise<CardRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
