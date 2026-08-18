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
