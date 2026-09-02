import type React from 'react';
import type { StarOfDayData } from '../../hooks/useStarOfDay';
import { useExportCard } from '../../hooks/useExportCard';
import { Toast } from '../Toast/Toast';
import styles from './ExportButton.module.css';

interface ExportButtonProps {
  rawData: StarOfDayData;
  onShareComplete?: () => void;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ rawData, onShareComplete }) => {
  const { exportCard, isExporting, imagesReady, toastMessage, dismissToast } = useExportCard(rawData);

  const handleShare = () => {
    void exportCard('full', 'share').then(outcome => {
      if (outcome === 'shared') onShareComplete?.();
    });
  };
  const handleDownload = () => { void exportCard('full', 'download'); };

  return (
    <>
      <div className={styles.exportActions}>
        <button
          className={styles.exportButton}
          onClick={handleShare}
          disabled={isExporting || !imagesReady}
          aria-label="Share or copy full image"
        >
          📤 Share / Copy image
          <span className={styles.enHelper}>原生分享 / Copy image</span>
        </button>
        <button
          className={styles.downloadButton}
          onClick={handleDownload}
          disabled={isExporting || !imagesReady}
          aria-label="Download full PNG"
        >
          ⬇️ Download PNG
          <span className={styles.enHelper}>下载 PNG</span>
        </button>
      </div>
      <p className={styles.autoSaveNote}>
        {isExporting
          ? '正在准备九张原图…… · Preparing all nine images…'
          : imagesReady
            ? '九张原图已就绪 · All nine images loaded'
            : '等待九张原图全部加载；不会导出占位图 · Waiting for all nine images; placeholders are blocked'}
      </p>
      {toastMessage && <Toast message={toastMessage} onClose={dismissToast} />}
    </>
  );
};
