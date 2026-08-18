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
