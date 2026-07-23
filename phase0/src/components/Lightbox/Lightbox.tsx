import { useState, useEffect, useCallback, useRef } from 'react';
import type { GridItemData } from '../../types';
import { ExportCardButton, type ExportCardMetadata } from '../ExportCardButton/ExportCardButton';
import { dbSaveCard, dbRemoveCard, dbIsCardSaved } from '../../utils/collectionDB';
import styles from './Lightbox.module.css';

const SWIPE_THRESHOLD = 50;

interface LightboxProps {
  /** Only the current grid's images — NOT all search results */
  images: GridItemData[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  /** Metadata for individual card export */
  cardMetadata?: ExportCardMetadata;
}

export const Lightbox: React.FC<LightboxProps> = ({
  images,
  currentIndex,
  onClose,
  onNavigate,
  cardMetadata,
}) => {
  const total = images.length;
  const current = images[currentIndex];
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const goNext = useCallback(() => {
    onNavigate((currentIndex + 1) % total);
  }, [currentIndex, total, onNavigate]);

  const goPrev = useCallback(() => {
    onNavigate((currentIndex - 1 + total) % total);
  }, [currentIndex, total, onNavigate]);

  // Focus trap: collect all focusable elements inside the lightbox
  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!overlayRef.current) return [];
    return Array.from(
      overlayRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex="0"]'
      )
    );
  }, []);

  // Keyboard navigation + focus trap
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
        case 'Tab': {
          // Focus trap: wrap around within the lightbox
          const focusable = getFocusableElements();
          if (focusable.length === 0) {
            e.preventDefault();
            break;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, onClose, getFocusableElements]);

  // Lock body scroll + manage focus on mount/unmount
  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    // Focus the close button on open
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = '';
      // Restore focus to the element that opened the lightbox
      previousActiveElement.current?.focus();
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

  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    dbIsCardSaved(current.thumbnail).then((saved) => {
      if (!cancelled) setIsSaved(saved);
    });
    return () => { cancelled = true; };
  }, [current?.thumbnail]);

  async function handleSave() {
    if (!current) return;
    if (isSaved) {
      await dbRemoveCard(current.thumbnail);
      setIsSaved(false);
    } else {
      await dbSaveCard({
        imageUrl: current.thumbnail,
        thumbnailUrl: current.thumbnail,
        actor: cardMetadata?.actorName ?? 'Unknown',
        actorEn: cardMetadata?.actorName ?? 'Unknown',
        vibe: cardMetadata?.vibeLabel ?? 'Unknown',
        vibeEn: cardMetadata?.vibeLabelEn ?? 'Unknown',
        vibeEmoji: cardMetadata?.vibeEmoji ?? '✨',
        capturedDate: cardMetadata?.date ?? new Date().toISOString().split('T')[0],
        gridContext: {
          batchKey: current.batchKey,
          position: current.gridPosition ?? currentIndex,
        },
      });
      setIsSaved(true);
      if (navigator.vibrate) navigator.vibrate(50);
    }
  }

  if (!current) return null;

  return (
    <div
      ref={overlayRef}
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
          ref={closeButtonRef}
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

        {/* Export card action */}
        {cardMetadata && (
          <div className={styles.actions} style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <ExportCardButton image={current} metadata={cardMetadata} />
            <button
              onClick={handleSave}
              title={isSaved ? 'Remove from collection' : 'Save to collection'}
              aria-label={isSaved ? 'Unsave' : 'Save to collection'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.4rem',
                lineHeight: 1,
                color: isSaved ? '#c9a96e' : 'currentColor',
                opacity: isSaved ? 1 : 0.6,
                transition: 'color 0.15s, opacity 0.15s',
              }}
            >
              {isSaved ? '★' : '☆'}
            </button>
          </div>
        )}

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
