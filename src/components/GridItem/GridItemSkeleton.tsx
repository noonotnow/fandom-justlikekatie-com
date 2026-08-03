import React from 'react';
import styles from './GridItemSkeleton.module.css';

export const GridItemSkeleton: React.FC = () => {
  return <div className={styles.skeleton} role="presentation" aria-hidden="true" />;
};
