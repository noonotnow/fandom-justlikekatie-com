import { useEffect, useCallback, useRef } from 'react';
import type { GridItemData } from '../../types';
import styles from './Lightbox.module.css';

const SWIPE_THRESHOLD = 50;

interface LightboxProps {
  /** Only the current grid's images — NOT all search results */
  images: GridItemData[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export const Lightbox: React.FC<LightboxProps> = ({
  images,
  currentIndex,
  onClose,
  onNavigate,
}) => {
  const total = images.length;
  const current = images[currentIndex];
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const goNext = useCallback(() => {
    onNavigate((currentIndex + 1) % total);
  }, [currentIndex, total, onNavigate]);

  const goPrev = useCallback(() => {
    onNavigate((currentIndex - 1 + total) % total);
  }, [currentIndex, total, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Touch/swipe handlers for mobile navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;

      // Only trigger if horizontal swipe is dominant
      if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) {
          goNext();
        } else {
          goPrev();
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
    },
    [goNext, goPrev],
  );

  if (!current) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer: ${current.title}`}
    >
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close lightbox"
        >
          ✕
        </button>

        {/* Navigation arrows */}
        <button
          className={`${styles.navBtn} ${styles.navPrev}`}
          onClick={goPrev}
          aria-label="Previous image"
        >
          ‹
        </button>
        <button
          className={`${styles.navBtn} ${styles.navNext}`}
          onClick={goNext}
          aria-label="Next image"
        >
          ›
        </button>

        {/* Main image */}
        <img
          className={styles.mainImage}
          src={current.thumbnail}
          alt={current.title}
        />

        {/* Counter */}
        <div className={styles.counter}>
          {currentIndex + 1} / {total}
        </div>

        {/* Info */}
        <div className={styles.info}>
          <h2 className={styles.title}>{current.title}</h2>
          {current.publisher && (
            <p className={styles.publisher}>{current.publisher}</p>
          )}
        </div>

        {/* Thumbnail strip */}
        <div className={styles.thumbStrip} role="list" aria-label="Image thumbnails">
          {images.map((img, idx) => (
            <button
              key={img.id}
              className={`${styles.thumb} ${idx === currentIndex ? styles.thumbActive : ''}`}
              onClick={() => onNavigate(idx)}
              aria-label={`Go to image ${idx + 1}: ${img.title}`}
              role="listitem"
            >
              <img src={img.thumbnail} alt={img.title} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
