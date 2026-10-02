import { useState, useCallback } from 'react';
import type { GridItemData, ImageTier } from '../../types';
import type { StarOfDayData } from '../../hooks/useStarOfDay';
import { renderCard, type CardMetadata } from '../../utils/cardRenderer';
import { Toast } from '../Toast/Toast';
import { useLocale } from '../../i18n/LocaleProvider';
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
  const { t } = useLocale();
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setToastMessage(t('Preparing card…', '正在生成卡片……'));

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

      // Log engagement (fire-and-forget)
      fetch('/.netlify/functions/log-engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'export',
          batchKey: `${metadata.actorName}-${metadata.vibeLabel}-${metadata.date}`,
          imageUrl: image.id,
        }),
      }).catch(() => { /* non-critical */ });

      setToastMessage(t('Card exported!', '卡片已导出！'));
    } catch (err) {
      console.error('Export card failed:', err);
      setToastMessage(t('Export failed. Try again.', '导出失败，请重试。'));
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, image, metadata, t]);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  return (
    <>
      <button
        className={styles.exportCardBtn}
        onClick={handleExport}
        disabled={isExporting}
        aria-label={t('Export individual card', '导出单张卡片')}
      >
        <span className={styles.icon}>📥</span>
        <span className={styles.label}>{t('Export card', '导出卡片')}</span>
      </button>
      {toastMessage && <Toast message={toastMessage} onClose={dismissToast} />}
    </>
  );
};
