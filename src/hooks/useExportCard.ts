import { useState, useCallback, useEffect } from 'react';
import type { StarOfDayData } from './useStarOfDay';
import {
  areExportImagesReady,
  buildExportPayload,
  classifyEditionTier,
  downloadShareCard,
  exportShareCard,
  prepareShareCard,
  type ExportAction,
  type ExportVariant,
} from '../utils/exportCanvas';
import { dbSaveGrid } from '../utils/collectionDB';
import { collectionGridFromStar } from '../utils/collectionHistory';
import { schedulePublicCollectionSync } from '../utils/publicAccount';
import { notifyGridExportPersisted, uploadExportedCard } from '../utils/gridExportLog';
import { translate } from '../i18n/locale';
import { trackDailyParticipationStage } from '../utils/dailyParticipation';

export interface UseExportCardReturn {
  exportCard: (
    variant?: ExportVariant,
    action?: ExportAction,
  ) => Promise<'shared' | 'downloaded' | false>;
  handoffForPublishing: () => Promise<'shared' | false>;
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
    if (isExporting) return false;
    setIsExporting(true);
    setError(null);
    setToastMessage(translate('Preparing share card…', '正在生成分享卡……'));

    try {
      // Pre-compute the grid so the same id is used for both dbSaveGrid and the upload.
      const grid = collectionGridFromStar(data);
      const onBlob = (blob: Blob) => {
        // Fire-and-forget: upload the rendered PNG for durable server-side storage so
        // the card appears in the Collection "Past exports" list like any other export.
        const tier = classifyEditionTier(buildExportPayload(data).chosen);
        void uploadExportedCard(grid.id, crypto.randomUUID(), blob, variant, tier)
          .then((persisted) => {
            if (persisted) notifyGridExportPersisted(grid.id);
          });
      };
      const exportResult = action === 'download'
        ? {
            message: await downloadShareCard(data, variant, onBlob),
            outcome: 'downloaded' as const,
          }
        : await exportShareCard(data, variant, onBlob);
      // Daily-flow note: saving the grid is intentionally coupled to export here.
      // This differs from the Grid Builder, where Save and Export are distinct actions.
      // In the daily flow there is no separate "Save grid" step — the user exports a
      // single star-of-day card and the resulting GridRecord is written automatically
      // so the card appears in their collection history without a second tap.
      await dbSaveGrid(grid);
      trackDailyParticipationStage('grid_preserved');
      schedulePublicCollectionSync();
      // Law #2 Daily exception: auto-save is allowed here, but it must be visible.
      setToastMessage(`${exportResult.message} · ${translate('Added to collection history', '已加入收藏记录')}`);
      return exportResult.outcome;
    } catch (err) {
      const msg = err instanceof Error ? err.message : translate('Could not prepare the share card. Try again.', '分享卡生成失败，请重试。');
      setError(msg);
      setToastMessage(msg);
      return false;
    } finally {
      setIsExporting(false);
    }
  }, [data, isExporting]);

  const handoffForPublishing = useCallback(async () => {
    if (isExporting) return false;
    setIsExporting(true);
    setError(null);
    setToastMessage(translate('Preparing raw publishing grid…', '正在准备发布交接……'));
    let objectUrl = '';

    try {
      const grid = collectionGridFromStar(data);
      const artifact = await prepareShareCard(data, 'raw', blob => {
        const tier = classifyEditionTier(buildExportPayload(data).chosen);
        void uploadExportedCard(grid.id, crypto.randomUUID(), blob, 'raw', tier);
      });
      objectUrl = artifact.objectUrl;
      const shareData: ShareData = { files: [artifact.file] };
      if (
        typeof navigator.share !== 'function'
        || typeof navigator.canShare !== 'function'
        || !navigator.canShare(shareData)
      ) {
        throw new Error(translate('Native file sharing is unavailable here. Use Download Spell Sheet instead.', '此浏览器不支持文件分享，请改用下载。'));
      }
      await navigator.share(shareData);
      await dbSaveGrid(grid);
      trackDailyParticipationStage('grid_preserved');
      schedulePublicCollectionSync();
      setToastMessage(
        translate('Publishing handoff opened with the Publishing Grid · The editable Collection Grid is preserved', '已打开发布交接，可编辑的收藏九宫格仍保留。'),
      );
      return 'shared';
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'AbortError'
        ? translate('Publishing handoff cancelled. Nothing was downloaded.', '已取消发布交接，未下载任何文件。')
        : err instanceof Error
          ? err.message
          : translate('The publishing handoff could not be opened.', '无法打开发布交接。');
      setError(msg);
      setToastMessage(msg);
      return false;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setIsExporting(false);
    }
  }, [data, isExporting]);

  return {
    exportCard,
    handoffForPublishing,
    isExporting,
    error,
    toastMessage,
    imagesReady,
    dismissToast,
  };
}
