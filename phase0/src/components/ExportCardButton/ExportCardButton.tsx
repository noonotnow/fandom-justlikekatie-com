import { useState, useCallback, useEffect } from 'react';
import type { GridItemData } from '../../types';
import { renderCard, type CardMetadata } from '../../utils/cardRenderer';
import { Toast } from '../Toast/Toast';
import styles from './ExportCardButton.module.css';
import { dbAddToPlan, dbRemoveFromPlan, dbIsInPlan } from '../../utils/planDB';

export interface ExportCardMetadata {
  actorName: string;
  vibeEmoji: string;
  vibeLabel: string;
  vibeLabelEn: string;
  date: string;
  accentColor?: string;
}

function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("admin") === "true";
    if (fromUrl) sessionStorage.setItem("fandom_admin", "true");
    setIsAdmin(fromUrl || sessionStorage.getItem("fandom_admin") === "true");
  }, []);
  return isAdmin;
}

interface ExportCardButtonProps {
  image: GridItemData;
  metadata: ExportCardMetadata;
}

export const ExportCardButton: React.FC<ExportCardButtonProps> = ({ image, metadata }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [planToast, setPlanToast] = useState<string | null>(null);
   const isAdmin = useIsAdmin();
  const [isInPlan, setIsInPlan] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dbIsInPlan(image.thumbnail).then((inPlan) => {
      if (!cancelled) setIsInPlan(inPlan);
    });
    return () => { cancelled = true; };
  }, [image.thumbnail]);

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setToastMessage('正在生成卡片……');

    try {
      const cardMeta: CardMetadata = {
        actorName: metadata.actorName,
        vibeEmoji: metadata.vibeEmoji,
        vibeLabel: metadata.vibeLabel,
        vibeLabelEn: metadata.vibeLabelEn,
        date: metadata.date,
        imageUrl: image.thumbnail,
        accentColor: metadata.accentColor,
      };

      const blob = await renderCard(cardMeta);

      // Build filename
      const actorSlug = metadata.actorName
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'star';
      const fileName = `vibe-atlas-${actorSlug}-${metadata.date}.png`;

      // Download
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);

      // Log engagement (fire-and-forget)
      fetch('/.netlify/functions/log-engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'export',
          batchKey: `${metadata.actorName}-${metadata.vibeLabel}-${metadata.date}`,
          imageUrl: image.id,
        }),
      }).catch(() => { /* non-critical */ });

      setToastMessage('卡片已保存 ✓ Card exported!');
    } catch (err) {
      console.error('Export card failed:', err);
      setToastMessage('导出失败，请重试 · Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, image, metadata]);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  const handlePlan = useCallback(async () => {
    if (isInPlan) {
      await dbRemoveFromPlan(image.thumbnail);
      setIsInPlan(false);
      setPlanToast('已移出计划 · Removed from plan');
    } else {
      await dbAddToPlan({
        imageUrl: image.thumbnail,
        thumbnailUrl: image.thumbnail,
        actor: metadata.actorName,
        actorEn: metadata.actorName,
        vibe: metadata.vibeLabel,
        vibeEn: metadata.vibeLabelEn ?? metadata.vibeLabel,
        vibeEmoji: metadata.vibeEmoji,
        capturedDate: metadata.date,
        gridContext: {
          batchKey: image.batchKey,
          position: image.gridPosition ?? 0,
        },
      });
      setIsInPlan(true);
      setPlanToast('已加入计划 ✓ Added to plan!');
    }
  }, [image, metadata, isInPlan]);

  return (
    <>
      <button
        className={styles.exportCardBtn}
        onClick={handleExport}
        disabled={isExporting}
        aria-label="Export individual card"
      >
        <span className={styles.icon}>📥</span>
                 <span className={styles.label}>{isInPlan ? '✓ 已计划' : '加入计划'}</span>
      </button>
      {toastMessage && <Toast message={toastMessage} onClose={dismissToast} />}
      {isAdmin && (
        <button
          className={styles.exportCardBtn}
          onClick={handlePlan}
          aria-label="Send to plan"
        >
          <span className={styles.icon}>📋</span>
          <span className={styles.label}>加入计划</span>
        </button>
      )}
      {planToast && <Toast message={planToast} onClose={() => setPlanToast(null)} />}
    </>
  );
};
