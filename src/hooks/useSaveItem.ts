import { useState, useEffect, useCallback, useRef } from 'react';
import { storage } from '../utils/storage';
import { ArchiveImageSaveError, authorizeArchiveImageSave } from '../utils/archiveImageSave';

export const useSaveItem = (itemId: string, archiveDate?: string, archiveImageId?: string) => {
  const [isSaved, setIsSaved] = useState(() => storage.isItemSaved(itemId));
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [archiveSaveFailure, setArchiveSaveFailure] = useState<ArchiveImageSaveError['failure'] | null>(null);
  const saveInFlight = useRef(false);

  useEffect(() => {
    const handleStorageChange = () => {
      setIsSaved(storage.isItemSaved(itemId));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [itemId]);

  const toggleSave = useCallback(async (): Promise<boolean | undefined> => {
    if (saveInFlight.current) return undefined;
    saveInFlight.current = true;
    const newSavedState = !isSaved;
    setIsLoading(true);
    setArchiveSaveFailure(null);

    try {
      if (newSavedState) {
        // Do not change local storage until the authoritative archive decision
        // confirms that this exact edition/image pair is saveable.
        if (archiveDate) await authorizeArchiveImageSave(archiveDate, archiveImageId || itemId);
        storage.saveItem(itemId);
        setToastMessage('Saved!');
      } else {
        storage.removeItem(itemId);
        setToastMessage('Removed from saved');
      }

      setIsSaved(newSavedState);
      setShowToast(true);

      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      return newSavedState;
    } catch (error) {
      if (error instanceof ArchiveImageSaveError) {
        setArchiveSaveFailure(error.failure);
      } else {
        setToastMessage('Could not update this save. Please try again.');
        setShowToast(true);
      }
      return undefined;
    } finally {
      saveInFlight.current = false;
      setIsLoading(false);
    }
  }, [archiveDate, archiveImageId, isSaved, itemId]);

  const hideToast = useCallback(() => {
    setShowToast(false);
  }, []);

  return { isSaved, isLoading, toggleSave, showToast, toastMessage, hideToast, archiveSaveFailure };
};
