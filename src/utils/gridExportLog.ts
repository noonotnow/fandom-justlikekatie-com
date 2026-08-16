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
  ctaSeed?: string;
}

export function gridExportEventFromRecord(
  grid: GridRecord,
  variant: ExportVariant,
  tier: string,
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
    ctaSeed: grid.ctaSeed,
  };
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
