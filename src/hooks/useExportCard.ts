import { useState, useCallback } from 'react';
import type { StarOfDayData } from './useStarOfDay';
import { saveShareCard, buildExportPayload, classifyEditionTier, type ExportVariant } from '../utils/exportCanvas';
import { dbSaveGrid } from '../utils/collectionDB';
import { collectionGridFromStar } from '../utils/collectionHistory';
import { schedulePublicCollectionSync } from '../utils/publicAccount';
import { uploadExportedCard } from '../utils/gridExportLog';

export interface UseExportCardReturn {
  exportCard: (data: StarOfDayData, variant?: ExportVariant) => Promise<void>;
  isExporting: boolean;
  error: string | null;
  toastMessage: string | null;
  dismissToast: () => void;
}

export function useExportCard(): UseExportCardReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  const exportCard = useCallback(async (data: StarOfDayData, variant: ExportVariant = 'full') => {
    if (isExporting) return;
    setIsExporting(true);
    setError(null);
    setToastMessage('正在生成分享卡……');

    try {
      // Pre-compute the grid so the same id is used for both dbSaveGrid and the upload.
      const grid = collectionGridFromStar(data);
      const msg = await saveShareCard(data, variant, (blob) => {
        // Fire-and-forget: upload the rendered PNG for durable server-side storage so
        // the card appears in the Collection "Past exports" list like any other export.
        const tier = classifyEditionTier(buildExportPayload(data).chosen);
        void uploadExportedCard(grid.id, crypto.randomUUID(), blob, variant, tier);
      });
      // Daily-flow note: saving the grid is intentionally coupled to export here.
      // This differs from the Grid Builder, where Save and Export are distinct actions.
      // In the daily flow there is no separate "Save grid" step — the user exports a
      // single star-of-day card and the resulting GridRecord is written automatically
      // so the card appears in their collection history without a second tap.
      await dbSaveGrid(grid);
      schedulePublicCollectionSync();
      // Law #2 Daily exception: auto-save is allowed here, but it must be visible.
      setToastMessage(`${msg} · 已加入收藏记录 Added to collection history`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '分享卡生成失败，再试一次？';
      setError(msg);
      setToastMessage(msg);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  return { exportCard, isExporting, error, toastMessage, dismissToast };
}
