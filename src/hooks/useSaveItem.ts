import { useState, useEffect, useCallback } from 'react';
import { storage } from '../utils/storage';

export const useSaveItem = (itemId: string) => {
  const [isSaved, setIsSaved] = useState(() => storage.isItemSaved(itemId));
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleStorageChange = () => {
      setIsSaved(storage.isItemSaved(itemId));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [itemId]);

  const toggleSave = useCallback(async () => {
    const newSavedState = !isSaved;
    setIsSaved(newSavedState);
    setIsLoading(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 100));

      if (newSavedState) {
        storage.saveItem(itemId);
        setToastMessage('Saved!');
      } else {
        storage.removeItem(itemId);
        setToastMessage('Removed from saved');
      }

      setShowToast(true);

      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      setIsSaved(!newSavedState);
      setToastMessage('Failed to save. Try again.');
      setShowToast(true);
      console.error('Save failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isSaved, itemId]);

  const hideToast = useCallback(() => {
    setShowToast(false);
  }, []);

  return { isSaved, isLoading, toggleSave, showToast, toastMessage, hideToast };
};
