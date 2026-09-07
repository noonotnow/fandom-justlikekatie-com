import type {
  CardRecord,
  CollectionSyncState,
  GridRecord,
} from './collectionDB';

export interface CollectionDiagnostic {
  schemaVersion: 1;
  exportedAt: string;
  accountId?: string;
  counts: {
    cards: number;
    grids: number;
  };
  cards: CardRecord[];
  grids: GridRecord[];
  syncState: CollectionSyncState;
}

export function createCollectionDiagnostic(
  cards: CardRecord[],
  grids: GridRecord[],
  syncState: CollectionSyncState,
  exportedAt = new Date(),
  accountId?: string,
): CollectionDiagnostic {
  return {
    schemaVersion: 1,
    exportedAt: exportedAt.toISOString(),
    ...(accountId ? { accountId } : {}),
    counts: {
      cards: cards.length,
      grids: grids.length,
    },
    cards,
    grids,
    syncState,
  };
}
