import React from 'react';
import type { GridItemData } from '../../types';
import { useSaveItem, type SaveItemMetadata } from '../../hooks/useSaveItem';
import { vibeAtlasPath } from '../../utils/fandomRoutes';
import { Toast } from '../Toast/Toast';
import styles from './SaveButton.module.css';

interface SaveButtonProps {
  itemId: string;
  archiveDate?: string;
  archiveImageId?: string;
  item?: GridItemData;
  metadata?: SaveItemMetadata;
  onClick?: (e: React.MouseEvent) => void;
  onSaveChange?: (saved: boolean) => void;
}

export const SaveButton: React.FC<SaveButtonProps> = ({
  itemId,
  archiveDate,
  archiveImageId,
  item,
  metadata,
  onClick,
  onSaveChange,
}) => {
  const {
    isSaved,
    isLegacySaved,
    isSavedStateLoading,
    isLoading,
    toggleSave,
    showToast,
    toastMessage,
    hideToast,
    archiveSaveFailure,
  } = useSaveItem(itemId, archiveDate, archiveImageId, item, metadata);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const saved = await toggleSave();
    if (saved !== undefined) onSaveChange?.(saved);
    onClick?.(e);
  };

  const retrySave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const saved = await toggleSave();
    if (saved !== undefined) onSaveChange?.(saved);
  };

  return (
    <>
      <button
        className={`${styles.saveButton} ${isSaved ? styles.saved : ''}`}
        onClick={handleClick}
        disabled={isLoading || isSavedStateLoading}
        aria-label={isLegacySaved ? 'Add to Collection' : isSaved ? 'Remove from saved' : 'Save item'}
        aria-pressed={isSaved}
        title={isLegacySaved ? 'Add to Collection' : isSaved ? 'Remove from saved' : 'Save item'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={isSaved && !isLegacySaved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      {archiveSaveFailure && (
        <div className={styles.saveNotice} role="alert">
          <span>
            {archiveSaveFailure === 'sign_in'
              ? 'Sign in before saving this edition’s cards.'
              : archiveSaveFailure === 'upgrade'
                ? 'Older edition card saves are a Collector benefit.'
                : 'We could not verify this card. Your save was not changed.'}
          </span>
          {archiveSaveFailure === 'retry' ? (
            <button type="button" onClick={retrySave} disabled={isLoading}>Try again</button>
          ) : (
            <a href={vibeAtlasPath({ view: 'membership' })} onClick={e => e.stopPropagation()}>
              {archiveSaveFailure === 'sign_in' ? 'Sign in' : 'See Collector options'}
            </a>
          )}
        </div>
      )}
      {showToast && <Toast message={toastMessage} onClose={hideToast} />}
    </>
  );
};
