import React from 'react';
import type { EditorialSet } from '../../types';
import styles from './EditorialGroup.module.css';

interface EditorialGroupHeaderProps {
  set: EditorialSet;
}

/**
 * Header row inserted above an editorial set in the grid.
 * Shows set label, item count, pose variety and cohesion scores.
 */
export const EditorialGroupHeader: React.FC<EditorialGroupHeaderProps> = ({ set }) => {
  const varietyClass = set.poseVarietyScore >= 0.7
    ? styles.chipHigh
    : set.poseVarietyScore <= 0.3
      ? styles.chipLow
      : '';

  return (
    <div className={styles.groupHeader}>
      <h3 className={styles.groupLabel}>{set.label}</h3>
      <span className={`${styles.badge} ${styles.badgeEditorial}`}>
        Editorial Set · {set.itemIds.length} photos
      </span>
      <div className={styles.scoreChips}>
        <span className={`${styles.chip} ${varietyClass}`}>
          Pose Variety: {Math.round(set.poseVarietyScore * 100)}%
        </span>
        <span className={styles.chip}>
          Cohesion: {Math.round(set.cohesionScore * 100)}%
        </span>
      </div>
    </div>
  );
};
