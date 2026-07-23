import { useState, useCallback } from 'react';
import type { GridItemData } from '../../types';
import { renderCard, type CardMetadata } from '../../utils/cardRenderer';
import { Toast } from '../Toast/Toast';
import styles from './ExportCardButton.module.css';

export interface ExportCardMetadata {
  actorName: string;
  vibeEmoji: string;
  vibeLabel: string;
  vibeLabelEn: string;
  date: string;
  accentColor?: string;
}

interface ExportCardButtonProps {
  image: GridItemData;
  metadata: ExportCardMetadata;
}

export const ExportCardButton: React.FC<ExportCardButtonProps> = ({ image, metadata }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [planToast, setPlanToast] = useState<string | null>(null);

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

      setToastMessage('卡片已保存 ✓ Card exported!');
    } catch (err) {
      console.error('Export card failed:', err);
      setToastMessage('导出失败，请重试 · Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, image, metadata]);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  const handlePlan = useCallback(() => {
    setPlanToast('已加入计划 ✓ Added to plan!');
  }, []);

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
      <button
        className={styles.exportCardBtn}
        onClick={handlePlan}
        aria-label="Send to plan"
      >
        <span className={styles.icon}>📋</span>
        <span className={styles.label}>加入计划</span>
      </button>
      {planToast && <Toast message={planToast} onClose={() => setPlanToast(null)} />}
    </>
  );
};
