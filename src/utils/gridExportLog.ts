import type { ExportVariant } from './exportCanvas';
import type { GridRecord } from './collectionDB';

/**
 * Fire-and-forget logging of a full 3×3 grid export (the main share card),
 * as opposed to single-card engagement. Captures the grid artifact itself:
 * which grid, which images, which vibe/spell, what edition tier and variant.
 *
 * Never throws and never blocks the export flow.
 */
export interface GridExportEvent {
  gridId: string;
  date: string;
  actorId: string;
  actor: string;
  actorEn: string;
  vibe: string;
  vibeEn: string;
  searchSpell: string;
  tier: string;
  variant: ExportVariant;
  imageIds: string[];
  /** Whether the grid was explicitly saved to the collection before this export. */
  gridWasSaved: boolean;
  ctaSeed?: string;
  /**
   * Set when the rendered PNG was also uploaded for durable server-side
   * storage; references the export event in the grid-exports blob store.
   */
  persistedExportId?: string;
}

export function gridExportEventFromRecord(
  grid: GridRecord,
  variant: ExportVariant,
  tier: string,
  gridWasSaved: boolean,
  persistedExportId?: string,
): GridExportEvent {
  return {
    gridId: grid.id,
    date: grid.capturedDate,
    actorId: grid.actorId,
    actor: grid.actor,
    actorEn: grid.actorEn,
    vibe: grid.vibe,
    vibeEn: grid.vibeEn,
    searchSpell: grid.searchSpell,
    tier,
    variant,
    imageIds: grid.images.map(image => image.resultId),
    gridWasSaved,
    ctaSeed: grid.ctaSeed,
    ...(persistedExportId ? { persistedExportId } : {}),
  };
}

export interface PersistedExportEntry {
  exportId: string;
  variant: ExportVariant;
  tier: string;
  bytes: number;
  exportedAt: string;
}

/**
 * Upload a rendered share-card PNG for durable server-side storage, keyed by
 * the saved grid and this export event.  Fire-and-forget by design: callers
 * must never await this on the export/download path, and it never throws —
 * a failed upload only means the card isn't re-downloadable later.
 */
export function uploadExportedCard(
  gridId: string,
  exportId: string,
  blob: Blob,
  variant: ExportVariant,
  tier: string,
): Promise<boolean> {
  const params = new URLSearchParams({ gridId, exportId, variant, tier });
  return fetch(`/.netlify/functions/grid-exports?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: blob,
  })
    .then(response => response.ok)
    .catch(() => false);
}

/** Fetch the persisted export history for a saved grid. */
export async function fetchExportHistory(gridId: string): Promise<PersistedExportEntry[]> {
  const response = await fetch(`/.netlify/functions/grid-exports?gridId=${encodeURIComponent(gridId)}`);
  if (!response.ok) throw new Error('Export history could not be loaded.');
  const data = await response.json();
  return Array.isArray(data?.exports) ? data.exports : [];
}

/** URL for re-downloading a persisted export without regenerating it. */
export function exportDownloadUrl(gridId: string, exportId: string): string {
  return `/.netlify/functions/grid-exports?gridId=${encodeURIComponent(gridId)}&exportId=${encodeURIComponent(exportId)}`;
}

/**
 * Durable retry queue for failed export cleanups.  When a DELETE fails
 * (network error or a 500 from a partial blob-delete failure), the gridId is
 * queued in localStorage so cleanup is retried on later app activity — the
 * local grid record is already gone by then, so without this queue a failed
 * cleanup would orphan the server blobs forever.
 */
const CLEANUP_QUEUE_KEY = 'fandom-export-cleanup-queue';

interface PendingCleanup {
  gridId: string;
  /** Account whose export namespace holds the blobs. */
  accountId: string;
}

function readCleanupQueue(): PendingCleanup[] {
  try {
    const raw = localStorage.getItem(CLEANUP_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is PendingCleanup =>
          typeof entry?.gridId === 'string' && typeof entry?.accountId === 'string')
      : [];
  } catch {
    return [];
  }
}

// No size cap: pending cleanups are never evicted — each entry is ~80 bytes
// and only exists while a cleanup remains undelivered.
function writeCleanupQueue(entries: PendingCleanup[]): void {
  try {
    localStorage.setItem(CLEANUP_QUEUE_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable — cleanup stays best-effort */
  }
}

function enqueueExportCleanup(gridId: string, accountId: string): void {
  const queue = readCleanupQueue();
  if (!queue.some(entry => entry.gridId === gridId && entry.accountId === accountId)) {
    writeCleanupQueue([...queue, { gridId, accountId }]);
  }
}

function dequeueExportCleanup(gridId: string, accountId: string): void {
  const queue = readCleanupQueue();
  const remaining = queue.filter(entry => !(entry.gridId === gridId && entry.accountId === accountId));
  if (remaining.length !== queue.length) writeCleanupQueue(remaining);
}

async function requestExportDeletion(gridId: string): Promise<boolean> {
  return fetch(`/.netlify/functions/grid-exports?gridId=${encodeURIComponent(gridId)}`, {
    method: 'DELETE',
  })
    .then(response => response.ok)
    .catch(() => false);
}

/**
 * Delete all persisted export blobs for a saved grid (called when the grid is
 * removed from the collection).  Never throws.  On failure the (gridId,
 * accountId) pair is queued durably and retried by
 * retryPendingExportCleanups() on later app activity under the same account,
 * so a transient failure cannot orphan the blobs forever.
 *
 * When no accountId is known there is no signed-in session, so no server
 * exports exist for the grid and nothing is queued.
 */
export async function deleteGridExports(gridId: string, accountId?: string): Promise<boolean> {
  const ok = await requestExportDeletion(gridId);
  if (!accountId) return ok;
  if (ok) dequeueExportCleanup(gridId, accountId);
  else enqueueExportCleanup(gridId, accountId);
  return ok;
}

/**
 * Retry queued export cleanups belonging to the currently signed-in account.
 * Server deletion is scoped to the authenticated account's namespace, so
 * entries queued under a different account are left untouched — a 200 from
 * the wrong account would be a no-op that must not dequeue the real work.
 * Successful deletions leave the queue; failures stay for the next attempt.
 */
export async function retryPendingExportCleanups(accountId?: string): Promise<void> {
  if (!accountId) return;
  for (const entry of readCleanupQueue()) {
    if (entry.accountId !== accountId) continue;
    const ok = await requestExportDeletion(entry.gridId);
    if (ok) dequeueExportCleanup(entry.gridId, entry.accountId);
  }
}

export function logGridExport(event: GridExportEvent): void {
  try {
    fetch('/.netlify/functions/log-engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'grid_export',
        batchKey: event.gridId,
        grid: event,
      }),
    }).catch(() => { /* non-critical */ });
  } catch {
    /* non-critical */
  }
}
