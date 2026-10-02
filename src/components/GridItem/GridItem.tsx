import React from 'react';
import type { GridItemData, ImageTier } from '../../types';
import type { SaveItemMetadata } from '../../hooks/useSaveItem';
import { SaveButton } from '../SaveButton/SaveButton';
import styles from './GridItem.module.css';
import { useLocale } from '../../i18n/LocaleProvider';

interface GridItemProps {
  id: string;
  title: string;
  thumbnail: string;
  publisher?: string;
  url: string;
  archiveDate?: string;
  archiveImageId?: string;
  batchKey?: string;
  gridPosition?: number;
  onImageClick?: () => void;
  onSaveChange?: (saved: boolean) => void;
  saveMetadata?: SaveItemMetadata;
  tier?: ImageTier;
}

export const GridItem: React.FC<GridItemProps> = ({
  id,
  title,
  thumbnail,
  url,
  publisher,
  archiveDate,
  archiveImageId,
  batchKey,
  gridPosition,
  onImageClick,
  onSaveChange,
  saveMetadata,
  tier,
}) => {
  const { t } = useLocale();
  const item: GridItemData = {
    id,
    title,
    thumbnail,
    url,
    ...(publisher ? { publisher } : {}),
    ...(archiveDate ? { archiveDate } : {}),
    ...(archiveImageId ? { archiveImageId } : {}),
    ...(batchKey ? { batchKey } : {}),
    ...(gridPosition !== undefined ? { gridPosition } : {}),
  };
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
      aria-label={t(`View ${title}${publisher ? ` by ${publisher}` : ''}`, `查看图片（来源原标题）：${title}${publisher ? `；来源：${publisher}` : ''}`)}
    >
      <img src={thumbnail} alt={title} className={styles.thumbnail} loading="lazy" />
      {tier && (
        <span className={`${styles.tierBadge} ${styles[tier]}`}>
          {tier === 'legendary' ? t('🔥 Legendary', '🔥 传说') : t('🫠 Misprint', '🫠 错版')}
        </span>
      )}
      <SaveButton
        itemId={id}
        archiveDate={archiveDate}
        archiveImageId={archiveImageId}
        item={item}
        metadata={saveMetadata}
        onSaveChange={onSaveChange}
      />
      <h3 className={styles.title}>{title}</h3>
      {publisher && <p className={styles.publisher}>{publisher}</p>}
    </div>
  );
};
