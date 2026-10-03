import type React from 'react';
import type { ImageTier } from '../../types';
import { useLocale } from '../../i18n/LocaleProvider';
import styles from './WholeCardTierControls.module.css';

type PersonalLegendaryReason = 'nailed_vibe' | 'every_image_belongs' | 'unforgettable_set';

interface WholeCardTierControlsProps {
  tier: ImageTier;
  onTierChange: (tier: ImageTier) => void;
  reason?: PersonalLegendaryReason | null;
  onReasonChange?: (reason: PersonalLegendaryReason | null) => void;
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
  reason,
  onReasonChange,
}) => {
  const { t } = useLocale();
  return (
    <div
      className={styles.tierControls}
      role="group"
      aria-label={t('Board edition — classifies the whole exported share card, not a single image', '整卡版本分类——用于整张分享卡，而非单张图片')}
    >
      <span className={styles.label}>
        {t('Your board reaction', '你的整卡感受')}
      </span>
      <div className={styles.buttons}>
        <button
          type="button"
          className={`${styles.tierButton} ${styles.misprint} ${tier === 'misprint' ? styles.tierActive : ''}`}
          aria-pressed={tier === 'misprint'}
          onClick={() => onTierChange(tier === 'misprint' ? null : 'misprint')}
        >
          {t('◇ Misprint', '◇ 错版')}
        </button>
        <button
          type="button"
          className={`${styles.tierButton} ${styles.legendary} ${tier === 'legendary' ? styles.tierActive : ''}`}
          aria-pressed={tier === 'legendary'}
          onClick={() => onTierChange(tier === 'legendary' ? null : 'legendary')}
        >
          {t('★ Legendary', '★ 传说')}
        </button>
      </div>
      {tier === 'legendary' && onReasonChange && (
        <label className={styles.reason}>
          <span>{t('Why this one? (optional)', '为什么喜欢这组？（选填）')}</span>
          <select value={reason ?? ''} onChange={event => onReasonChange((event.target.value || null) as PersonalLegendaryReason | null)}>
            <option value="">{t('No reason selected', '不填写原因')}</option>
            <option value="nailed_vibe">{t('Nailed the vibe', '氛围拿捏得刚好')}</option>
            <option value="every_image_belongs">{t('Every image belongs', '每张图都很合适')}</option>
            <option value="unforgettable_set">{t('An unforgettable set', '令人难忘的一组')}</option>
          </select>
        </label>
      )}
      <details className={styles.guide}>
        <summary>{t('What do these labels mean?', '这些标记代表什么？')}</summary>
        <p><strong>{t('Legendary', '传说')}</strong> {t('is your personal appreciation for a strong actor × vibe board—not a vote, community consensus, or editorial approval.', '是你对演员 × 氛围组合的个人喜爱，不代表投票、社群共识或编辑认可。')}</p>
        <p><strong>{t('Misprint', '错版')}</strong> {t('means you noticed something off. It does not report or train anything by itself.', '表示你发现了问题；单独标记不会提交报告或训练系统。')}</p>
        <p><strong>{t('Legendary Misprint', '传说级错版')}</strong> {t('is separate: intentionally preserve a memorable mistake in Collection. It does not change this board or its official edition.', '是另一项操作：在收藏中刻意保留难忘的错版，不会修改本期九宫格或官方版本。')}</p>
        <p>{t('Export labels may also be inferred automatically from the board. Your reaction is personal metadata saved only when you deliberately export/save the grid. It never saves the individual images.', '导出标记也可能由系统根据整组图片自动判断。你的感受仅作为个人信息，在主动导出/保存整组时一并保存；不会保存单张图片。')}</p>
        <p>{t('Pending fan reports are not proof, consensus, or curator learning. Only an operator-reviewed correction can affect future runs.', '待审核的粉丝报告不代表事实、共识或策展学习。只有运营人员审核通过的更正才会影响后续生成。')}</p>
      </details>
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
