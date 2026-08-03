import type { SaveState } from '../types';

const STORAGE_KEY = 'vibe-atlas-saved-items';

export const storage = {
  getSavedItems(): SaveState {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Failed to load saved items:', error);
      return {};
    }
  },

  saveItem(itemId: string): void {
    try {
      const saved = this.getSavedItems();
      saved[itemId] = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: JSON.stringify(saved),
      }));
    } catch (error) {
      console.error('Failed to save item:', error);
      throw error;
    }
  },

  removeItem(itemId: string): void {
    try {
      const saved = this.getSavedItems();
      delete saved[itemId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      window.dispatchEvent(new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: JSON.stringify(saved),
      }));
    } catch (error) {
      console.error('Failed to remove item:', error);
      throw error;
    }
  },

  isItemSaved(itemId: string): boolean {
    const saved = this.getSavedItems();
    return saved[itemId] === true;
  },
};
