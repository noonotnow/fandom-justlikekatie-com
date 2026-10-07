import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GridItemData, ImageTier } from '../../types';
import type { StarOfDayData } from '../../hooks/useStarOfDay';
import { ExportCardButton, type ExportCardMetadata } from '../ExportCardButton/ExportCardButton';
import { dbSaveCard, dbRemoveCard, dbIsCardSaved } from '../../utils/collectionDB';
import { storage } from '../../utils/storage';
import { schedulePublicCollectionSync } from '../../utils/publicAccount';
import { useLocale } from '../../i18n/LocaleProvider';
import { ArchiveImageSaveError, authorizeArchiveImageSave } from '../../utils/archiveImageSave';
import { trackArchiveCardSaveOutcome } from '../../utils/analytics';
import { vibeAtlasPath } from '../../utils/fandomRoutes';
import { notifySavedItemChanged } from '../../hooks/useSaveItem';
import styles from './Lightbox.module.css';
import { DailyImageReport } from './DailyImageReport';

const SWIPE_THRESHOLD = 50;

interface LightboxProps {
  /** Only the current grid's images — NOT all search results */
  images: GridItemData[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  /** Metadata for individual card export */
  cardMetadata?: ExportCardMetadata;
  planData?: StarOfDayData;
  tier: ImageTier;
  onTierChange: (tier: ImageTier) => void;
  recoverDailyReport?: boolean;
  onDailyReportRecovered?: () => void;
}

export const Lightbox: React.FC<LightboxProps> = ({
  images,
  currentIndex,
  onClose,
  onNavigate,
  cardMetadata,
  planData,
  tier,
  onTierChange,
  recoverDailyReport = false,
  onDailyReportRecovered,
}) => {
  const { t, path } = useLocale();
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
    return Array.from(overlayRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
      )).filter(element => element.getClientRects().length > 0);
  }, []);

  // Keyboard navigation + focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const isEditing = target instanceof HTMLElement && (
        target.isContentEditable
        || target.matches('input, select, textarea, [role="textbox"]')
      );
      switch (e.key) {
        case 'ArrowRight':
          if (isEditing) return;
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
          if (isEditing) return;
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
  const [isLegacySaved, setIsLegacySaved] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveFailure, setSaveFailure] = useState<'sign_in' | 'upgrade' | 'retry' | 'local' | null>(null);
  const saveInFlight = useRef(false);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    dbIsCardSaved(current.thumbnail).then((inDB) => {
      if (cancelled) return;
      if (inDB) {
        setIsSaved(true);
        setIsLegacySaved(false);
      } else {
        const inLegacy = storage.isItemSaved(current.id);
        setIsSaved(false);
        setIsLegacySaved(inLegacy);
      }
    });
    return () => { cancelled = true; };
  }, [current]);


  async function handleSave() {
    if (!current || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaveBusy(true);
    setSaveFailure(null);
    let archiveAuthorized = false;

    const cardPayload = {
      imageUrl: current.thumbnail,
      thumbnailUrl: current.thumbnail,
      resultId: current.id,
      actorId: planData?.actorId,
      sourceUrl: current.url,
      title: current.title,
      publisher: current.publisher,
      searchQuery: current.batchKey,
      actor: cardMetadata?.actorName ?? 'Unknown',
      actorEn: planData?.actorShortNameEn ?? cardMetadata?.actorName ?? 'Unknown',
      vibe: cardMetadata?.vibeLabel ?? 'Unknown',
      vibeEn: cardMetadata?.vibeLabelEn ?? 'Unknown',
      vibeEmoji: cardMetadata?.vibeEmoji ?? '✨',
      capturedDate: cardMetadata?.date ?? new Date().toISOString().split('T')[0],
      collectionScope: 'vibe-atlas' as const,
      gridContext: {
        batchKey: current.batchKey,
        position: current.gridPosition ?? currentIndex,
      },
    };

    try {
      if (isLegacySaved) {
        // Keep the old bookmark unless the server authorizes and promotion
        // succeeds. current.id is the raw published result identity.
        if (planData?.date) {
          await authorizeArchiveImageSave(
            planData.date,
            current.archiveImageId || current.id,
            current.gridPosition ?? currentIndex,
          );
          archiveAuthorized = true;
        }
        await dbSaveCard(cardPayload);
        if (archiveAuthorized) {
          trackArchiveCardSaveOutcome('saved', planData!.date);
          archiveAuthorized = false;
        }
        storage.removeItem(current.id);
        setIsLegacySaved(false);
        setIsSaved(true);
        if (navigator.vibrate) navigator.vibrate(50);
      } else if (isSaved) {
        // A removal never depends on the current age or membership boundary.
        await dbRemoveCard(current.thumbnail);
        storage.removeItem(current.id);
        setIsSaved(false);
      } else {
        if (planData?.date) {
          await authorizeArchiveImageSave(
            planData.date,
            current.archiveImageId || current.id,
            current.gridPosition ?? currentIndex,
          );
          archiveAuthorized = true;
        }
        await dbSaveCard(cardPayload);
        if (archiveAuthorized) {
          trackArchiveCardSaveOutcome('saved', planData!.date);
          archiveAuthorized = false;
        }
        setIsSaved(true);
        if (navigator.vibrate) navigator.vibrate(50);
      }
      notifySavedItemChanged(current.thumbnail);
      schedulePublicCollectionSync();
    } catch (error) {
      if (archiveAuthorized) trackArchiveCardSaveOutcome('persistence_failed', planData!.date);
      setSaveFailure(error instanceof ArchiveImageSaveError ? error.failure : 'local');
    } finally {
      saveInFlight.current = false;
      setSaveBusy(false);
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
      aria-label={`${t('Image viewer', '图片查看器')}: ${current.title}`}
    >
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          ref={closeButtonRef}
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t('Close lightbox', '关闭图片查看器')}
        >
          ✕
        </button>

        {/* Navigation arrows */}
        <button
          className={`${styles.navBtn} ${styles.navPrev}`}
          onClick={goPrev}
          aria-label={t('Previous image', '上一张图片')}
        >
          ‹
        </button>
        <button
          className={`${styles.navBtn} ${styles.navNext}`}
          onClick={goNext}
          aria-label={t('Next image', '下一张图片')}
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
          <>
            <div className={styles.tierControls} aria-label={t('Image card edition', '图片卡版本')}>
              <button
                type="button"
                className={`${styles.tierButton} ${styles.misprint} ${tier === 'misprint' ? styles.tierActive : ''}`}
                aria-pressed={tier === 'misprint'}
                onClick={() => onTierChange(tier === 'misprint' ? null : 'misprint')}
              >
                {t('🫠 Misprint', '🫠 错版')}
              </button>
              <button
                type="button"
                className={`${styles.tierButton} ${styles.legendary} ${tier === 'legendary' ? styles.tierActive : ''}`}
                aria-pressed={tier === 'legendary'}
                onClick={() => onTierChange(tier === 'legendary' ? null : 'legendary')}
              >
                {t('🔥 Legendary', '🔥 传说')}
              </button>
            </div>
            <div className={styles.actions}>
              <ExportCardButton
                image={current}
                metadata={{ ...cardMetadata, tier }}
                planData={planData}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <button
                  onClick={handleSave}
                  disabled={saveBusy}
                  title={isLegacySaved ? t('Add to Collection', '加入收藏') : isSaved ? t('Remove from collection', '从收藏中移除') : t('Save to collection', '保存到收藏')}
                  aria-label={isLegacySaved ? t('Add to Collection', '加入收藏') : isSaved ? t('Unsave', '取消收藏') : t('Save to collection', '保存到收藏')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.4rem',
                    lineHeight: 1,
                    color: isSaved ? '#c9a96e' : isLegacySaved ? '#888888' : 'currentColor',
                    opacity: (isSaved || isLegacySaved) ? 1 : 0.6,
                    transition: 'color 0.15s, opacity 0.15s',
                  }}
                >
                  {isSaved || isLegacySaved ? '★' : '☆'}
                </button>
                {isLegacySaved && (
                  <span style={{ fontSize: '0.6rem', color: '#888888', whiteSpace: 'nowrap' }}>
                    之前已收藏 · 点击加入收藏
                  </span>
                )}
                {saveFailure && (
                  <span className={styles.saveNotice} role="alert">
                    {saveFailure === 'sign_in'
                      ? <>{t('Sign in before saving this edition’s cards.', '请先登录，再保存本期卡片。')} <a href={path(vibeAtlasPath({ view: 'membership' }))}>{t('Sign in', '登录')}</a></>
                      : saveFailure === 'upgrade'
                        ? <>{t('Older edition card saves are a Collector benefit.', '保存较早期卡组中的单张卡片，需要收藏会员权限。')} <a href={path(vibeAtlasPath({ view: 'membership' }))}>{t('See Collector options', '查看收藏会员方案')}</a></>
                        : saveFailure === 'retry'
                          ? <>{t('We could not verify this card; your save was not changed.', '暂时无法核验这张卡片，原有收藏未改动。')} <button type="button" onClick={() => void handleSave()} disabled={saveBusy}>{t('Try again', '重试')}</button></>
                          : <>{t('Could not update this save; please try again.', '未能更新这项收藏，请重试。')} <button type="button" onClick={() => void handleSave()} disabled={saveBusy}>{t('Try again', '重试')}</button></>}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {planData?.date && (
          <DailyImageReport
            key={`${planData.date}:${current.archiveImageId || current.id}`}
            date={planData.date}
            imageId={current.archiveImageId || current.id}
            imageTitle={current.title}
            actorName={cardMetadata?.actorName ?? planData.actorName}
            vibeLabel={cardMetadata?.vibeLabel ?? planData.vibeLabel}
            recoverAfterAuth={recoverDailyReport}
            onRecoveryComplete={onDailyReportRecovered}
          />
        )}

        {/* Thumbnail strip */}
        <div className={styles.thumbStrip} role="list" aria-label={t('Image thumbnails', '图片缩略图')}>
          {images.map((img, idx) => (
            <button
              key={img.id}
              className={`${styles.thumb} ${idx === currentIndex ? styles.thumbActive : ''}`}
              onClick={() => onNavigate(idx)}
              aria-label={`${t('Go to image', '查看第')} ${idx + 1}: ${img.title}`}
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
