import type React from 'react';
import type { StarOfDayData } from '../../hooks/useStarOfDay';
import { useExportCard } from '../../hooks/useExportCard';
import { Toast } from '../Toast/Toast';
import { useLocale } from '../../i18n/LocaleProvider';
import styles from './ExportButton.module.css';

interface ExportButtonProps {
  rawData: StarOfDayData;
  onShareComplete?: () => void;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ rawData, onShareComplete }) => {
  const { t } = useLocale();
  const {
    exportCard,
    handoffForPublishing,
    isExporting,
    imagesReady,
    toastMessage,
    dismissToast,
  } = useExportCard(rawData);

  const handleShare = () => {
    void exportCard('full', 'share').then(outcome => {
      if (outcome === 'shared') onShareComplete?.();
    });
  };
  const handleDownload = () => { void exportCard('full', 'download'); };
  const handlePublishingHandoff = () => {
    void handoffForPublishing().then(outcome => {
      if (outcome === 'shared') onShareComplete?.();
    });
  };

  return (
    <>
      <div className={styles.exportActions}>
        <button
          className={styles.exportButton}
          onClick={handleShare}
          disabled={isExporting || !imagesReady}
          aria-label={t('Share Spell Sheet', '分享氛围卡')}
        >
          {t('Share Spell Sheet', '分享氛围卡')}
          <span className={styles.enHelper}>{t('Finished collectible with copy and visual treatment', '已完成的收藏卡，包含文案与视觉设计')}</span>
        </button>
        <button
          className={styles.downloadButton}
          onClick={handleDownload}
          disabled={isExporting || !imagesReady}
          aria-label={t('Download Spell Sheet as PNG', '下载氛围卡 PNG 图片')}
        >
          {t('Download Spell Sheet', '下载氛围卡')}
          <span className={styles.enHelper}>{t('Finished collectible PNG', '已完成的收藏卡 PNG 图片')}</span>
        </button>
        <button
          className={styles.handoffButton}
          onClick={handlePublishingHandoff}
          disabled={isExporting || !imagesReady}
          aria-label={t('Handoff Publishing Grid', '移交发布用九宫格')}
        >
          {t('Handoff Publishing Grid', '移交发布用九宫格')}
          <span className={styles.enHelper}>{t('Only the 3×3 images · no copy or styling', '仅含 3×3 图片 · 不含文案或设计')}</span>
        </button>
        <p className={styles.autoSaveNote}>
          {isExporting
            ? t('Preparing all nine images…', '正在准备九张原图……')
            : imagesReady
              ? t('Spell Sheet and Publishing Grid are different files. Either action preserves the Collection Grid.', '氛围卡与发布用九宫格是不同文件。任一操作都会保留收藏中的九宫格。')
              : t('Waiting for all nine images; placeholders are blocked', '等待九张原图全部加载；不会导出占位图')}
        </p>
      </div>
      {toastMessage && <Toast message={toastMessage} onClose={dismissToast} />}
    </>
  );
};
