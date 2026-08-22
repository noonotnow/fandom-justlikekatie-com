/**
 * Persistence logic for Collection item removals.
 *
 * Extracted into a standalone module (no React/CSS deps) so it can be
 * imported and tested directly in the Node test environment.
 */

import { dbRemoveCard, dbRemoveGrid, type CardRecord, type GridRecord } from './collectionDB';
import { deleteGridExports } from './gridExportLog';
import { schedulePublicCollectionSync } from './publicAccount';

export type PendingRemoval =
  | { token: string; kind: 'grid'; record: GridRecord; timeoutId: number }
  | { token: string; kind: 'card'; record: CardRecord; timeoutId: number };

const PENDING_REMOVAL_KEY = 'fandom-pending-collection-removal';

type StoredPendingRemoval = {
  token: string;
  kind: PendingRemoval['kind'];
  record: GridRecord | CardRecord;
  accountId?: string;
};

/**
 * Record a removal intent before the asynchronous IndexedDB delete starts.
 * The marker survives a page reload, allowing the next Collection mount to
 * finish a removal whose promise was interrupted by browser teardown.
 */
export function rememberPendingRemoval(pending: PendingRemoval, accountId?: string): void {
  const stored: StoredPendingRemoval = {
    token: pending.token,
    kind: pending.kind,
    record: pending.record,
    ...(accountId ? { accountId } : {}),
  };
  localStorage.setItem(PENDING_REMOVAL_KEY, JSON.stringify(stored));
}

export function readPendingRemoval(): { pending: PendingRemoval; accountId?: string } | null {
  const serialized = localStorage.getItem(PENDING_REMOVAL_KEY);
  if (!serialized) return null;

  try {
    const stored = JSON.parse(serialized) as Partial<StoredPendingRemoval>;
    if (
      typeof stored.token !== 'string'
      || (stored.kind !== 'grid' && stored.kind !== 'card')
      || !stored.record
    ) {
      localStorage.removeItem(PENDING_REMOVAL_KEY);
      return null;
    }
    return {
      pending: {
        token: stored.token,
        kind: stored.kind,
        record: stored.record as GridRecord & CardRecord,
        timeoutId: 0,
      } as PendingRemoval,
      ...(typeof stored.accountId === 'string' ? { accountId: stored.accountId } : {}),
    };
  } catch {
    localStorage.removeItem(PENDING_REMOVAL_KEY);
    return null;
  }
}

export function forgetPendingRemoval(token: string): void {
  const stored = readPendingRemoval();
  if (stored?.pending.token === token) localStorage.removeItem(PENDING_REMOVAL_KEY);
}

/**
 * Commit a queued removal to the local database and clean up any server-side
 * exports.  Called when the undo window expires or the component unmounts.
 *
 * For grid removals:
 *   1. Deletes the local IndexedDB record via dbRemoveGrid.
 *   2. Issues a best-effort DELETE to the grid-exports function so server
 *      blobs are removed.  Failure queues the (gridId, accountId) pair for
 *      durable retry on next app activity; it never blocks or fails the
 *      local removal.
 *
 * For card removals the server carries no exports, so only the local record
 * is deleted.
 *
 * Never throws — callers catch and surface errors to the UI.
 */
export async function persistRemoval(pending: PendingRemoval, accountId?: string): Promise<void> {
  if (pending.kind === 'grid') {
    await dbRemoveGrid(pending.record.id);
    // Best-effort server cleanup, awaited so navigation/unload can't cut the
    // request short.  Failure queues the (gridId, accountId) pair for durable
    // retry; it never blocks or fails the local removal.
    await deleteGridExports(pending.record.id, accountId).catch(() => {});
  } else {
    await dbRemoveCard(pending.record.imageUrl);
  }
  schedulePublicCollectionSync();
}
