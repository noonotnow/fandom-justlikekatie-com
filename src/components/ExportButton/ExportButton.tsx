import type React from 'react';
import type { StarOfDayData } from '../../hooks/useStarOfDay';
import { useExportCard } from '../../hooks/useExportCard';
import { Toast } from '../Toast/Toast';
import styles from './ExportButton.module.css';

interface ExportButtonProps {
  rawData: StarOfDayData;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ rawData }) => {
  const { exportCard, isExporting, toastMessage, dismissToast } = useExportCard();

  const handleClick = () => {
    exportCard(rawData, 'full');
  };

  return (
    <>
      <button
        className={styles.exportButton}
        onClick={handleClick}
        disabled={isExporting}
        aria-label="Export full share card"
      >
        📤 导出完整分享卡
        <span className={styles.enHelper}>Export full share card</span>
      </button>
      {toastMessage && <Toast message={toastMessage} onClose={dismissToast} />}
    </>
  );
};
