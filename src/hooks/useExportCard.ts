import { useState, useCallback, useEffect } from 'react';
import type { StarOfDayData } from './useStarOfDay';
import {
  areExportImagesReady,
  buildExportPayload,
  classifyEditionTier,
  downloadShareCard,
  exportShareCard,
  type ExportAction,
  type ExportVariant,
} from '../utils/exportCanvas';
import { dbSaveGrid } from '../utils/collectionDB';
import { collectionGridFromStar } from '../utils/collectionHistory';
import { schedulePublicCollectionSync } from '../utils/publicAccount';
import { uploadExportedCard } from '../utils/gridExportLog';

export interface UseExportCardReturn {
  exportCard: (variant?: ExportVariant, action?: ExportAction) => Promise<void>;
  isExporting: boolean;
  error: string | null;
  toastMessage: string | null;
  imagesReady: boolean;
  dismissToast: () => void;
}

export function useExportCard(data: StarOfDayData): UseExportCardReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [imagesReady, setImagesReady] = useState(false);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  useEffect(() => {
    let active = true;
    setImagesReady(false);
    void areExportImagesReady(data, 'full').then((ready) => {
      if (active) setImagesReady(ready);
    });
    return () => { active = false; };
  }, [data]);

  const exportCard = useCallback(async (
    variant: ExportVariant = 'full',
    action: ExportAction = 'share',
  ) => {
    if (isExporting) return;
    setIsExporting(true);
    setError(null);
    setToastMessage('正在生成分享卡……');

    try {
      // Pre-compute the grid so the same id is used for both dbSaveGrid and the upload.
      const grid = collectionGridFromStar(data);
      const exportFn = action === 'download' ? downloadShareCard : exportShareCard;
      const msg = await exportFn(data, variant, (blob) => {
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
  }, [data, isExporting]);

  return { exportCard, isExporting, error, toastMessage, imagesReady, dismissToast };
}
