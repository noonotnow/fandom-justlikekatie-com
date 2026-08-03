import type React from 'react';
import type { ImageTier } from '../../types';
import styles from './WholeCardTierControls.module.css';

interface WholeCardTierControlsProps {
  tier: ImageTier;
  onTierChange: (tier: ImageTier) => void;
}

/**
 * Whole-board (share-card) tier classification.
 *
 * Marks the *entire* generated 3×3 board/export as Misprint or Legendary —
 * distinct from the per-image tier controls in the Lightbox, which only
 * classify a single source image. Selecting the active tier again clears
 * it back to Standard/automatic, mirroring the Lightbox's toggle behavior.
 */
export const WholeCardTierControls: React.FC<WholeCardTierControlsProps> = ({
  tier,
  onTierChange,
}) => {
  return (
    <div
      className={styles.tierControls}
      role="group"
      aria-label="Board edition — classifies the whole exported share card, not a single image"
    >
      <span className={styles.label}>
        整卡分类 <span className={styles.labelEn}>Board edition</span>
      </span>
      <div className={styles.buttons}>
        <button
          type="button"
          className={`${styles.tierButton} ${styles.misprint} ${tier === 'misprint' ? styles.tierActive : ''}`}
          aria-pressed={tier === 'misprint'}
          onClick={() => onTierChange(tier === 'misprint' ? null : 'misprint')}
        >
          🫠 错版 <span>Misprint</span>
        </button>
        <button
          type="button"
          className={`${styles.tierButton} ${styles.legendary} ${tier === 'legendary' ? styles.tierActive : ''}`}
          aria-pressed={tier === 'legendary'}
          onClick={() => onTierChange(tier === 'legendary' ? null : 'legendary')}
        >
          🔥 传说 <span>Legendary</span>
        </button>
      </div>
    </div>
  );
};

/**
 * Live preview chip confirming the selected whole-board tier before export.
 *
 * Rendered in normal flow next to the tier controls (not absolutely
 * overlaid on the grid) so it can never collide with each image's own
 * per-item Save button — both otherwise want the same top-right corner.
 * `aria-hidden` because the triggering button's `aria-pressed` state
 * already announces the selection; this is a sighted-user confirmation.
 */
export const WholeCardTierBadge: React.FC<{ tier: ImageTier }> = ({ tier }) => {
  if (!tier) return null;

  const label = tier === 'misprint' ? 'Misprint board · 整卡错版' : 'Legendary board · 整卡传说';

  return (
    <div className={`${styles.previewBadge} ${styles[tier]}`} aria-hidden="true">
      <img
        src={`/assets/cards/badges/${tier}.svg`}
        alt=""
        width={22}
        height={22}
      />
      <span>{label}</span>
    </div>
  );
};
