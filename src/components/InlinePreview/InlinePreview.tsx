import React, { useEffect, useRef } from 'react';
import { SaveButton } from '../SaveButton/SaveButton';
import type { SaveItemMetadata } from '../../hooks/useSaveItem';
import type { GridItemData } from '../../types';
import styles from './InlinePreview.module.css';
import { useLocale } from '../../i18n/LocaleProvider';
import { DailyImageReport } from '../Lightbox/DailyImageReport';

function isValidArchiveDate(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

interface InlinePreviewProps {
  item: GridItemData;
  isOpen: boolean;
  onClose: () => void;
  onViewFull: () => void;
  saveMetadata?: SaveItemMetadata;
  onSaveChange?: (saved: boolean) => void;
}

/**
 * Inline expanded preview that sits within the grid flow.
 * Shows a larger image, metadata, and a button to open the full lightbox.
 */
export const InlinePreview: React.FC<InlinePreviewProps> = ({
  item,
  isOpen,
  onClose,
  onViewFull,
  saveMetadata,
  onSaveChange,
}) => {
  const { t } = useLocale();
  const rowRef = useRef<HTMLDivElement>(null);
  const reportDate = item.archiveDate || saveMetadata?.date;
  const canReport = isValidArchiveDate(reportDate)
    && Boolean(saveMetadata?.actorName.trim())
    && Boolean(saveMetadata?.vibeLabel.trim());

  // Close on click-away
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay listener to avoid the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <div
      ref={rowRef}
      className={`${styles.previewRow} ${isOpen ? styles.previewRowOpen : ''}`}
      role="region"
      aria-label={`${t('Preview of', '预览：')} ${item.title}`}
      aria-hidden={!isOpen}
    >
      <div className={styles.arrow} />
      <div className={styles.previewContent}>
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t('Close preview', '关闭预览')}
        >
          ✕
        </button>

        <div className={styles.imageContainer}>
          <img
            className={styles.previewImage}
            src={item.thumbnail}
            alt={item.title}
          />
        </div>

        <div className={styles.details}>
          <h3 className={styles.title}>{item.title}</h3>
          {item.publisher && (
            <p className={styles.publisher}>{item.publisher}</p>
          )}

          {item.tags && item.tags.length > 0 && (
            <div className={styles.meta}>
              {item.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button className={styles.viewBtn} onClick={onViewFull}>
              {t('View Full Screen', '全屏查看')}
            </button>
            <SaveButton
              itemId={item.id}
              archiveDate={item.archiveDate}
              archiveImageId={item.archiveImageId}
              item={item}
              metadata={saveMetadata}
              onSaveChange={onSaveChange}
            />
          </div>
          {canReport && reportDate && saveMetadata && (
            <div className={styles.reportWrap} onMouseDown={event => event.stopPropagation()}>
              <DailyImageReport
                date={reportDate}
                imageId={item.archiveImageId || item.id}
                imageTitle={item.title}
                actorName={saveMetadata.actorName}
                vibeLabel={saveMetadata.vibeLabel}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
