import React from 'react';
import { SaveButton } from '../SaveButton/SaveButton';
import styles from './GridItem.module.css';

interface GridItemProps {
  id: string;
  title: string;
  thumbnail: string;
  publisher?: string;
  url: string;
}

export const GridItem: React.FC<GridItemProps> = ({ id, title, thumbnail, publisher, url }) => {
  const handleClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={styles.gridItem}
      onClick={handleClick}
      onKeyPress={handleKeyPress}
      tabIndex={0}
      role="link"
      aria-label={`${title}${publisher ? ` by ${publisher}` : ''}`}
    >
      <img src={thumbnail} alt={title} className={styles.thumbnail} loading="lazy" />
      <SaveButton itemId={id} />
      <h3 className={styles.title}>{title}</h3>
      {publisher && <p className={styles.publisher}>{publisher}</p>}
    </div>
  );
};
