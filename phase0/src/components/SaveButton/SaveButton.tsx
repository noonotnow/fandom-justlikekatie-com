import React from 'react';
import { useSaveItem } from '../../hooks/useSaveItem';
import { Toast } from '../Toast/Toast';
import styles from './SaveButton.module.css';

interface SaveButtonProps {
  itemId: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const SaveButton: React.FC<SaveButtonProps> = ({ itemId, onClick }) => {
  const { isSaved, isLoading, toggleSave, showToast, toastMessage, hideToast } = useSaveItem(itemId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSave();
    onClick?.(e);
  };

  return (
    <>
      <button
        className={`${styles.saveButton} ${isSaved ? styles.saved : ''}`}
        onClick={handleClick}
        disabled={isLoading}
        aria-label={isSaved ? 'Remove from saved' : 'Save item'}
        aria-pressed={isSaved}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={isSaved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      {showToast && <Toast message={toastMessage} onClose={hideToast} />}
    </>
  );
};
