import { useState, useEffect, useCallback, useRef } from 'react';
import type { GridItemData } from '../types';
import {
  dbIsCardSaved,
  dbRemoveCard,
  dbSaveCard,
  type CardRecord,
} from '../utils/collectionDB';
import { schedulePublicCollectionSync } from '../utils/publicAccount';
import { storage } from '../utils/storage';
import { ArchiveImageSaveError, authorizeArchiveImageSave } from '../utils/archiveImageSave';
import { translate } from '../i18n/locale';
import { trackArchiveCardSaveOutcome } from '../utils/analytics';

const SAVE_ITEM_STATE_CHANGE_EVENT = 'fandom-save-item-state-change';
const saveItemStateVersions = new Map<string, number>();

function saveItemStateVersion(imageKey: string): number {
  return saveItemStateVersions.get(imageKey) || 0;
}

function advanceSaveItemStateVersion(imageKey: string): void {
  saveItemStateVersions.set(imageKey, saveItemStateVersion(imageKey) + 1);
}

export function notifySavedItemChanged(imageKey: string): void {
  advanceSaveItemStateVersion(imageKey);
  window.dispatchEvent(new CustomEvent(SAVE_ITEM_STATE_CHANGE_EVENT, { detail: imageKey }));
}

export interface SaveItemMetadata {
  actorId?: string;
  actorName: string;
  actorNameEn: string;
  vibeLabel: string;
  vibeLabelEn: string;
  vibeEmoji: string;
  date: string;
}

export const useSaveItem = (
  itemId: string,
  archiveDate?: string,
  archiveImageId?: string,
  item?: GridItemData,
  metadata?: SaveItemMetadata,
) => {
  const [isSaved, setIsSaved] = useState(() => storage.isItemSaved(itemId));
  const [isLegacySaved, setIsLegacySaved] = useState(() => storage.isItemSaved(itemId));
  const [isSavedStateLoading, setIsSavedStateLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [archiveSaveFailure, setArchiveSaveFailure] = useState<ArchiveImageSaveError['failure'] | null>(null);
  const saveInFlight = useRef(false);
  const imageKey = item?.thumbnail || itemId;

  useEffect(() => {
    let cancelled = false;
    const refreshSavedState = async () => {
      const startingVersion = saveItemStateVersion(imageKey);
      try {
        const inCollection = await dbIsCardSaved(imageKey);
        if (cancelled || startingVersion !== saveItemStateVersion(imageKey)) return;
        const legacySaved = storage.isItemSaved(itemId);
        setIsSaved(inCollection || legacySaved);
        setIsLegacySaved(!inCollection && legacySaved);
        setIsSavedStateLoading(false);
      } catch {
        if (cancelled || startingVersion !== saveItemStateVersion(imageKey)) return;
        const legacySaved = storage.isItemSaved(itemId);
        setIsSaved(legacySaved);
        setIsLegacySaved(legacySaved);
        setToastMessage(translate('Could not check this saved card. Please try again.', '无法检查这张卡片的收藏状态，请重试。'));
        setShowToast(true);
        setIsSavedStateLoading(false);
      }
    };
    const handleStorageChange = () => { void refreshSavedState(); };
    const handleSavedItemChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === imageKey) void refreshSavedState();
    };
    void refreshSavedState();
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(SAVE_ITEM_STATE_CHANGE_EVENT, handleSavedItemChange);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(SAVE_ITEM_STATE_CHANGE_EVENT, handleSavedItemChange);
    };
  }, [imageKey, itemId]);

  const toggleSave = useCallback(async (): Promise<boolean | undefined> => {
    if (saveInFlight.current) return undefined;
    saveInFlight.current = true;
    advanceSaveItemStateVersion(imageKey);
    const newSavedState = isLegacySaved || !isSaved;
    setIsLoading(true);
    setArchiveSaveFailure(null);
    let archiveAuthorized = false;

    try {
      let nextToastMessage = translate('Saved to Collection!', '已保存到收藏！');
      if (newSavedState) {
        // Authorization must succeed before either local persistence path is
        // touched. Store the same card record consumed by My Collection.
        if (archiveDate) {
          await authorizeArchiveImageSave(
            archiveDate,
            archiveImageId || itemId,
            item?.gridPosition,
          );
          archiveAuthorized = true;
        }
        const card: CardRecord = {
          imageUrl: item?.thumbnail || itemId,
          thumbnailUrl: item?.thumbnail || itemId,
          resultId: itemId,
          ...(metadata?.actorId ? { actorId: metadata.actorId } : {}),
          ...(item?.url ? { sourceUrl: item.url } : {}),
          ...(item?.title ? { title: item.title } : {}),
          ...(item?.publisher ? { publisher: item.publisher } : {}),
          ...(item?.batchKey ? { searchQuery: item.batchKey } : {}),
          actor: metadata?.actorName ?? 'Unknown',
          actorEn: metadata?.actorNameEn ?? metadata?.actorName ?? 'Unknown',
          vibe: metadata?.vibeLabel ?? 'Unknown',
          vibeEn: metadata?.vibeLabelEn ?? 'Unknown',
          vibeEmoji: metadata?.vibeEmoji ?? '✨',
          capturedDate: metadata?.date ?? new Date().toISOString().split('T')[0],
          collectionScope: 'vibe-atlas',
          ...(item ? {
            gridContext: {
              ...(item.batchKey ? { batchKey: item.batchKey } : {}),
              position: item.gridPosition ?? 0,
            },
          } : {}),
        };
        await dbSaveCard(card);
        if (archiveAuthorized) {
          trackArchiveCardSaveOutcome('saved', archiveDate!);
          archiveAuthorized = false;
        }
        setIsSaved(true);
        setIsLegacySaved(false);
        if (isLegacySaved) {
          try {
            storage.removeItem(itemId);
          } catch {
            nextToastMessage = translate('Added to Collection on this device, but the old bookmark could not be removed.', '已加入本机收藏，但旧书签未能移除。');
          }
        }
      } else {
        storage.removeItem(itemId);
        await dbRemoveCard(item?.thumbnail || itemId);
        nextToastMessage = translate('Removed from Collection', '已从收藏中移除');
      }

      setIsSaved(newSavedState);
      setIsLegacySaved(false);
      setToastMessage(nextToastMessage);
      setShowToast(true);
      notifySavedItemChanged(imageKey);
      schedulePublicCollectionSync();

      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      return newSavedState;
    } catch (error) {
      if (archiveAuthorized) trackArchiveCardSaveOutcome('persistence_failed', archiveDate!);
      advanceSaveItemStateVersion(imageKey);
      if (error instanceof ArchiveImageSaveError) {
        setArchiveSaveFailure(error.failure);
      } else {
        setToastMessage(translate('Could not update this save. Please try again.', '未能更新这项收藏，请重试。'));
        setShowToast(true);
      }
      return undefined;
    } finally {
      saveInFlight.current = false;
      setIsLoading(false);
      setIsSavedStateLoading(false);
    }
  }, [archiveDate, archiveImageId, imageKey, isLegacySaved, isSaved, item, itemId, metadata]);

  const hideToast = useCallback(() => {
    setShowToast(false);
  }, []);

  return {
    isSaved,
    isLegacySaved,
    isSavedStateLoading,
    isLoading,
    toggleSave,
    showToast,
    toastMessage,
    hideToast,
    archiveSaveFailure,
  };
};
