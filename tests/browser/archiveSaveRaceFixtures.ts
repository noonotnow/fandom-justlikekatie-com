import type { Page } from '@playwright/test';

/** Hold native IndexedDB callbacks, not elapsed time or simulated DB contents.
 * Transactions still commit/abort normally; releasing a read delivers its
 * original snapshot, allowing a deterministic stale-response regression.
 */
export async function installArchiveSaveGate(page: Page, imageKey: string): Promise<void> {
  await page.evaluate(`
    window.archiveSaveGate = {
      holdCommit: false, holdReads: false, failWrite: false,
      commits: [], reads: [], writes: 0,
      releaseCommits() { this.commits.splice(0).forEach(release => release()); },
      releaseReads() { this.reads.splice(0).forEach(release => release()); },
    };
    const gate = window.archiveSaveGate;
    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(...args) {
      const tx = originalTransaction.apply(this, args);
      if (this.name === 'vibe-atlas-collection'
          && tx.objectStoreNames.contains('cards') && tx.mode === 'readwrite') {
        Object.defineProperty(tx, 'oncomplete', {
          set(callback) {
            tx.addEventListener('complete', event => {
              if (gate.holdCommit) {
                gate.holdCommit = false;
                gate.commits.push(() => callback.call(tx, event));
              } else callback.call(tx, event);
            });
          },
        });
      }
      return tx;
    };
    const originalGet = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function(...args) {
      const request = originalGet.apply(this, args);
      if (this.name === 'cards' && this.transaction.mode === 'readonly'
          && args[0] === ${JSON.stringify(imageKey)}) {
        Object.defineProperty(request, 'onsuccess', {
          set(callback) {
            request.addEventListener('success', event => {
              if (gate.holdReads) gate.reads.push(() => callback.call(request, event));
              else callback.call(request, event);
            });
          },
        });
      }
      return request;
    };
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'cards' && args[0].imageUrl === ${JSON.stringify(imageKey)}) {
        gate.writes++;
        if (gate.failWrite) {
          this.transaction.abort();
          throw new Error('fixture local persistence failure');
        }
      }
      return originalPut.apply(this, args);
    };
  `);
}

export async function seedUnrelatedCard(page: Page): Promise<void> {
  // Add one unrelated durable record; never clear Collection data to set up a race.
  await page.evaluate(`import('/src/utils/collectionDB.ts').then(({ dbSaveCard }) => dbSaveCard({
    imageUrl: 'https://images.archive-save.test/unrelated.jpg',
    actor: 'Unrelated actor', actorEn: 'Unrelated actor',
    vibe: 'Unrelated vibe', vibeEn: 'Unrelated vibe', vibeEmoji: '🗂️',
    capturedDate: '2026-01-01', collectionScope: 'vibe-atlas',
  }))`);
}

export async function archiveSaveOutcomes(page: Page): Promise<string[]> {
  return page.evaluate(`window.archiveSaveEvents
    .filter(event => event.name === 'archive_card_save_outcome')
    .map(event => event.data.outcome)`);
}
