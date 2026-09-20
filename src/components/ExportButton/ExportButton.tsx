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
          aria-label="Share styled Fandom card"
        >
          Share styled card
          <span className={styles.enHelper}>Includes copy and visual treatment</span>
        </button>
        <button
          className={styles.downloadButton}
          onClick={handleDownload}
          disabled={isExporting || !imagesReady}
          aria-label="Download styled Fandom card as PNG"
        >
          Download styled card
          <span className={styles.enHelper}>PNG with copy and visual treatment</span>
        </button>
        <button
          className={styles.handoffButton}
          onClick={handlePublishingHandoff}
          disabled={isExporting || !imagesReady}
          aria-label="Handoff raw three-by-three grid for publishing"
        >
          Handoff raw grid for publishing
          <span className={styles.enHelper}>Only the 3×3 images · no copy or styling</span>
        </button>
        <p className={styles.autoSaveNote}>
          {isExporting
            ? '正在准备九张原图…… · Preparing all nine images…'
            : imagesReady
              ? 'Styled card and raw publishing grid are different files. Either action preserves the grid in Collection.'
              : '等待九张原图全部加载；不会导出占位图 · Waiting for all nine images; placeholders are blocked'}
        </p>
      </div>
      {toastMessage && <Toast message={toastMessage} onClose={dismissToast} />}
    </>
  );
};
