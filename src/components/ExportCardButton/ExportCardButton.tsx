import { useState, useCallback } from 'react';
import type { GridItemData, ImageTier } from '../../types';
import type { StarOfDayData } from '../../hooks/useStarOfDay';
import { renderCard, type CardMetadata } from '../../utils/cardRenderer';
import { recordCardEvent } from '../../utils/cardMetrics';
import { Toast } from '../Toast/Toast';
import styles from './ExportCardButton.module.css';

export interface ExportCardMetadata {
  actorName: string;
  vibeEmoji: string;
  vibeLabel: string;
  vibeLabelEn: string;
  date: string;
  accentColor?: string;
  tier?: ImageTier;
}

interface ExportCardButtonProps {
  image: GridItemData;
  metadata: ExportCardMetadata;
  planData?: StarOfDayData;
}

export const ExportCardButton: React.FC<ExportCardButtonProps> = ({ image, metadata }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setToastMessage('正在生成卡片……');

    try {
      const cardMeta: CardMetadata = {
        actorName: metadata.actorName,
        vibeEmoji: metadata.vibeEmoji,
        vibeLabel: metadata.vibeLabel,
        vibeLabelEn: metadata.vibeLabelEn,
        date: metadata.date,
        imageUrl: image.thumbnail,
        accentColor: metadata.accentColor,
        tier: metadata.tier,
      };

      const blob = await renderCard(cardMeta);

      // Build filename
      const actorSlug = metadata.actorName
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'star';
      const fileName = `vibe-atlas-${actorSlug}-${metadata.date}.png`;

      // Download
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);

      // Track the export (fire-and-forget). Keyed on the image's stable id
      // rather than a name+date composite, so counts accumulate across days
      // instead of starting fresh every board.
      recordCardEvent({
        event: 'export',
        cardId: image.id,
        subjectType: 'image',
        batchKey: image.batchKey,
        actor: metadata.actorName,
        vibe: metadata.vibeLabel,
        capturedDate: metadata.date,
      });

      setToastMessage('卡片已保存 ✓ Card exported!');
    } catch (err) {
      console.error('Export card failed:', err);
      setToastMessage('导出失败，请重试 · Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, image, metadata]);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  return (
    <>
      <button
        className={styles.exportCardBtn}
        onClick={handleExport}
        disabled={isExporting}
        aria-label="Export individual card"
      >
        <span className={styles.icon}>📥</span>
        <span className={styles.label}>导出卡片</span>
      </button>
      {toastMessage && <Toast message={toastMessage} onClose={dismissToast} />}
    </>
  );
};
