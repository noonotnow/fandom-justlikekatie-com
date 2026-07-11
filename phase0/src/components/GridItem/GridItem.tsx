import React from 'react';
import { SaveButton } from '../SaveButton/SaveButton';
import styles from './GridItem.module.css';

interface GridItemProps {
  id: string;
  title: string;
  thumbnail: string;
  publisher?: string;
  url: string;
  onImageClick?: () => void;
}

export const GridItem: React.FC<GridItemProps> = ({ id, title, thumbnail, publisher, onImageClick }) => {
  const handleClick = () => {
    onImageClick?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={styles.gridItem}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View ${title}${publisher ? ` by ${publisher}` : ''}`}
    >
      <img src={thumbnail} alt={title} className={styles.thumbnail} loading="lazy" />
      <SaveButton itemId={id} />
      <h3 className={styles.title}>{title}</h3>
      {publisher && <p className={styles.publisher}>{publisher}</p>}
    </div>
  );
};
