/** IndexedDB persistence for the content plan queue */

import { recordCardEvent } from './cardMetrics.ts';

const DB_NAME = 'vibe-atlas-plan';
const DB_VERSION = 1;
const STORE_NAME = 'plan';

export interface PlanRecord {
  imageUrl: string;
  thumbnailUrl: string;
  actor: string;
  actorEn: string;
  vibe: string;
  vibeEn: string;
  vibeEmoji: string;
  capturedDate: string;
  series?: string;
  addedAt: string;
  order: number;
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

export async function dbGetAllPlanItems(): Promise<PlanRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const all = req.result as PlanRecord[];
      all.sort((a, b) => a.order - b.order);
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbAddToPlan(
  card: Omit<PlanRecord, 'addedAt' | 'order'>
): Promise<void> {
  const existing = await dbGetAllPlanItems();
  if (existing.find((r) => r.imageUrl === card.imageUrl)) return; // dedupe
  const maxOrder = existing.length > 0 ? Math.max(...existing.map((r) => r.order)) : -1;
  const record: PlanRecord = {
    ...card,
    addedAt: new Date().toISOString(),
    order: maxOrder + 1,
  };
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      recordCardEvent({
        event: 'plan_add',
        cardId: card.imageUrl,
        subjectType: 'image',
        actor: card.actor,
        vibe: card.vibe,
        batchKey: card.gridContext?.batchKey,
        capturedDate: card.capturedDate,
      });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbRemoveFromPlan(imageUrl: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(imageUrl);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbIsInPlan(imageUrl: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(imageUrl);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror = () => reject(req.error);
  });
}
