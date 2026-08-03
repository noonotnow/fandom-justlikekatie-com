import { useState, useCallback } from 'react';
import type { StarOfDayData } from './useStarOfDay';
import { saveShareCard, type ExportVariant } from '../utils/exportCanvas';

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
      const msg = await saveShareCard(data, variant);
      setToastMessage(msg);
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
