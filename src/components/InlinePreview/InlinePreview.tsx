import React, { useEffect, useRef } from 'react';
import { SaveButton } from '../SaveButton/SaveButton';
import type { GridItemData } from '../../types';
import styles from './InlinePreview.module.css';

interface InlinePreviewProps {
  item: GridItemData;
  isOpen: boolean;
  onClose: () => void;
  onViewFull: () => void;
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
}) => {
  const rowRef = useRef<HTMLDivElement>(null);

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
      aria-label={`Preview of ${item.title}`}
      aria-hidden={!isOpen}
    >
      <div className={styles.arrow} />
      <div className={styles.previewContent}>
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close preview"
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
              View Full Screen
            </button>
            <SaveButton itemId={item.id} />
          </div>
        </div>
      </div>
    </div>
  );
};
