import React from 'react';
import type { ImageTier } from '../../types';
import { SaveButton } from '../SaveButton/SaveButton';
import styles from './GridItem.module.css';

interface GridItemProps {
  id: string;
  title: string;
  thumbnail: string;
  publisher?: string;
  url: string;
  onImageClick?: () => void;
  tier?: ImageTier;
}

export const GridItem: React.FC<GridItemProps> = ({ id, title, thumbnail, publisher, onImageClick, tier }) => {
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
      {tier && (
        <span className={`${styles.tierBadge} ${styles[tier]}`}>
          {tier === 'legendary' ? '🔥 传说' : '🫠 错版'}
        </span>
      )}
      <SaveButton itemId={id} />
      <h3 className={styles.title}>{title}</h3>
      {publisher && <p className={styles.publisher}>{publisher}</p>}
    </div>
  );
};
